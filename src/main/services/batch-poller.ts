/**
 * Batch Poller Service
 * Polls pending batch jobs on app startup and periodically
 */

import log from 'electron-log/main';
import { getDatabase, getAssetsPath } from '../database';
import { GeminiService } from './gemini';
import { getApiKey } from '../ipc/settings';
import * as fs from 'fs/promises';
import * as path from 'path';

interface BatchJob {
  id: string;
  gemini_job_id: string | null;
  status: string;
  idea_ids: string;
  mode: string;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

let pollInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

/**
 * Start the batch poller
 * Polls every 5 minutes for pending batch jobs
 */
export function startBatchPoller(): void {
  log.info('Starting batch poller...');
  
  // Poll immediately on startup
  pollPendingBatches().catch(err => log.error('Initial batch poll failed:', err));
  
  // Then poll every 5 minutes
  pollInterval = setInterval(() => {
    pollPendingBatches().catch(err => log.error('Batch poll failed:', err));
  }, 5 * 60 * 1000);
}

/**
 * Stop the batch poller
 */
export function stopBatchPoller(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  log.info('Batch poller stopped');
}

/**
 * Poll all pending/processing batch jobs
 */
async function pollPendingBatches(): Promise<void> {
  if (isPolling) {
    log.info('Batch polling already in progress, skipping...');
    return;
  }
  
  isPolling = true;
  
  try {
    const db = getDatabase();
    const apiKey = await getApiKey();
    
    if (!apiKey) {
      log.warn('No API key configured, skipping batch poll');
      return;
    }
    
    const gemini = new GeminiService(apiKey);
    
    // Get pending/processing batch jobs
    const pendingJobs = db.prepare(`
      SELECT * FROM batch_jobs 
      WHERE status IN ('pending', 'processing') 
      AND gemini_job_id IS NOT NULL
    `).all() as BatchJob[];
    
    if (pendingJobs.length === 0) {
      log.info('No pending batch jobs to poll');
      return;
    }
    
    log.info(`Polling ${pendingJobs.length} pending batch jobs...`);
    
    for (const job of pendingJobs) {
      try {
        await pollSingleBatch(db, gemini, job);
      } catch (err) {
        log.error(`Error polling batch job ${job.id}:`, err);
      }
    }
  } finally {
    isPolling = false;
  }
}

/**
 * Poll a single batch job and process results if complete
 */
async function pollSingleBatch(
  db: ReturnType<typeof getDatabase>,
  gemini: GeminiService,
  job: BatchJob
): Promise<void> {
  if (!job.gemini_job_id) return;
  
  log.info(`Polling batch job ${job.id} (${job.gemini_job_id})...`);
  
  const status = await gemini.pollBatchJob(job.gemini_job_id);
  log.info(`Batch ${job.id} status: ${status.state} (${status.completedCount || 0} completed, ${status.failedCount || 0} failed)`);
  
  if (status.state === 'JOB_STATE_SUCCEEDED') {
    // Job completed - process results
    log.info(`Batch ${job.id} completed! Processing results...`);
    
    const results = await gemini.getBatchResults(job.gemini_job_id);
    const ideaIds = JSON.parse(job.idea_ids) as string[];
    
    if (results.length !== ideaIds.length) {
       log.warn(`Batch result count mismatch: ${results.length} results vs ${ideaIds.length} ideas. Using index matching as best effor.`);
    }

    let processedCount = 0;
    
    // Process results matching by index if needed
    for (let i = 0; i < Math.min(results.length, ideaIds.length); i++) {
        const result = results[i];
        const ideaId = result.ideaId || ideaIds[i]; // Fallback to ordered ID
        
        if (result.imageData) {
            try {
              await saveGeneratedImage(db, ideaId, result.imageData);
              processedCount++;
            } catch (err) {
              log.error(`Failed to save image for idea ${ideaId}:`, err);
            }
        } else if (result.error) {
            log.error(`Batch generation failed for idea ${ideaId}: ${result.error}`);
            db.prepare("UPDATE ideas SET status = 'Failed', notes = ? WHERE id = ?").run(`Batch Error: ${result.error}`, ideaId);
        } else {
            // No image and no error?
            log.warn(`Batch result for idea ${ideaId} has no image and no error.`);
            db.prepare("UPDATE ideas SET status = 'Failed', notes = ? WHERE id = ?").run('Batch result missing image data', ideaId);
        }
    }
    
    // Mark batch job as completed
    db.prepare(`
      UPDATE batch_jobs 
      SET status = 'completed', completed_at = ? 
      WHERE id = ?
    `).run(new Date().toISOString(), job.id);
    
    log.info(`Batch ${job.id} processed: ${processedCount}/${ideaIds.length} images saved`);
    
  } else if (status.state === 'JOB_STATE_FAILED' || status.state === 'JOB_STATE_CANCELLED') {
    // Job failed - mark as failed
    log.error(`Batch ${job.id} failed: ${status.error || 'Unknown error'}`);
    
    db.prepare(`
      UPDATE batch_jobs 
      SET status = 'failed', error = ?, completed_at = ? 
      WHERE id = ?
    `).run(status.error || 'Batch job failed', new Date().toISOString(), job.id);
    
    // Mark all ideas in batch as failed
    const ideaIds = JSON.parse(job.idea_ids) as string[];
    for (const ideaId of ideaIds) {
      db.prepare("UPDATE ideas SET status = 'Failed' WHERE id = ?").run(ideaId);
    }
  } else {
    // Still processing - update status if changed
    db.prepare(`
      UPDATE batch_jobs SET status = 'processing' WHERE id = ? AND status = 'pending'
    `).run(job.id);
  }
}

/**
 * Save a generated image from batch results
 */
async function saveGeneratedImage(
  db: ReturnType<typeof getDatabase>,
  ideaId: string,
  base64Data: string
): Promise<void> {
  const assetsPath = getAssetsPath();
  const imagesDir = path.join(assetsPath, 'images');
  
  // Ensure directory exists
  await fs.mkdir(imagesDir, { recursive: true });
  
  // Generate filename
  const timestamp = Date.now();
  const filename = `${ideaId}_batch_${timestamp}.png`;
  const imagePath = path.join(imagesDir, filename);
  
  // Write image
  const imageBuffer = Buffer.from(base64Data, 'base64');
  await fs.writeFile(imagePath, imageBuffer);
  
  // Create generation attempt record
  const { ulid } = await import('ulid');
  const attemptId = ulid();
  
  db.prepare(`
    INSERT INTO generation_attempts (id, idea_id, type, prompt_template_version, request, response_meta, image_path, created_at)
    VALUES (?, ?, 'generate', '1.0', '{}', ?, ?, ?)
  `).run(attemptId, ideaId, JSON.stringify({ mode: 'batch' }), imagePath, new Date().toISOString());
  
  // Update idea status and selected attempt
  db.prepare(`
    UPDATE ideas SET status = 'Generated', selected_attempt_id = ?, updated_at = ?
    WHERE id = ?
  `).run(attemptId, new Date().toISOString(), ideaId);
  
  log.info(`Saved batch result for idea ${ideaId}: ${imagePath}`);
}

/**
 * Manually trigger a poll (useful for debugging/testing)
 */
export async function triggerPoll(): Promise<void> {
  await pollPendingBatches();
}
