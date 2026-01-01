/**
 * IPC Channel definitions
 * All IPC communication must use these typed channels
 */

// =============================================================================
// Channel Names (type-safe string literals)
// =============================================================================

export const IPC_CHANNELS = {
  // Ideas
  IDEAS_IMPORT: 'ideas:import-json-array',
  IDEAS_LIST: 'ideas:list',
  IDEAS_GET_BY_ID: 'ideas:get-by-id',
  IDEAS_UPDATE_FIELDS: 'ideas:update-fields',
  IDEAS_DELETE: 'ideas:delete',
  IDEAS_SET_STATUS: 'ideas:set-status',
  IDEAS_GET_ATTEMPTS: 'ideas:get-attempts',
  IDEAS_SET_VERSION: 'ideas:set-version',
  IDEAS_FIND_DUPLICATES: 'ideas:find-duplicates',
  IDEAS_RESET_IGNORE_DUPLICATES: 'ideas:reset-ignore-duplicates',

  // Jobs
  JOBS_ENQUEUE: 'jobs:enqueue',
  JOBS_CANCEL: 'jobs:cancel',
  JOBS_RETRY: 'jobs:retry',
  JOBS_GET_STATS: 'jobs:get-stats',
  JOBS_PROGRESS: 'jobs:progress', // Event channel
  JOBS_STOP_ALL: 'jobs:stop-all', // Panic button

  // Generation
  GEN_REGENERATE: 'gen:regenerate',
  GEN_MODIFY: 'gen:modify',
  GEN_GET_HISTORY: 'gen:get-history',

  // Export
  EXPORT_RUN: 'export:run',
  EXPORT_SELECT_FOLDER: 'export:select-folder',
  EXPORT_GET_RUNS: 'export:get-runs',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_SET_API_KEY: 'settings:set-api-key',
  SETTINGS_GET_API_KEY_STATUS: 'settings:get-api-key-status',

  // Batches
  BATCHES_LIST: 'batches:list',
  BATCHES_GET_BY_ID: 'batches:get-by-id',
  BATCHES_DELETE: 'batches:delete',

  // App
  APP_GET_VERSION: 'app:get-version',
  APP_SELECT_PROJECT_FOLDER: 'app:select-project-folder',
  APP_GET_PROJECT_INFO: 'app:get-project-info',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// =============================================================================
// Response wrapper for consistent error handling
// =============================================================================

export type IpcResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export function successResponse<T>(data: T): IpcResponse<T> {
  return { success: true, data };
}

export function errorResponse(error: string, code?: string): IpcResponse<never> {
  return { success: false, error, code };
}
