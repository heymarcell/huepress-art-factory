import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import log from 'electron-log/main';
import { runMigrations } from './migrations';

let db: Database.Database | null = null;

/**
 * Get the database path
 * In production: userData/huepress.db
 * In development: project root/dev-data/huepress.db
 */
export function getDatabasePath(): string {
  const isProduction = !process.env.NODE_ENV || process.env.NODE_ENV === 'production';

  if (isProduction) {
    return path.join(app.getPath('userData'), 'huepress.db');
  } else {
    // Development: use a local folder
    const devDataPath = path.join(process.cwd(), 'dev-data');
    if (!fs.existsSync(devDataPath)) {
      fs.mkdirSync(devDataPath, { recursive: true });
    }
    return path.join(devDataPath, 'huepress.db');
  }
}

/**
 * Get the assets directory path
 */
export function getAssetsPath(): string {
  const dbPath = getDatabasePath();
  const basePath = path.dirname(dbPath);
  const assetsPath = path.join(basePath, 'assets');

  if (!fs.existsSync(assetsPath)) {
    fs.mkdirSync(assetsPath, { recursive: true });
  }

  return assetsPath;
}

/**
 * Initialize the database connection
 */
export async function initializeDatabase(): Promise<void> {
  const dbPath = getDatabasePath();
  log.info(`Initializing database at: ${dbPath}`);

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Create/open database
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run migrations
  await runMigrations(db);

  log.info('Database initialized successfully');
}

/**
 * Get the database instance
 * Throws if not initialized
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log.info('Database closed');
  }
}

// Ensure database is closed on app exit
app.on('before-quit', () => {
  closeDatabase();
});
