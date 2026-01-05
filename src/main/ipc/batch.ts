/**
 * Batch IPC Handlers
 * Handles batch job submission and status queries
 */

import { ipcMain } from 'electron';
import log from 'electron-log/main';
import { ulid } from 'ulid';
import { IPC_CHANNELS, successResponse, errorResponse } from '../../shared/ipc-channels';
import { getDatabase } from '../database';
import { GeminiService } from '../services/gemini';
import { getApiKey } from './settings';
import { triggerPoll } from '../services/batch-poller';
import * as fs from 'fs';
import * as path from 'path';

interface BatchJobRow {
  id: string;
  gemini_job_id: string | null;
  status: string;
  idea_ids: string;
  mode: string;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

export function registerBatchHandlers(): void {
  /**
   * Submit ideas to batch generation (slow mode)
   * Large batches are automatically chunked to avoid response size limits
   */
  ipcMain.handle(IPC_CHANNELS.BATCH_SUBMIT, async (_event, ideaIds: string[]) => {
    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        return errorResponse('API key not configured');
      }
      
      if (!ideaIds || ideaIds.length === 0) {
        return errorResponse('No ideas provided');
      }
      
      // Max images per batch to avoid response size limits (4K images are ~2-4MB each)
      // 10 images * ~4MB = ~40MB per batch, well under the 400MB limit
      const MAX_BATCH_SIZE = 10;
      
      const db = getDatabase();
      const gemini = new GeminiService(apiKey);
      
      // Get idea details for batch request
      const ideas = ideaIds.map(id => {
        const idea = db.prepare(`
          SELECT id, title, description, skill, category, tags, extended_description
          FROM ideas WHERE id = ?
        `).get(id) as { id: string; title: string; description: string; skill: string; category: string; tags?: string; extended_description?: string } | undefined;
        
        if (!idea) throw new Error(`Idea ${id} not found`);
        return idea;
      });
      
      // Load Template Images (Borders)
      const templateImages: Buffer[] = [];
      try {
        const templates = ['BORDER_PORTRAIT.png', 'BORDER_LANDSCAPE.png'];
        for (const tpl of templates) {
             const templatePath = path.join(process.cwd(), 'resources', 'templates', tpl);
             if (fs.existsSync(templatePath)) {
                templateImages.push(fs.readFileSync(templatePath));
             } else {
                log.warn(`Batch: Border template not found at ${templatePath}`);
             }
        }
      } catch (e) {
        log.error('Batch: Failed to load template images', e);
      }

      // Build batch requests using same prompt structure as real-time queue
      const allBatchRequests = ideas.map(idea => ({
        ideaId: idea.id,
        prompt: JSON.stringify({
          title: idea.title,
          description: idea.description,
          extendedDescription: idea.extended_description,
          skill: idea.skill,
          category: idea.category,
          tags: idea.tags ? JSON.parse(idea.tags) : []
        }) + "\n\nCRITICAL VISUAL CONSTRAINT: I have provided TWO reference border templates (Portrait and Landscape). Based on the subject, CHOOSE ONLY ONE that fits best. Generate the coloring content INSIDE that chosen border. Ignore the other border. Do NOT output two images, just ONE filling the chosen orientation. \n\nIMPORTANT: Do NOT fill areas with solid black ink. Use outlines only. No silhouettes or heavy shadows.",
        skill: idea.skill,
      }));
      
      // Chunk into smaller batches to avoid response size limits
      const chunks: typeof allBatchRequests[] = [];
      for (let i = 0; i < allBatchRequests.length; i += MAX_BATCH_SIZE) {
        chunks.push(allBatchRequests.slice(i, i + MAX_BATCH_SIZE));
      }
      
      log.info(`Splitting ${ideaIds.length} ideas into ${chunks.length} batch chunks (max ${MAX_BATCH_SIZE} per chunk)`);
      
      // Update ideas to 'Queued' status
      for (const id of ideaIds) {
        db.prepare("UPDATE ideas SET status = 'Queued' WHERE id = ?").run(id);
      }
      
      const batchJobIds: string[] = [];
      const geminiJobIds: string[] = [];
      
      // Submit each chunk as a separate batch job
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const chunkIdeaIds = chunk.map(r => r.ideaId);
        
        // Create batch job record for this chunk
        const batchJobId = ulid();
        
        db.prepare(`
          INSERT INTO batch_jobs (id, status, idea_ids, mode, created_at)
          VALUES (?, 'pending', ?, 'generate', ?)
        `).run(batchJobId, JSON.stringify(chunkIdeaIds), new Date().toISOString());
        
        try {
          const geminiJobId = await gemini.submitBatchJob(chunk, templateImages);
          
          // Update batch job with Gemini job ID
          db.prepare(`
            UPDATE batch_jobs SET gemini_job_id = ?, status = 'processing' WHERE id = ?
          `).run(geminiJobId, batchJobId);
          
          log.info(`Batch chunk ${chunkIndex + 1}/${chunks.length} (${batchJobId}) submitted to Gemini (${geminiJobId}), ${chunkIdeaIds.length} ideas`);
          
          batchJobIds.push(batchJobId);
          geminiJobIds.push(geminiJobId);
        } catch (submitErr) {
          // Mark this chunk's batch job as failed
          db.prepare(`
            UPDATE batch_jobs SET status = 'failed', error = ? WHERE id = ?
          `).run(submitErr instanceof Error ? submitErr.message : 'Submission failed', batchJobId);
          
          // Reset idea statuses for this chunk only
          for (const id of chunkIdeaIds) {
            db.prepare("UPDATE ideas SET status = 'Imported' WHERE id = ?").run(id);
          }
          
          log.error(`Batch chunk ${chunkIndex + 1}/${chunks.length} failed:`, submitErr);
          // Continue with other chunks instead of failing everything
        }
      }
      
      if (batchJobIds.length === 0) {
        return errorResponse('All batch chunks failed to submit');
      }
      
      return successResponse({
        batchJobIds,
        geminiJobIds,
        ideaCount: ideaIds.length,
        chunkCount: chunks.length,
        successfulChunks: batchJobIds.length,
      });
    } catch (error) {
      log.error('Error submitting batch job:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  /**
   * Get status of a batch job
   */
  ipcMain.handle(IPC_CHANNELS.BATCH_GET_STATUS, async (_event, batchJobId: string) => {
    try {
      const db = getDatabase();
      const job = db.prepare('SELECT * FROM batch_jobs WHERE id = ?').get(batchJobId) as BatchJobRow | undefined;
      
      if (!job) {
        return errorResponse('Batch job not found');
      }
      
      // If processing, poll for latest status
      if (job.status === 'processing' && job.gemini_job_id) {
        const apiKey = getApiKey();
        if (apiKey) {
          const gemini = new GeminiService(apiKey);
          const status = await gemini.pollBatchJob(job.gemini_job_id);
          
          return successResponse({
            ...job,
            geminiStatus: status,
          });
        }
      }
      
      return successResponse(job);
    } catch (error) {
      log.error('Error getting batch status:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  /**
   * List all batch jobs
   */
  ipcMain.handle(IPC_CHANNELS.BATCH_LIST, async () => {
    try {
      const db = getDatabase();
      const jobs = db.prepare(`
        SELECT * FROM batch_jobs ORDER BY created_at DESC LIMIT 50
      `).all() as BatchJobRow[];
      
      return successResponse(jobs);
    } catch (error) {
      log.error('Error listing batch jobs:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  /**
   * Manually trigger batch polling
   */
  ipcMain.handle(IPC_CHANNELS.BATCH_POLL, async () => {
    try {
      await triggerPoll();
      return successResponse({ polled: true });
    } catch (error) {
      log.error('Error triggering batch poll:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });
}
