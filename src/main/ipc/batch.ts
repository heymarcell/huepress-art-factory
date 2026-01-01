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
      
      // Build batch requests
      const batchRequests = ideas.map(idea => ({
        ideaId: idea.id,
        prompt: JSON.stringify({
          title: idea.title,
          description: idea.description,
          skill: idea.skill,
          category: idea.category,
          tags: idea.tags ? JSON.parse(idea.tags) : [],
          extendedDescription: idea.extended_description,
        }),
        skill: idea.skill,
      }));
      
      // Create batch job record
      const batchJobId = ulid();
      
      db.prepare(`
        INSERT INTO batch_jobs (id, status, idea_ids, mode, created_at)
        VALUES (?, 'pending', ?, 'generate', ?)
      `).run(batchJobId, JSON.stringify(ideaIds), new Date().toISOString());
      
      // Update ideas to 'Queued' status
      for (const id of ideaIds) {
        db.prepare("UPDATE ideas SET status = 'Queued' WHERE id = ?").run(id);
      }
      
      // Submit to Gemini Batch API
      try {
        const geminiJobId = await gemini.submitBatchJob(batchRequests);
        
        // Update batch job with Gemini job ID
        db.prepare(`
          UPDATE batch_jobs SET gemini_job_id = ?, status = 'processing' WHERE id = ?
        `).run(geminiJobId, batchJobId);
        
        log.info(`Batch job ${batchJobId} submitted to Gemini (${geminiJobId}), ${ideaIds.length} ideas`);
        
        return successResponse({
          batchJobId,
          geminiJobId,
          ideaCount: ideaIds.length,
        });
      } catch (submitErr) {
        // Mark batch job as failed
        db.prepare(`
          UPDATE batch_jobs SET status = 'failed', error = ? WHERE id = ?
        `).run(submitErr instanceof Error ? submitErr.message : 'Submission failed', batchJobId);
        
        // Reset idea statuses
        for (const id of ideaIds) {
          db.prepare("UPDATE ideas SET status = 'Imported' WHERE id = ?").run(id);
        }
        
        throw submitErr;
      }
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
