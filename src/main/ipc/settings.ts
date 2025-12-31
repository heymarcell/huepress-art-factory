import { ipcMain, safeStorage, app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import log from 'electron-log/main';
import { IPC_CHANNELS, successResponse, errorResponse } from '../../shared/ipc-channels';
import type { AppSettings } from '../../shared/schemas';

// =============================================================================
// Simple JSON-based Settings Store (to avoid ESM issues with electron-store)
// =============================================================================

interface StoredSettings {
  projectPath: string | null;
  assetsPath: string | null;
  exportsPath: string | null;
  concurrency: number;
  promptTemplateVersion: string;
  theme: 'light' | 'dark' | 'system';
  hasApiKey: boolean;
  encryptedApiKey: string | null;
}

const defaults: StoredSettings = {
  projectPath: null,
  assetsPath: null,
  exportsPath: null,
  concurrency: 3,
  promptTemplateVersion: 'v1.0.0',
  theme: 'system',
  hasApiKey: false,
  encryptedApiKey: null,
};

let settings: StoredSettings = { ...defaults };
let settingsPath: string | null = null;

function getSettingsPath(): string {
  if (!settingsPath) {
    settingsPath = path.join(app.getPath('userData'), 'huepress-settings.json');
  }
  return settingsPath;
}

function loadSettings(): void {
  try {
    const filePath = getSettingsPath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const loaded = JSON.parse(data);
      settings = { ...defaults, ...loaded };
      log.info('Settings loaded from:', filePath);
    }
    
    // Ensure default assets path is set if missing
    if (!settings.assetsPath) {
      settings.assetsPath = path.join(app.getPath('userData'), 'assets');
      if (!fs.existsSync(settings.assetsPath)) {
        fs.mkdirSync(settings.assetsPath, { recursive: true });
      }
      log.info('Default assets path configured:', settings.assetsPath);
    }
  } catch (error) {
    log.error('Error loading settings:', error);
    settings = { ...defaults };
  }
}

function saveSettings(): void {
  try {
    const filePath = getSettingsPath();
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
    log.debug('Settings saved');
  } catch (error) {
    log.error('Error saving settings:', error);
  }
}

// Load settings on module init
loadSettings();

// =============================================================================
// Handlers
// =============================================================================

export function registerSettingsHandlers(): void {
  // Ensure settings are loaded
  loadSettings();

  // Get settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    try {
      const result: AppSettings = {
        projectPath: settings.projectPath,
        assetsPath: settings.assetsPath,
        exportsPath: settings.exportsPath,
        concurrency: settings.concurrency,
        promptTemplateVersion: settings.promptTemplateVersion,
        theme: settings.theme,
      };

      return successResponse(result);
    } catch (error) {
      log.error('Error getting settings:', error);
      return errorResponse('Failed to get settings');
    }
  });

  // Set settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, updates: unknown) => {
    try {
      if (typeof updates !== 'object' || updates === null) {
        return errorResponse('Settings must be an object');
      }

      const partial = updates as Partial<AppSettings>;

      if (partial.projectPath !== undefined) {
        settings.projectPath = partial.projectPath;
      }
      if (partial.assetsPath !== undefined) {
        settings.assetsPath = partial.assetsPath;
      }
      if (partial.exportsPath !== undefined) {
        settings.exportsPath = partial.exportsPath;
      }
      if (partial.concurrency !== undefined) {
        settings.concurrency = Math.max(1, Math.min(10, partial.concurrency));
      }
      if (partial.promptTemplateVersion !== undefined) {
        settings.promptTemplateVersion = partial.promptTemplateVersion;
      }
      if (partial.theme !== undefined) {
        settings.theme = partial.theme;
      }

      saveSettings();
      log.info('Settings updated');
      return successResponse({ updated: true });
    } catch (error) {
      log.error('Error setting settings:', error);
      return errorResponse('Failed to update settings');
    }
  });

  // Set API key (encrypted with safeStorage)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_API_KEY, async (_event, apiKey: unknown) => {
    try {
      if (typeof apiKey !== 'string') {
        return errorResponse('API key must be a string');
      }

      if (!safeStorage.isEncryptionAvailable()) {
        log.warn('Encryption not available, storing API key in plain text');
        settings.encryptedApiKey = apiKey;
      } else {
        const encrypted = safeStorage.encryptString(apiKey);
        settings.encryptedApiKey = encrypted.toString('base64');
      }

      settings.hasApiKey = true;
      saveSettings();
      log.info('API key stored securely');

      return successResponse({ stored: true });
    } catch (error) {
      log.error('Error storing API key:', error);
      return errorResponse('Failed to store API key');
    }
  });

  // Get API key status (never expose the actual key to renderer!)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_API_KEY_STATUS, async () => {
    try {
      return successResponse({
        hasApiKey: settings.hasApiKey,
        isEncrypted: safeStorage.isEncryptionAvailable(),
      });
    } catch (error) {
      log.error('Error getting API key status:', error);
      return errorResponse('Failed to get API key status');
    }
  });
}

/**
 * Get the decrypted API key (for internal use in main process only!)
 * Never expose this to the renderer process
 */
export function getApiKey(): string | null {
  try {
    if (!settings.hasApiKey || !settings.encryptedApiKey) {
      return null;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      return settings.encryptedApiKey;
    }

    const encrypted = Buffer.from(settings.encryptedApiKey, 'base64');
    return safeStorage.decryptString(encrypted);
  } catch (error) {
    log.error('Error decrypting API key:', error);
    return null;
  }
}

export function getSettings(): StoredSettings {
  return settings;
}
