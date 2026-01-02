import path from 'node:path';
import fs from 'node:fs';
import log from 'electron-log/main';

/**
 * Safely join paths and ensure the result is within the base directory
 * Prevents directory traversal attacks
 */
export function safePath(basePath: string, ...segments: string[]): string {
  const resolvedBase = path.resolve(basePath);
  const resolvedPath = path.resolve(resolvedBase, ...segments);

  if (!resolvedPath.startsWith(resolvedBase)) {
    log.error(`Path traversal attempt blocked: ${segments.join('/')}`);
    throw new Error('Invalid path: traversal not allowed');
  }

  return resolvedPath;
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    log.debug(`Created directory: ${dirPath}`);
  }
}

/**
 * Get a safe filename from user input
 * Removes or replaces dangerous characters
 */
export function sanitizeFilename(filename: string): string {
  return filename
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Replace dangerous chars
    .replace(/\.{2,}/g, '.') // Prevent .. sequences
    .replace(/^\.+/, '') // Remove leading dots
    .trim()
    .slice(0, 255); // Limit length
}

/**
 * Check if a path is within allowed directories
 */
export function isPathAllowed(targetPath: string, allowedPaths: string[]): boolean {
  const resolvedTarget = path.resolve(targetPath).toLowerCase();
  return allowedPaths.some((allowed) => {
    const resolvedAllowed = path.resolve(allowed).toLowerCase();
    return resolvedTarget.startsWith(resolvedAllowed);
  });
}

/**
 * Get file extension safely
 */
export function getExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

/**
 * Check if path exists and is a file
 */
export function isFile(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Check if path exists and is a directory
 */
export function isDirectory(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
