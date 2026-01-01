import { ipcMain } from 'electron';
import log from 'electron-log/main';
import { IPC_CHANNELS, successResponse, errorResponse } from '../../shared/ipc-channels';
import { jobQueue } from '../services/queue';

/**
 * Jobs IPC handlers
 * Implements M2 generation pipeline + M3 edit functionality.
 */

export function registerJobsHandlers(): void {
  // Enqueue ideas for generation
  ipcMain.handle(IPC_CHANNELS.JOBS_ENQUEUE, async (_event, ideaIds: unknown) => {
    try {
      if (!Array.isArray(ideaIds)) {
        return errorResponse('ideaIds must be an array');
      }

      await jobQueue.add(ideaIds as string[]);
      const stats = await jobQueue.getStats();

      return successResponse({
        queued: ideaIds.length,
        message: 'Jobs enqueued successfully',
        stats // Return updated stats
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

      await jobQueue.cancel(jobId);

      return successResponse({
        cancelled: true,
        message: 'Job cancelled',
      });
    } catch (error) {
      log.error('Error cancelling job:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Retry a failed job (re-enqueue)
  ipcMain.handle(IPC_CHANNELS.JOBS_RETRY, async (_event, jobId: unknown) => {
    try {
      if (typeof jobId !== 'string') {
        return errorResponse('jobId must be a string');
      }
      
      // Retry is effectively just re-adding to queue
      await jobQueue.add([jobId]);

      return successResponse({
        retried: true,
        message: 'Job re-queued',
      });
    } catch (error) {
      log.error('Error retrying job:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // Get queue statistics
  ipcMain.handle(IPC_CHANNELS.JOBS_GET_STATS, async () => {
    try {
      const stats = await jobQueue.getStats();
      return successResponse(stats);
    } catch (error) {
      log.error('Error getting job stats:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // M3: Edit an existing image with a text instruction
  ipcMain.handle(IPC_CHANNELS.GEN_MODIFY, async (_event, payload: unknown) => {
    try {
      const { ideaId, instruction } = payload as { ideaId: string; instruction: string };
      
      if (!ideaId || typeof ideaId !== 'string') {
        return errorResponse('ideaId is required');
      }
      if (!instruction || typeof instruction !== 'string') {
        return errorResponse('instruction is required');
      }

      // Enqueue as an edit job
      await jobQueue.addEdit(ideaId, instruction);
      
      return successResponse({
        queued: true,
        message: 'Edit job enqueued',
      });
    } catch (error) {
      log.error('Error enqueueing edit job:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  // M3: Stop all active jobs (panic button)
  ipcMain.handle(IPC_CHANNELS.JOBS_STOP_ALL, async () => {
    try {
      const stopped = await jobQueue.stopAll();
      return successResponse({ stopped });
    } catch (error) {
      log.error('Error stopping all jobs:', error);
      return errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  });

  log.info('[Jobs] Handlers registered (M2 + M3 implementation)');
}
