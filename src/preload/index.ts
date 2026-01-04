import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type IpcResponse } from '../shared/ipc-channels';
import type {
  Idea,
  IdeaFilters,
  Batch,
  AppSettings,
  JobProgress,
  QueueStats,
  ExportOptions,
  GenerationAttempt,
} from '../shared/schemas';

// =============================================================================
// Type-safe API exposed to renderer via contextBridge
// =============================================================================

const huepressApi = {
  // =========================================================================
  // Ideas
  // =========================================================================
  ideas: {
    /**
     * Import a JSON array of ideas
     */
    importJsonArray: (jsonString: string): Promise<IpcResponse<{
      batchId: string;
      imported: number;
      duplicates: number;
      duplicateTitles: string[];
    }>> => ipcRenderer.invoke(IPC_CHANNELS.IDEAS_IMPORT, jsonString),

    /**
     * List ideas with optional filters
     */
    list: (filters: IdeaFilters): Promise<IpcResponse<{
      ideas: Idea[];
      total: number;
      limit: number;
      offset: number;
    }>> => ipcRenderer.invoke(IPC_CHANNELS.IDEAS_LIST, filters),

    /**
     * Get a single idea by ID
     */
    getById: (id: string): Promise<IpcResponse<Idea>> =>
      ipcRenderer.invoke(IPC_CHANNELS.IDEAS_GET_BY_ID, id),

    /**
     * Update idea fields
     */
    updateFields: (
      id: string,
      fields: Partial<Pick<Idea, 'status' | 'title' | 'description' | 'category' | 'skill' | 'notes'>>
    ): Promise<IpcResponse<{ updated: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.IDEAS_UPDATE_FIELDS, { id, fields }),

    /**
     * Delete an idea
     */
    delete: (id: string): Promise<IpcResponse<{ deleted: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.IDEAS_DELETE, id),

    /**
     * Find potential duplicates
     */
    findDuplicates: (): Promise<IpcResponse<{ id: string; batch_id: string; title: string; status: string; created_at: string; image_path?: string; skill?: string; category?: string }[][]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.IDEAS_FIND_DUPLICATES),

    /**
     * Set status for multiple ideas
     */
    setStatus: (
      ids: string[],
      status: Idea['status']
    ): Promise<IpcResponse<{ updated: number }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.IDEAS_SET_STATUS, { ids, status }),

    /**
     * Get generation attempts (history) for an idea
     */
    getAttempts: (id: string): Promise<IpcResponse<GenerationAttempt[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.IDEAS_GET_ATTEMPTS, id),

    /**
     * Set the active version for an idea
     */
    setVersion: (ideaId: string, attemptId: string): Promise<IpcResponse<{ updated: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.IDEAS_SET_VERSION, { ideaId, attemptId }),

    /**
     * Export all ideas as JSON file
     */
    exportJson: (): Promise<IpcResponse<{ exported: number; path?: string; canceled?: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.IDEAS_EXPORT_JSON),
  },

  // =========================================================================
  // Batches
  // =========================================================================
  batches: {
    /**
     * List all batches with status counts
     */
    list: (): Promise<IpcResponse<(Batch & {
      imported_count: number;
      queued_count: number;
      generated_count: number;
      needs_attention_count: number;
      approved_count: number;
      exported_count: number;
    })[]>> => ipcRenderer.invoke(IPC_CHANNELS.BATCHES_LIST),

    /**
     * Get a single batch by ID
     */
    getById: (id: string): Promise<IpcResponse<Batch>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BATCHES_GET_BY_ID, id),

    /**
     * Delete a batch and all associated ideas
     */
    delete: (id: string): Promise<IpcResponse<{ deleted: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BATCHES_DELETE, id),
  },

  // =========================================================================
  // Jobs - Placeholder for M2
  // =========================================================================
  jobs: {
    /**
     * Enqueue ideas for generation
     */
    enqueue: (ideaIds: string[]): Promise<IpcResponse<{ queued: number }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.JOBS_ENQUEUE, ideaIds),

    /**
     * Cancel a running job
     */
    cancel: (jobId: string): Promise<IpcResponse<{ cancelled: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.JOBS_CANCEL, jobId),

    /**
     * Get queue statistics
     */
    getStats: (): Promise<IpcResponse<QueueStats>> =>
      ipcRenderer.invoke(IPC_CHANNELS.JOBS_GET_STATS),

    /**
     * Subscribe to job progress updates
     */
    onProgress: (callback: (progress: JobProgress) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: JobProgress) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.JOBS_PROGRESS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.JOBS_PROGRESS, handler);
    },

    /**
     * Edit an existing image with a text instruction
     */
    edit: (ideaId: string, instruction: string): Promise<IpcResponse<{ queued: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GEN_MODIFY, { ideaId, instruction }),

    /**
     * Stop all active jobs (panic button)
     * Cancels all queued and generating jobs, marks them as Failed
     */
    stopAll: (): Promise<IpcResponse<{ stopped: number }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.JOBS_STOP_ALL),
  },

  // =========================================================================
  // Settings
  // =========================================================================
  settings: {
    /**
     * Get all settings
     */
    get: (): Promise<IpcResponse<AppSettings>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

    /**
     * Update settings
     */
    set: (settings: Partial<AppSettings>): Promise<IpcResponse<{ updated: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),

    /**
     * Store API key securely
     */
    setApiKey: (key: string): Promise<IpcResponse<{ stored: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_API_KEY, key),

    /**
     * Check if API key is configured
     */
    getApiKeyStatus: (): Promise<IpcResponse<{ hasApiKey: boolean; isEncrypted: boolean; hasWebApiKey?: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_API_KEY_STATUS),
      
    /**
     * Store Web API key securely
     */
    setWebApiKey: (key: string): Promise<IpcResponse<{ stored: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_WEB_API_KEY, key),
  },

  // =========================================================================
  // Export - Placeholder for M4
  // =========================================================================
  export: {
    /**
     * Run export for selected ideas
     */
    run: (options: ExportOptions): Promise<IpcResponse<{ exported: number; path: string; errors?: string[] }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_RUN, options),

    /**
     * Open folder selection dialog
     */
    selectFolder: (): Promise<IpcResponse<{ selected: boolean; path: string | null }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SELECT_FOLDER),
  },

  // =========================================================================
  // Vectorize - Image to SVG conversion
  // =========================================================================
  vectorize: {
    /**
     * Check vectorizer API health
     */
    checkHealth: (): Promise<IpcResponse<{ 
      healthy: boolean; 
      status?: string; 
      version?: string; 
      error?: string 
    }>> => ipcRenderer.invoke(IPC_CHANNELS.VECTORIZE_HEALTH),

    /**
     * Submit single image for vectorization
     */
    submit: (ideaId: string): Promise<IpcResponse<{ 
      jobId: string; 
      ideaId: string; 
      status: string 
    }>> => ipcRenderer.invoke(IPC_CHANNELS.VECTORIZE_SUBMIT, ideaId),

    /**
     * Submit batch of images for vectorization
     */
    submitBatch: (ideaIds: string[]): Promise<IpcResponse<{ 
      jobs: { ideaId: string; jobId: string; error?: string }[] 
    }>> => ipcRenderer.invoke(IPC_CHANNELS.VECTORIZE_SUBMIT_BATCH, ideaIds),

    /**
     * Get vectorization job status
     */
    getStatus: (jobId: string): Promise<IpcResponse<{
      jobId: string;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      resultUrl?: string;
      error?: string;
    }>> => ipcRenderer.invoke(IPC_CHANNELS.VECTORIZE_GET_STATUS, jobId),

    /**
     * Download vectorized SVG result
     */
    download: (ideaId: string, jobId: string): Promise<IpcResponse<{
      ideaId: string;
      svgPath: string;
      size: number;
    }>> => ipcRenderer.invoke(IPC_CHANNELS.VECTORIZE_DOWNLOAD, { ideaId, jobId }),

    /**
     * List all vectorization jobs
     */
    listJobs: (): Promise<IpcResponse<Array<{
      id: string;
      idea_id: string;
      status: string;
      result_url: string | null;
      error: string | null;
      created_at: string;
      updated_at: string;
    }>>> => ipcRenderer.invoke(IPC_CHANNELS.VECTORIZE_LIST_JOBS),
  },

  // =========================================================================
  // Batch Jobs (Slow Mode Generation)
  // =========================================================================
  batch: {
    /**
     * Submit ideas to batch generation (50% cheaper, up to 24h turnaround)
     */
    submit: (ideaIds: string[]): Promise<IpcResponse<{
      batchJobId: string;
      geminiJobId: string;
      ideaCount: number;
    }>> => ipcRenderer.invoke(IPC_CHANNELS.BATCH_SUBMIT, ideaIds),

    /**
     * Get status of a batch job
     */
    getStatus: (batchJobId: string): Promise<IpcResponse<{
      id: string;
      gemini_job_id: string | null;
      status: string;
      idea_ids: string;
      created_at: string;
      completed_at: string | null;
      error: string | null;
      geminiStatus?: {
        state: string;
        completedCount?: number;
        failedCount?: number;
      };
    }>> => ipcRenderer.invoke(IPC_CHANNELS.BATCH_GET_STATUS, batchJobId),

    /**
     * List all batch jobs
     */
    list: (): Promise<IpcResponse<Array<{
      id: string;
      gemini_job_id: string | null;
      status: string;
      idea_ids: string;
      created_at: string;
      completed_at: string | null;
      error: string | null;
    }>>> => ipcRenderer.invoke(IPC_CHANNELS.BATCH_LIST),

    /**
     * Manually trigger batch polling
     */
    poll: (): Promise<IpcResponse<{ polled: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BATCH_POLL),
  },

  // =========================================================================
  // App
  // =========================================================================
  app: {
    /**
     * Get application version info
     */
    getVersion: (): Promise<IpcResponse<{
      version: string;
      electron: string;
      node: string;
      chrome: string;
    }>> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),

    /**
     * Select project folder
     */
    selectProjectFolder: (): Promise<IpcResponse<{ selected: boolean; path: string | null }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SELECT_PROJECT_FOLDER),

    /**
     * Get project info and statistics
     */
    getProjectInfo: (): Promise<IpcResponse<{
      databasePath: string;
      assetsPath: string;
      stats: {
        totalIdeas: number;
        totalBatches: number;
        byStatus: Record<string, number>;
      };
    }>> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PROJECT_INFO),
  },
  // =========================================================================
  // Web Sync
  // =========================================================================
  web: {
    /**
     * Sync idea to Web API
     */
    sync: (ideaId: string): Promise<IpcResponse<{ id: string; url: string; [key: string]: any }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WEB_SYNC, ideaId),
  },
};

// Expose API to renderer
contextBridge.exposeInMainWorld('huepress', huepressApi);

// Type declaration for renderer
export type HuepressApi = typeof huepressApi;
