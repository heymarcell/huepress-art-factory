import { ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log/main';
import { getDatabase, getAssetsPath } from '../database';
import { getSettings, getWebApiKey } from './settings';
import { IPC_CHANNELS, successResponse, errorResponse } from '../../shared/ipc-channels';

export function registerWebHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WEB_SYNC, async (_event, ideaId: unknown) => {
    try {
      if (typeof ideaId !== 'string') return errorResponse('Idea ID must be a string');

      const settings = getSettings();
      const apiKey = getWebApiKey();
      const apiUrl = settings.webApiUrl || 'https://api.huepress.co';

      if (!apiKey) {
        return errorResponse('Web API Key not configured. Please check Settings.');
      }

      const db = getDatabase();
      const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(ideaId) as any;

      if (!idea) return errorResponse('Idea not found', 'NOT_FOUND');

      const formData = new FormData();
      formData.append('title', idea.title);
      formData.append('description', idea.description || '');
      formData.append('category', idea.category || 'Uncategorized');
      formData.append('skill', idea.skill || 'Medium');
      formData.append('status', 'draft'); 
      
      // Handle Tags (Convert JSON array string ["a","b"] to comma-separated "a,b")
      if (idea.tags) {
        try {
          const tagsArr = JSON.parse(idea.tags);
          if (Array.isArray(tagsArr)) {
            formData.append('tags', tagsArr.join(', '));
          }
        } catch (e) {
          // If not parseable, maybe send as is? 
          log.warn(`Failed to parse tags for idea ${ideaId}:`, e);
        }
      }

      // Pass-through fields (Web expects stringified JSON or plain text)
      if (idea.extended_description) formData.append('extended_description', idea.extended_description);
      if (idea.fun_facts) formData.append('fun_facts', idea.fun_facts);
      if (idea.suggested_activities) formData.append('suggested_activities', idea.suggested_activities);
      if (idea.coloring_tips) formData.append('coloring_tips', idea.coloring_tips);
      if (idea.therapeutic_benefits) formData.append('therapeutic_benefits', idea.therapeutic_benefits);
      if (idea.meta_keywords) formData.append('meta_keywords', idea.meta_keywords);

      // Files
      const assetsPath = settings.assetsPath || getAssetsPath();
      const slug = idea.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      // 1. Source SVG (Best quality)
      const vectorizeResult = db.prepare('SELECT svg_path FROM vectorize_results WHERE idea_id = ?').get(ideaId) as any;
      if (vectorizeResult && vectorizeResult.svg_path) {
         const svgPath = path.isAbsolute(vectorizeResult.svg_path) 
            ? vectorizeResult.svg_path 
            : path.join(assetsPath, vectorizeResult.svg_path);

         if (fs.existsSync(svgPath)) {
            const buffer = fs.readFileSync(svgPath);
            const blob = new Blob([buffer], { type: 'image/svg+xml' });
            formData.append('source', blob, `${slug}.svg`);
         }
      }

      /* 
       * [OPTIMIZATION] Skip uploading valid local PNGs (Thumbnails)
       * The server processing queue will generate an optimized WebP thumbnail from the SVG source.
       * This saves bandwidth (avoiding ~4MB uploads) and ensures consistent quality.
       *
      // 2. Thumbnail (PNG)
      // Get selected attempt or latest
      const attempt = db.prepare(`
         SELECT image_path FROM generation_attempts 
         WHERE (idea_id = ? AND id = ?) OR idea_id = ? 
         ORDER BY created_at DESC LIMIT 1
      `).get(ideaId, idea.selected_attempt_id || '', ideaId) as any;

      if (attempt && attempt.image_path) {
         const pngPath = path.isAbsolute(attempt.image_path)
            ? attempt.image_path
            : path.join(assetsPath, attempt.image_path);
            
         if (fs.existsSync(pngPath)) {
            const buffer = fs.readFileSync(pngPath);
            const blob = new Blob([buffer], { type: 'image/png' });
            formData.append('thumbnail', blob, `${slug}.png`);
         }
      }
      */

      log.info(`Syncing Idea ${ideaId} to ${apiUrl}...`);
      log.info(`Payload: Title="${idea.title}", SVG=${(formData.get('source') as File)?.size ?? 0} bytes, Thumb=${(formData.get('thumbnail') as File)?.size ?? 0} bytes`);
      const startTime = Date.now();

      // Upload
      const response = await fetch(`${apiUrl}/api/admin/assets`, {
        method: 'POST',
        headers: {
          'X-Admin-Key': apiKey
        },
        body: formData
      });

      if (!response.ok) {
        const errText = await response.text();
        log.error(`Web Sync Failed: ${response.status} - ${errText}`);
        return errorResponse(`Upload failed: ${response.status} - ${errText}`);
      }

      const result = await response.json();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      log.info(`Web Sync Success (${duration}s):`, result);
      
      // Update local status to Published
      db.prepare('UPDATE ideas SET status = ? WHERE id = ?').run('Published', ideaId);

      return successResponse(result);

    } catch (error: any) {
      log.error('Web Sync Error:', error);
      return errorResponse(error.message || 'Unknown error');
    }
  });
}
