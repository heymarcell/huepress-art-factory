import { app, BrowserWindow, session, protocol } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import log from 'electron-log/main';
import { initializeDatabase } from './database';
import { registerIpcHandlers } from './ipc';
import { setupSecurity, CSP } from './security';
import { startBatchPoller, stopBatchPoller } from './services/batch-poller';

// Register custom protocol privileges
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true, // Additional safety
      stream: true,
    },
  },
]);

// Configure logging
log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Suppress annoying DevTools/Autofill warnings
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');

// Declare for Vite plugin globals
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
  log.info('Creating main window with secure defaults');

  // Create the browser window with security-hardened settings
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'HuePress Art Factory',
    backgroundColor: '#0a0a0b',
    show: false, // Show when ready to prevent flash
    webPreferences: {
      preload: path.join(__dirname, 'index.js'),
      // Security settings (enforced even though many are now defaults)
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  // Set Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the app
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development' || MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const initialize = async (): Promise<void> => {
  try {
    log.info('Initializing HuePress Art Factory...');
    log.info(`Electron version: ${process.versions.electron}`);
    log.info(`Node version: ${process.versions.node}`);
    log.info(`Chrome version: ${process.versions.chrome}`);

    // Initialize database
    await initializeDatabase();
    log.info('Database initialized');

    // Initialize job queue (cleanup stale jobs from previous session)
    const { jobQueue } = await import('./services/queue');
    jobQueue.init();

    // Register IPC handlers
    registerIpcHandlers();
    log.info('IPC handlers registered');

    // Register asset protocol for loading local images
    session.defaultSession.protocol.registerFileProtocol('asset', (request, callback) => {
      const url = request.url.replace('asset://', '');
      try {
        const decodedUrl = decodeURIComponent(url);
        // On macOS/Linux, absolute paths start with / so we need to ensure we don't lose it if stripped
        // Use standard URL parsing if possible, or just treat as path
        // request.url is "asset:///Users/..."
        // url becomes "/Users/..." which is correct for *nix
        callback(decodedUrl);
      } catch (error) {
        log.error('Failed to register file protocol', error);
      }
    });

    // Setup security handlers
    setupSecurity(session.defaultSession);
    log.info('Security handlers configured');

    // Create the window
    createWindow();

    // Start batch poller for slow mode generation
    startBatchPoller();
  } catch (error) {
    log.error('Failed to initialize application:', error);
    app.quit();
  }
};

// App ready
app.whenReady().then(initialize);

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBatchPoller();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => {
    log.warn('Blocked attempt to open new window');
    return { action: 'deny' };
  });

  // Prevent navigation away from the app
  contents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    // Allow dev server navigation
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const devUrl = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
      if (parsedUrl.origin === devUrl.origin) {
        return;
      }
    }
    log.warn(`Blocked navigation to: ${url}`);
    event.preventDefault();
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});
