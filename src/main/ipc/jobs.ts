import { ipcMain } from 'electron';
import log from 'electron-log/main';
import { IPC_CHANNELS, successResponse, errorResponse } from '../../shared/ipc-channels';

/**
 * Jobs IPC handlers
 * Note: Full implementation is M2 scope. These are stubs for the API surface.
 */

export function registerJobsHandlers(): void {
  // Enqueue ideas for generation
  ipcMain.handle(IPC_CHANNELS.JOBS_ENQUEUE, async (_event, ideaIds: unknown) => {
    try {
      if (!Array.isArray(ideaIds)) {
        return errorResponse('ideaIds must be an array');
      }

      // TODO (M2): Implement actual job queue
      log.info(`[Jobs] Enqueue requested for ${ideaIds.length} ideas (not yet implemented)`);

      return successResponse({
        queued: 0,
        message: 'Job queue not yet implemented (M2)',
      });
    } catch (error) {
      log.error('Error enqueueing jobs:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Cancel a running job
  ipcMain.handle(IPC_CHANNELS.JOBS_CANCEL, async (_event, jobId: unknown) => {
    try {
      if (typeof jobId !== 'string') {
        return errorResponse('jobId must be a string');
      }

      // TODO (M2): Implement actual job cancellation
      log.info(`[Jobs] Cancel requested for job ${jobId} (not yet implemented)`);

      return successResponse({
        cancelled: false,
        message: 'Job queue not yet implemented (M2)',
      });
    } catch (error) {
      log.error('Error cancelling job:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Retry a failed job
  ipcMain.handle(IPC_CHANNELS.JOBS_RETRY, async (_event, jobId: unknown) => {
    try {
      if (typeof jobId !== 'string') {
        return errorResponse('jobId must be a string');
      }

      // TODO (M2): Implement actual job retry
      log.info(`[Jobs] Retry requested for job ${jobId} (not yet implemented)`);

      return errorResponse('Job queue not yet implemented (M2)');
    } catch (error) {
      log.error('Error retrying job:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Get queue statistics
  ipcMain.handle(IPC_CHANNELS.JOBS_GET_STATS, async () => {
    try {
      // TODO (M2): Return actual queue stats
      return successResponse({
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
      });
    } catch (error) {
      log.error('Error getting job stats:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  log.info('[Jobs] Handlers registered (stubs for M2)');
}
