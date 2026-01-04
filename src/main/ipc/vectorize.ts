/**
 * Vectorize IPC Handlers
 * Handles communication with the external Vectorizer API service
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS, successResponse, errorResponse } from '../../shared/ipc-channels';
import { getDatabase, getAssetsPath } from '../database';
import { getSettings } from './settings';
import log from 'electron-log/main';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// Types for Vectorizer API responses
// =============================================================================

interface VectorizerHealthResponse {
  status: string;
  version: string;
}

interface VectorizerJobResponse {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result_url?: string;
  error?: string;
  claimed?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function getVectorizerApiUrl(): string {
  const settings = getSettings();
  return settings.vectorizerApiUrl || 'http://localhost:8000';
}

async function fetchWithTimeout(url: string, options: RequestInit, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// =============================================================================
// IPC Handlers
// =============================================================================

export function registerVectorizeHandlers(): void {
  // Initialize jobs table
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS vectorize_jobs (
      job_id TEXT PRIMARY KEY,
      idea_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // =========================================================================
  // Health Check
  // =========================================================================
  ipcMain.handle(IPC_CHANNELS.VECTORIZE_HEALTH, async () => {
    try {
      const baseUrl = getVectorizerApiUrl();
      const response = await fetchWithTimeout(`${baseUrl}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      }, 5000);

      if (!response.ok) {
        return successResponse({ healthy: false, error: `HTTP ${response.status}` });
      }

      const data: VectorizerHealthResponse = await response.json();
      return successResponse({
        healthy: data.status === 'healthy',
        status: data.status,
        version: data.version,
      });
    } catch (error) {
      log.error('Vectorizer health check failed:', error);
      return successResponse({
        healthy: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      });
    }
  });

  // =========================================================================
  // List Active Jobs
  // =========================================================================
  ipcMain.handle(IPC_CHANNELS.VECTORIZE_LIST_JOBS, async () => {
    try {
      const db = getDatabase();
      const jobs = db.prepare(`
        SELECT job_id as jobId, idea_id as ideaId, status 
        FROM vectorize_jobs 
        WHERE status NOT IN ('completed', 'failed')
        ORDER BY created_at DESC
      `).all();
      return successResponse(jobs);
    } catch (error) {
      log.error('Error listing vectorize jobs:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // =========================================================================
  // Submit Single Image
  // =========================================================================
  ipcMain.handle(IPC_CHANNELS.VECTORIZE_SUBMIT, async (_event, ideaId: string) => {
    try {
      const db = getDatabase();
      
      // Get the idea with its image path
      const idea = db.prepare(`
        SELECT 
          i.id, i.title,
          COALESCE(
            (SELECT image_path FROM generation_attempts WHERE id = i.selected_attempt_id),
            (SELECT image_path FROM generation_attempts WHERE idea_id = i.id ORDER BY created_at DESC LIMIT 1)
          ) as image_path
        FROM ideas i
        WHERE i.id = ?
      `).get(ideaId) as { id: string; title: string; image_path: string | null } | undefined;

      if (!idea) {
        return errorResponse('Idea not found');
      }

      if (!idea.image_path) {
        return errorResponse('Idea has no generated image');
      }

      // Check if image file exists
      try {
        await fs.access(idea.image_path);
      } catch {
        return errorResponse('Image file not found on disk');
      }

      // Read the image file and prepare FormData
      const imageBuffer = await fs.readFile(idea.image_path);
      const filename = path.basename(idea.image_path);

      // Use native Node.js FormData and Blob (Node 18+)
      const { Blob } = await import('node:buffer');
      const blob = new Blob([imageBuffer], { type: 'image/png' });
      const formData = new FormData();
      formData.append('file', blob as unknown as Blob, filename);

      const baseUrl = getVectorizerApiUrl();
      const response = await fetchWithTimeout(`${baseUrl}/vectorize`, {
        method: 'POST',
        body: formData,
      }, 30000);

      if (!response.ok) {
        const errorText = await response.text();
        return errorResponse(`Vectorize API error: ${response.status} - ${errorText}`);
      }

      const data: VectorizerJobResponse = await response.json();
      log.info(`Vectorize job submitted for idea ${ideaId}: ${data.job_id}`);

      // Persist job
      db.prepare(`
        INSERT OR REPLACE INTO vectorize_jobs (job_id, idea_id, status)
        VALUES (?, ?, ?)
      `).run(data.job_id, idea.id, data.status);

      return successResponse({
        jobId: data.job_id,
        ideaId: idea.id,
        status: data.status,
      });
    } catch (error) {
      log.error('Error submitting vectorize job:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // =========================================================================
  // Submit Batch
  // =========================================================================
  ipcMain.handle(IPC_CHANNELS.VECTORIZE_SUBMIT_BATCH, async (_event, ideaIds: string[]) => {
    try {
      const db = getDatabase();
      const results: { ideaId: string; jobId: string; error?: string }[] = [];
      const ideaMap: { ideaId: string; filename: string }[] = [];

      // Prepare FormData with all files
      const formData = new FormData();
      const { Blob } = await import('node:buffer');

      for (const ideaId of ideaIds) {
        const idea = db.prepare(`
          SELECT 
            i.id, i.title,
            COALESCE(
              (SELECT image_path FROM generation_attempts WHERE id = i.selected_attempt_id),
              (SELECT image_path FROM generation_attempts WHERE idea_id = i.id ORDER BY created_at DESC LIMIT 1)
            ) as image_path
          FROM ideas i
          WHERE i.id = ?
        `).get(ideaId) as { id: string; title: string; image_path: string | null } | undefined;

        if (!idea || !idea.image_path) {
          results.push({ ideaId, jobId: '', error: 'No image found' });
          continue;
        }

        try {
          const imageBuffer = await fs.readFile(idea.image_path);
          const filename = path.basename(idea.image_path);
          const blob = new Blob([imageBuffer], { type: 'image/png' });
          
          // Add to form with key "files" (matches API expectation)
          formData.append('files', blob as unknown as Blob, filename);
          ideaMap.push({ ideaId, filename });
        } catch {
          results.push({ ideaId, jobId: '', error: 'Failed to read image file' });
        }
      }

      // If no valid files, return early
      if (ideaMap.length === 0) {
        return successResponse({ jobs: results });
      }

      // Submit batch request
      const baseUrl = getVectorizerApiUrl();
      log.info(`Submitting batch of ${ideaMap.length} images to /vectorize/batch`);
      
      const response = await fetchWithTimeout(`${baseUrl}/vectorize/batch`, {
        method: 'POST',
        body: formData,
      }, 60000); // Longer timeout for batch

      if (!response.ok) {
        const errorText = await response.text();
        log.error(`Batch submit failed: ${response.status} - ${errorText}`);
        // Mark all pending as failed
        for (const { ideaId } of ideaMap) {
          results.push({ ideaId, jobId: '', error: `HTTP ${response.status}` });
        }
        return successResponse({ jobs: results });
      }

      const data = await response.json() as { job_ids: string[]; files_count: number };
      log.info(`Batch submitted: ${data.files_count} files, job_ids: ${data.job_ids.join(', ')}`);

      // Map job IDs back to idea IDs (order should match)
      const jobsToInsert: { jobId: string; ideaId: string; status: string }[] = [];
      // db is already available from top of function

      for (let i = 0; i < ideaMap.length; i++) {
        const { ideaId } = ideaMap[i];
        const jobId = data.job_ids[i];
        if (jobId) {
          results.push({ ideaId, jobId });
          jobsToInsert.push({ jobId, ideaId, status: 'pending' });
          log.info(`Batch: idea ${ideaId} -> job ${jobId}`);
        } else {
          results.push({ ideaId, jobId: '', error: 'No job ID returned' });
        }
      }

      // Bulk insert jobs
      if (jobsToInsert.length > 0) {
         const insert = db.prepare(`
           INSERT OR REPLACE INTO vectorize_jobs (job_id, idea_id, status)
           VALUES (?, ?, ?)
         `);
         const transaction = db.transaction(() => {
           for (const job of jobsToInsert) {
             insert.run(job.jobId, job.ideaId, job.status);
           }
         });
         transaction();
      }

      return successResponse({ jobs: results });
    } catch (error) {
      log.error('Error submitting batch vectorize:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // =========================================================================
  // Get Job Status
  // =========================================================================
  ipcMain.handle(IPC_CHANNELS.VECTORIZE_GET_STATUS, async (_event, jobId: string) => {
    try {
      const baseUrl = getVectorizerApiUrl();
      const response = await fetchWithTimeout(`${baseUrl}/jobs/${jobId}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      }, 10000);

      if (!response.ok) {
        if (response.status === 404) {
          return errorResponse('Job not found');
        }
        return errorResponse(`API error: ${response.status}`);
      }

      const data: VectorizerJobResponse = await response.json();
      
      // Update local db state
      try {
        const db = getDatabase();
        db.prepare('UPDATE vectorize_jobs SET status = ?, updated_at = datetime("now") WHERE job_id = ?')
          .run(data.status, jobId);
      } catch (err) { /* ignore update error */ }

      return successResponse({
        jobId: data.job_id,
        status: data.status,
        resultUrl: data.result_url,
        error: data.error,
      });
    } catch (error) {
      log.error('Error getting vectorize status:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // =========================================================================
  // Download Result
  // =========================================================================
  ipcMain.handle(IPC_CHANNELS.VECTORIZE_DOWNLOAD, async (_event, { ideaId, jobId }: { ideaId: string; jobId: string }) => {
    try {
      const baseUrl = getVectorizerApiUrl();
      const response = await fetchWithTimeout(`${baseUrl}/download/${jobId}`, {
        method: 'GET',
      }, 60000);

      if (!response.ok) {
        if (response.status === 400) {
          return errorResponse('Result not ready yet');
        }
        return errorResponse(`Download failed: ${response.status}`);
      }

      // Get SVG content
      const svgContent = await response.text();

      // Save to assets directory with idea ID
      const assetsPath = getAssetsPath();
      const svgDir = path.join(assetsPath, 'svg');
      await fs.mkdir(svgDir, { recursive: true });

      const svgPath = path.join(svgDir, `${ideaId}.svg`);
      await fs.writeFile(svgPath, svgContent, 'utf-8');

      const db = getDatabase();
      
      // Create vectorize_results table if not exists (already done previously but good safety)
      db.exec(`
        CREATE TABLE IF NOT EXISTS vectorize_results (
          idea_id TEXT PRIMARY KEY,
          svg_path TEXT NOT NULL,
          job_id TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // Insert or replace result
      db.prepare(`
        INSERT OR REPLACE INTO vectorize_results (idea_id, svg_path, job_id)
        VALUES (?, ?, ?)
      `).run(ideaId, svgPath, jobId);

      // Update idea status to Vectorized
      db.prepare('UPDATE ideas SET status = ? WHERE id = ?').run('Vectorized', ideaId);

      // Mark job as completed in jobs table or delete it
      // Let's mark it as completed so we have history
      db.prepare('UPDATE vectorize_jobs SET status = ?, updated_at = datetime("now") WHERE job_id = ?')
        .run('completed', jobId);

      log.info(`Downloaded SVG for idea ${ideaId}: ${svgPath}`);

      return successResponse({
        ideaId,
        svgPath,
        size: svgContent.length,
      });
    } catch (error) {
      log.error('Error downloading vectorized result:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });
}
