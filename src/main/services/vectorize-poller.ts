/**
 * Vectorize Poller Service
 * Polls pending vectorization jobs in the background and downloads results when complete
 */

import log from 'electron-log/main';
import { getDatabase, getAssetsPath } from '../database';
import { getSettings } from '../ipc/settings';
import * as fs from 'fs/promises';
import * as path from 'path';

interface VectorizeJobRow {
  job_id: string;
  idea_id: string;
  status: string;
  created_at: string;
}

interface VectorizerJobResponse {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result_url?: string;
  error?: string;
}

let pollInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

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

/**
 * Start the vectorize poller
 * Polls every 5 seconds for pending vectorization jobs
 */
export function startVectorizePoller(): void {
  log.info('Starting vectorize poller...');
  
  // Poll immediately on startup
  pollPendingVectorizeJobs().catch(err => log.error('Initial vectorize poll failed:', err));
  
  // Then poll every 5 seconds (vectorization is faster than batch generation)
  pollInterval = setInterval(() => {
    pollPendingVectorizeJobs().catch(err => log.error('Vectorize poll failed:', err));
  }, 5000);
}

/**
 * Stop the vectorize poller
 */
export function stopVectorizePoller(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  log.info('Vectorize poller stopped');
}

/**
 * Poll all pending/processing vectorize jobs
 */
async function pollPendingVectorizeJobs(): Promise<void> {
  if (isPolling) {
    return; // Don't log spam, just skip
  }
  
  isPolling = true;
  
  try {
    const db = getDatabase();
    
    // Get pending/processing vectorize jobs
    const pendingJobs = db.prepare(`
      SELECT job_id, idea_id, status, created_at 
      FROM vectorize_jobs 
      WHERE status IN ('pending', 'processing')
      ORDER BY created_at ASC
    `).all() as VectorizeJobRow[];
    
    if (pendingJobs.length === 0) {
      return;
    }
    
    log.info(`[VectorizePoller] Polling ${pendingJobs.length} pending jobs...`);
    
    const baseUrl = getVectorizerApiUrl();
    
    for (const job of pendingJobs) {
      try {
        await pollSingleVectorizeJob(db, baseUrl, job);
      } catch (err) {
        log.error(`[VectorizePoller] Error polling job ${job.job_id}:`, err);
      }
    }
  } finally {
    isPolling = false;
  }
}

/**
 * Poll a single vectorize job and download result if complete
 */
async function pollSingleVectorizeJob(
  db: ReturnType<typeof getDatabase>,
  baseUrl: string,
  job: VectorizeJobRow
): Promise<void> {
  // Get job status from API
  const response = await fetchWithTimeout(`${baseUrl}/jobs/${job.job_id}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  }, 10000);

  if (!response.ok) {
    if (response.status === 404) {
      log.warn(`[VectorizePoller] Job ${job.job_id} not found, marking as failed`);
      db.prepare(`UPDATE vectorize_jobs SET status = ?, updated_at = datetime('now') WHERE job_id = ?`)
        .run('failed', job.job_id);
    }
    return;
  }

  const data: VectorizerJobResponse = await response.json();
  
  // Update local status
  db.prepare(`UPDATE vectorize_jobs SET status = ?, updated_at = datetime('now') WHERE job_id = ?`)
    .run(data.status, job.job_id);

  if (data.status === 'completed') {
    log.info(`[VectorizePoller] Job ${job.job_id} completed! Downloading SVG...`);
    await downloadVectorizedResult(db, baseUrl, job.job_id, job.idea_id);
  } else if (data.status === 'failed') {
    log.error(`[VectorizePoller] Job ${job.job_id} failed: ${data.error}`);
  }
}

/**
 * Download the vectorized SVG result
 */
async function downloadVectorizedResult(
  db: ReturnType<typeof getDatabase>,
  baseUrl: string,
  jobId: string,
  ideaId: string
): Promise<void> {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/download/${jobId}`, {
      method: 'GET',
    }, 60000);

    if (!response.ok) {
      if (response.status === 400) {
        log.warn(`[VectorizePoller] Result not ready for job ${jobId}`);
        return;
      }
      throw new Error(`Download failed: ${response.status}`);
    }

    // Get SVG content
    const svgContent = await response.text();

    // Save to assets directory with idea ID
    const assetsPath = getAssetsPath();
    const svgDir = path.join(assetsPath, 'svg');
    await fs.mkdir(svgDir, { recursive: true });

    const svgPath = path.join(svgDir, `${ideaId}.svg`);
    await fs.writeFile(svgPath, svgContent, 'utf-8');

    // Create vectorize_results table if not exists
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

    // Mark job as completed
    db.prepare(`UPDATE vectorize_jobs SET status = ?, updated_at = datetime('now') WHERE job_id = ?`)
      .run('completed', jobId);

    log.info(`[VectorizePoller] Downloaded SVG for idea ${ideaId}: ${svgPath} (${svgContent.length} bytes)`);
  } catch (error) {
    log.error(`[VectorizePoller] Download error for job ${jobId}:`, error);
    // Mark as failed so we don't keep retrying
    db.prepare(`UPDATE vectorize_jobs SET status = ?, updated_at = datetime('now') WHERE job_id = ?`)
      .run('failed', jobId);
  }
}

/**
 * Manually trigger a poll (useful for testing)
 */
export async function triggerVectorizePoll(): Promise<void> {
  await pollPendingVectorizeJobs();
}
