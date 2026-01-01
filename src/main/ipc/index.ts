import { ipcMain, dialog } from 'electron';
import log from 'electron-log/main';
import { IPC_CHANNELS, successResponse, errorResponse } from '../../shared/ipc-channels';
import { registerIdeasHandlers } from './ideas';
import { registerSettingsHandlers } from './settings';
import { registerBatchesHandlers } from './batches';
import { registerJobsHandlers } from './jobs';
import { registerExportHandlers } from './export';

/**
 * Register all IPC handlers
 * Each module registers its own handlers for separation of concerns
 */
export function registerIpcHandlers(): void {
  log.info('Registering IPC handlers...');

  // Register module handlers
  registerIdeasHandlers();
  registerSettingsHandlers();
  registerBatchesHandlers();
  registerJobsHandlers();
  registerExportHandlers();

  // App-level handlers
  registerAppHandlers();

  log.info(`Registered ${Object.keys(IPC_CHANNELS).length} IPC channels`);
}

/**
 * App-level IPC handlers
 */
function registerAppHandlers(): void {
  // Get app version
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, async () => {
    const { app } = await import('electron');
    return successResponse({
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    });
  });

  // Select project folder
  ipcMain.handle(IPC_CHANNELS.APP_SELECT_PROJECT_FOLDER, async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Project Folder',
        properties: ['openDirectory', 'createDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return successResponse({ selected: false, path: null });
      }

      return successResponse({
        selected: true,
        path: result.filePaths[0],
      });
    } catch (error) {
      log.error('Error selecting project folder:', error);
      return errorResponse('Failed to select folder');
    }
  });

  // Get project info
  ipcMain.handle(IPC_CHANNELS.APP_GET_PROJECT_INFO, async () => {
    try {
      const { getDatabasePath, getAssetsPath } = await import('../database');
      const { getDatabase } = await import('../database');

      const db = getDatabase();

      // Get counts
      const ideasCount = db.prepare('SELECT COUNT(*) as count FROM ideas').get() as { count: number };
      const batchesCount = db.prepare('SELECT COUNT(*) as count FROM batches').get() as { count: number };
      const statusCounts = db.prepare(`
        SELECT status, COUNT(*) as count 
        FROM ideas 
        GROUP BY status
      `).all() as { status: string; count: number }[];

      return successResponse({
        databasePath: getDatabasePath(),
        assetsPath: getAssetsPath(),
        stats: {
          totalIdeas: ideasCount.count,
          totalBatches: batchesCount.count,
          byStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s.count])),
        },
      });
    } catch (error) {
      log.error('Error getting project info:', error);
      return errorResponse('Failed to get project info');
    }
  });
}
