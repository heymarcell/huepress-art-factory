import { getDatabase } from '../database';
import { getApiKey, getSettings } from '../ipc/settings';
import { GeminiService } from './gemini';
import { StorageService } from './storage';
import { ulid } from 'ulid';
import log from 'electron-log/main';
import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Idea } from '../../shared/schemas';


export class JobQueue {
  private running = new Set<string>(); // ideaIds
  private storage = new StorageService();
  private editQueue: { ideaId: string; instruction: string }[] = [];
  
  constructor() {
    // Clean up stale jobs from previous session on startup
    // Jobs left in Queued/Generating state won't resume, so mark them Failed
    this.cleanupStaleJobs();
  }

  /**
   * Reset any jobs stuck in Queued or Generating state to Failed
   * This runs on app startup to clean up interrupted jobs
   */
  private cleanupStaleJobs() {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      
      const result = db.prepare(`
        UPDATE ideas 
        SET status = 'Failed', updated_at = ? 
        WHERE status IN ('Queued', 'Generating')
      `).run(now);
      
      if (result.changes > 0) {
        log.info(`[JobQueue] Cleaned up ${result.changes} stale jobs from previous session`);
      }
    } catch (e) {
      log.error('[JobQueue] Failed to cleanup stale jobs:', e);
    }
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

  /**
   * M3: Add an edit job - edit existing image with text instruction
   */
  async addEdit(ideaId: string, instruction: string) {
    const db = getDatabase();
    const now = new Date().toISOString();
    
    // Mark as Queued
    db.prepare('UPDATE ideas SET status = ?, updated_at = ? WHERE id = ?').run('Queued', now, ideaId);
    
    // Add to edit queue with instruction
    this.editQueue.push({ ideaId, instruction });
    
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
    
    // Remove from edit queue if present
    this.editQueue = this.editQueue.filter(e => e.ideaId !== ideaId);
    
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

    // First, check edit queue
    while (this.editQueue.length > 0 && this.running.size < concurrency) {
      const editJob = this.editQueue.shift()!;
      const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(editJob.ideaId) as Idea | undefined;
      if (idea) {
        this.runEditJob(idea, editJob.instruction);
      }
    }

    // Then, find next Queued items for generation (not in edit queue)
    const remainingSlots = concurrency - this.running.size;
    if (remainingSlots <= 0) return;

    const nextIdeas = db.prepare(`
      SELECT * FROM ideas WHERE status = 'Queued' ORDER BY updated_at ASC LIMIT ?
    `).all(remainingSlots) as Idea[];

    if (nextIdeas.length === 0) return;

    for (const idea of nextIdeas) {
      // Skip if this idea is in edit queue (will be handled separately)
      if (this.editQueue.some(e => e.ideaId === idea.id)) continue;
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
        extendedDescription: idea.extended_description,
        skill: idea.skill,
        category: idea.category,
        tags: idea.tags
      }) + "\n\nCRITICAL VISUAL CONSTRAINT: I have provided TWO reference border templates (Portrait and Landscape). Based on the subject, CHOOSE ONLY ONE that fits best. Generate the coloring content INSIDE that chosen border. Ignore the other border. Do NOT output two images, just ONE filling the chosen orientation. \n\nIMPORTANT: Do NOT fill areas with solid black ink. Use outlines only. No silhouettes or heavy shadows.";
      
      // Load Template Images
      const templateImages: Buffer[] = [];
      try {
        const templates = ['BORDER_PORTRAIT.png', 'BORDER_LANDSCAPE.png'];
        
        for (const tpl of templates) {
             const templatePath = path.join(process.cwd(), 'resources', 'templates', tpl);
             if (fs.existsSync(templatePath)) {
                templateImages.push(fs.readFileSync(templatePath));
                log.info(`[Job ${idea.id}] Loaded border template: ${templatePath}`);
             } else {
                log.warn(`[Job ${idea.id}] Border template not found at ${templatePath}`);
             }
        }
      } catch (e) {
        log.error(`[Job ${idea.id}] Failed to load template images`, e);
      }

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

      const imageBuffer = await gemini.generateImage(inputPayload, handleProgress, templateImages);
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

  /**
   * M3: Run an edit job - takes existing image and applies text instruction
   */
  private async runEditJob(idea: Idea, instruction: string) {
    this.running.add(idea.id);
    const db = getDatabase();

    try {
      // Update status to Generating
      db.prepare('UPDATE ideas SET status = ? WHERE id = ?').run('Generating', idea.id);

      const apiKey = getApiKey();
      if (!apiKey) {
        throw new Error('API Key missing');
      }

      // Get current image path
      let sourceImagePath: string | null = null;
      if (idea.selected_attempt_id) {
        const attempt = db.prepare('SELECT image_path FROM generation_attempts WHERE id = ?').get(idea.selected_attempt_id) as { image_path: string } | undefined;
        sourceImagePath = attempt?.image_path || null;
      }

      if (!sourceImagePath || !fs.existsSync(sourceImagePath)) {
        throw new Error('No source image found for editing');
      }

      const gemini = new GeminiService(apiKey);
      const sourceImage = fs.readFileSync(sourceImagePath);
      
      // Construct edit prompt
      const editPayload = JSON.stringify({
        title: idea.title,
        skill: idea.skill,
        instruction: instruction
      }) + `\n\nEDIT INSTRUCTION: ${instruction}\n\nApply this modification to the provided image while maintaining the coloring book style (black outlines only, no fills, no shading).`;

      const start = Date.now();
      
      // Progress handler
      const handleProgress = (text: string) => {
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('jobs:progress', {
             jobId: idea.id,
             ideaId: idea.id,
             status: 'running',
             message: `Editing: ${text.substring(0, 50)}...`
          });
        });
      };

      // Call with source image as template
      const imageBuffer = await gemini.generateImage(editPayload, handleProgress, [sourceImage]);
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
        'edit', // Type is 'edit' for modifications
        'v2-edit-instruction',
        editPayload,
        JSON.stringify({ duration, model: 'gemini-3-pro-image-preview', instruction }),
        imagePath,
        sha256,
        new Date().toISOString()
      );

      // Update Idea Status - auto-select the new version
      const now = new Date().toISOString();
      db.prepare('UPDATE ideas SET status = ?, selected_attempt_id = ?, updated_at = ? WHERE id = ?').run('Generated', attemptId, now, idea.id);

      log.info(`[Edit Job ${idea.id}] Completed in ${duration}ms`);

    } catch (error: any) {
      log.error(`Edit job failed for idea ${idea.id}:`, error);
      
      // Record Failed Attempt
      const attemptId = ulid();
      db.prepare(`
        INSERT INTO generation_attempts (
          id, idea_id, type, prompt_template_version, request, response_meta, qc_report, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        attemptId,
        idea.id,
        'edit',
        'v2-edit-instruction',
        instruction,
        JSON.stringify({ error: error.message }),
        JSON.stringify({ passed: false, error: error.message }),
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

