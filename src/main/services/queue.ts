import { getDatabase } from '../database';
import { getApiKey, getSettings } from '../ipc/settings';
import { GeminiService } from './gemini';
import { StorageService } from './storage';
import { ulid } from 'ulid';
import log from 'electron-log/main';
import { BrowserWindow } from 'electron';
import type { Idea } from '../../shared/schemas';


export class JobQueue {
  private running = new Set<string>(); // ideaIds
  private storage = new StorageService();
  
  constructor() {
    // Attempt to resume jobs on startup? 
    // Maybe later. For now, user manually triggers.
  }

  async getStats() {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'Queued' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'Generating' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'Generated' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'NeedsAttention' THEN 1 ELSE 0 END) as failed
      FROM ideas
    `).get() as { pending: number; running: number; completed: number; failed: number };

    return {
      pending: result.pending || 0,
      running: result.running || 0,
      completed: result.completed || 0,
      failed: result.failed || 0,
    };
  }

  async add(ideaIds: string[]) {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE ideas SET status = ?, updated_at = ? WHERE id = ?');
    const now = new Date().toISOString();
    
    // Mark all as Queued
    const transaction = db.transaction(() => {
        for (const id of ideaIds) {
            stmt.run('Queued', now, id);
        }
    });
    transaction();

    // Trigger processing
    this.process();
  }

  async cancel(ideaId: string) {
    if (this.running.has(ideaId)) {
        // We can't easily cancel an inflight Fetch/Promise in JS without AbortController support in specific service
        // For now, we'll jus mark it as NeedsAttention in DB and when the promise returns, we ignore the result.
        // Or we implement AbortController in GeminiService.
        // Let's just mark it in DB.
    }
    
    const db = getDatabase();
    db.prepare('UPDATE ideas SET status = ?, updated_at = ? WHERE id = ?').run('NeedsAttention', new Date().toISOString(), ideaId);
    this.running.delete(ideaId);
    this.process();
  }

  private async process() {
    const settings = getSettings();
    const concurrency = settings.concurrency || 3;

    if (this.running.size >= concurrency) {
      return;
    }

    const slots = concurrency - this.running.size;
    const db = getDatabase();

    // Find next Queued items
    // Using simple prepare without explicit generics to rely on inference or looser typing
    // as better-sqlite3 generic typing can be strict about parameter tuples
    const nextIdeas = db.prepare(`
      SELECT * FROM ideas WHERE status = 'Queued' ORDER BY updated_at ASC LIMIT ?
    `).all(slots) as Idea[];

    if (nextIdeas.length === 0) return;

    for (const idea of nextIdeas) {
      this.runJob(idea);
    }
  }

  private async runJob(idea: Idea) {
    this.running.add(idea.id);
    const db = getDatabase();

    try {
      // Update status to Generating
      db.prepare('UPDATE ideas SET status = ? WHERE id = ?').run('Generating', idea.id);

      const apiKey = getApiKey();
      if (!apiKey) {
        throw new Error('API Key missing');
      }

      const gemini = new GeminiService(apiKey);
      
      // Construct Prompt
      // Pass the idea details as a JSON string, which the System Instruction will process
      const inputPayload = JSON.stringify({
        title: idea.title,
        description: idea.description,
        skill: idea.skill,
        category: idea.category
      });

      const start = Date.now();
      
      // Progress handler
      const handleProgress = (text: string) => {
        // Broadcast progress to all windows (renderer)
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('jobs:progress', {
             jobId: idea.id,
             ideaId: idea.id,
             status: 'running',
             message: text
          });
        });
        
        // Log brief progress
        log.info(`[Job ${idea.id}] Progress: ${text.substring(0, 50)}...`);
      };

      const imageBuffer = await gemini.generateImage(inputPayload, handleProgress);
      const duration = Date.now() - start;

      // Save Image
      const { path: imagePath, sha256 } = await this.storage.saveImage(imageBuffer, idea.id, idea.batch_id);

      // Record Attempt
      const attemptId = ulid();
      db.prepare(`
        INSERT INTO generation_attempts (
          id, idea_id, type, prompt_template_version, request, response_meta, image_path, image_sha256, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        attemptId,
        idea.id,
        'generate',
        'v2-system-instruction',
        inputPayload, // Store actual prompt used
        JSON.stringify({ duration, model: 'gemini-3-pro-image-preview' }),
        imagePath,
        sha256,
        new Date().toISOString()
      );

      // Update Idea Status
      const now = new Date().toISOString();
      db.prepare('UPDATE ideas SET status = ?, selected_attempt_id = ?, updated_at = ? WHERE id = ?').run('Generated', attemptId, now, idea.id);

    } catch (error: any) {
      log.error(`Job failed for idea ${idea.id}:`, error);
      
      // Record Failed Attempt (optional, or just log)
      
      // Record Failed Attempt
      const attemptId = ulid();
      db.prepare(`
        INSERT INTO generation_attempts (
          id, idea_id, type, prompt_template_version, request, response_meta, qc_report, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        attemptId,
        idea.id,
        'generate',
        'v2-system-instruction',
        'FAILED',
        JSON.stringify({ error: error.message }), // Store error in meta
        JSON.stringify({ passed: false, error: error.message }), // Store error in valid JSON column too
        new Date().toISOString()
      );
      
      db.prepare('UPDATE ideas SET status = ?, updated_at = ? WHERE id = ?').run('Failed', new Date().toISOString(), idea.id);
    } finally {
      this.running.delete(idea.id);
      this.process(); // Pick next
    }
  }
}

// Singleton instance
export const jobQueue = new JobQueue();
