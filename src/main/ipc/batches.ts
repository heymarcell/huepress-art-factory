import { ipcMain } from 'electron';
import log from 'electron-log/main';
import { getDatabase } from '../database';
import { IPC_CHANNELS, successResponse, errorResponse } from '../../shared/ipc-channels';
import type { Batch } from '../../shared/schemas';

// =============================================================================
// Handlers
// =============================================================================

export function registerBatchesHandlers(): void {
  // List all batches
  ipcMain.handle(IPC_CHANNELS.BATCHES_LIST, async () => {
    try {
      const db = getDatabase();

      const rows = db.prepare(`
        SELECT 
          b.*,
          COUNT(CASE WHEN i.status = 'Imported' THEN 1 END) as imported_count,
          COUNT(CASE WHEN i.status = 'Queued' THEN 1 END) as queued_count,
          COUNT(CASE WHEN i.status = 'Generated' THEN 1 END) as generated_count,
          COUNT(CASE WHEN i.status = 'NeedsAttention' THEN 1 END) as needs_attention_count,
          COUNT(CASE WHEN i.status = 'Approved' THEN 1 END) as approved_count,
          COUNT(CASE WHEN i.status = 'Exported' THEN 1 END) as exported_count
        FROM batches b
        LEFT JOIN ideas i ON i.batch_id = b.id
        GROUP BY b.id
        ORDER BY b.imported_at DESC
      `).all() as (Batch & {
        imported_count: number;
        queued_count: number;
        generated_count: number;
        needs_attention_count: number;
        approved_count: number;
        exported_count: number;
      })[];

      return successResponse(rows);
    } catch (error) {
      log.error('Error listing batches:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Get batch by ID
  ipcMain.handle(IPC_CHANNELS.BATCHES_GET_BY_ID, async (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') {
        return errorResponse('ID must be a string');
      }

      const db = getDatabase();
      const row = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as Batch | undefined;

      if (!row) {
        return errorResponse('Batch not found', 'NOT_FOUND');
      }

      return successResponse(row);
    } catch (error) {
      log.error('Error getting batch:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Delete batch (cascades to ideas)
  ipcMain.handle(IPC_CHANNELS.BATCHES_DELETE, async (_event, id: unknown) => {
    try {
      if (typeof id !== 'string') {
        return errorResponse('ID must be a string');
      }

      const db = getDatabase();
      const result = db.prepare('DELETE FROM batches WHERE id = ?').run(id);

      if (result.changes === 0) {
        return errorResponse('Batch not found', 'NOT_FOUND');
      }

      log.info(`Deleted batch ${id} and associated ideas`);
      return successResponse({ deleted: true });
    } catch (error) {
      log.error('Error deleting batch:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });
}
