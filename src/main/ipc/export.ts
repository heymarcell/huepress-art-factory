/**
 * Export IPC Handlers
 * Handles folder selection and image export operations
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS, successResponse, errorResponse } from '../../shared/ipc-channels';
import type { ExportOptions } from '../../shared/schemas';
import { getDatabase } from '../database';
import log from 'electron-log/main';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Slugify a title for use in filenames
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function registerExportHandlers(): void {
  // =========================================================================
  // Select Folder
  // =========================================================================
  ipcMain.handle(IPC_CHANNELS.EXPORT_SELECT_FOLDER, async () => {
    try {
      const window = BrowserWindow.getFocusedWindow();
      
      const result = window 
        ? await dialog.showOpenDialog(window, {
            title: 'Select Export Destination',
            properties: ['openDirectory', 'createDirectory'],
          })
        : await dialog.showOpenDialog({
            title: 'Select Export Destination',
            properties: ['openDirectory', 'createDirectory'],
          });

      if (result.canceled || result.filePaths.length === 0) {
        return successResponse({ selected: false, path: null });
      }

      return successResponse({ selected: true, path: result.filePaths[0] });
    } catch (error) {
      log.error('Error selecting folder:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // =========================================================================
  // Run Export
  // =========================================================================
  ipcMain.handle(IPC_CHANNELS.EXPORT_RUN, async (_event, options: ExportOptions) => {
    try {
      const { ideaIds, destination, format, includeSidecar } = options;
      
      if (!ideaIds || ideaIds.length === 0) {
        return errorResponse('No ideas selected for export');
      }

      if (!destination) {
        return errorResponse('No destination folder specified');
      }

      // Verify destination exists
      try {
        await fs.access(destination);
      } catch {
        return errorResponse('Destination folder does not exist');
      }

      const db = getDatabase();
      let exported = 0;
      const errors: string[] = [];

      for (const ideaId of ideaIds) {
        try {
          // Get idea with its current image
          const idea = db.prepare(`
            SELECT 
              i.id, i.title, i.description, i.category, i.skill, i.tags,
              i.extended_description, i.fun_facts, i.therapeutic_benefits,
              i.status, i.notes, i.created_at,
              COALESCE(
                (SELECT image_path FROM generation_attempts WHERE id = i.selected_attempt_id),
                (SELECT image_path FROM generation_attempts WHERE idea_id = i.id ORDER BY created_at DESC LIMIT 1)
              ) as image_path
            FROM ideas i
            WHERE i.id = ?
          `).get(ideaId) as Record<string, unknown> | undefined;

          if (!idea) {
            errors.push(`Idea ${ideaId} not found`);
            continue;
          }

          if (!idea.image_path) {
            errors.push(`${idea.title}: No image generated`);
            continue;
          }

          const imagePath = idea.image_path as string;
          
          // Check if source file exists
          try {
            await fs.access(imagePath);
          } catch {
            errors.push(`${idea.title}: Image file not found`);
            continue;
          }

          // Generate filename
          const slug = slugify(idea.title as string);
          const idSuffix = (idea.id as string).slice(-6);
          const filename = `${slug}_${idSuffix}.${format}`;
          const destPath = path.join(destination, filename);

          // Copy image
          await fs.copyFile(imagePath, destPath);

          // Generate sidecar JSON if requested
          if (includeSidecar) {
            const sidecar = {
              id: idea.id,
              title: idea.title,
              description: idea.description,
              category: idea.category,
              skill: idea.skill,
              tags: idea.tags ? JSON.parse(idea.tags as string) : [],
              extended_description: idea.extended_description,
              fun_facts: idea.fun_facts ? JSON.parse(idea.fun_facts as string) : [],
              therapeutic_benefits: idea.therapeutic_benefits ? JSON.parse(idea.therapeutic_benefits as string) : [],
              notes: idea.notes,
              status: idea.status,
              created_at: idea.created_at,
              exported_at: new Date().toISOString(),
            };

            const sidecarPath = path.join(destination, `${slug}_${idSuffix}.json`);
            await fs.writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf-8');
          }

          // Update status to Exported
          db.prepare('UPDATE ideas SET status = ? WHERE id = ?').run('Exported', ideaId);

          exported++;
        } catch (error) {
          log.error(`Error exporting idea ${ideaId}:`, error);
          errors.push(`Error exporting idea: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      log.info(`Exported ${exported}/${ideaIds.length} ideas to ${destination}`);
      
      return successResponse({
        exported,
        path: destination,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      log.error('Error running export:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });
}
