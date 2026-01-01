import { Session } from 'electron';
import { z } from 'zod';
import log from 'electron-log/main';
import path from 'node:path';

/**
 * Content Security Policy
 * Strict CSP that only allows local resources
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // Required for some UI libraries
  "img-src 'self' data: file: blob: asset:", // Local images and blobs for preview
  "font-src 'self' data:",
  "connect-src 'self'", // No external connections from renderer
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

/**
 * Setup permission handler - deny all by default
 */
export function setupSecurity(session: Session): void {
  // Deny all permission requests
  session.setPermissionRequestHandler((webContents, permission, callback) => {
    log.warn(`Permission request denied: ${permission}`);
    callback(false);
  });

  // Deny all permission checks
  session.setPermissionCheckHandler((webContents, permission) => {
    log.debug(`Permission check for: ${permission}`);
    return false;
  });
}

/**
 * Validate IPC payloads using Zod schema
 * Treats renderer input as completely untrusted
 */
export function validateIpcPayload<T>(
  schema: z.ZodSchema<T>,
  payload: unknown,
  channelName: string
): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    log.error(`IPC validation failed for ${channelName}: ${errors}`);
    throw new Error(`Invalid payload for ${channelName}: ${errors}`);
  }
  return result.data;
}

/**
 * Sanitize and validate file paths to prevent path traversal
 */
export function sanitizePath(basePath: string, relativePath: string): string {

  const resolved = path.resolve(basePath, relativePath);

  // Ensure the resolved path is within the base path
  if (!resolved.startsWith(path.resolve(basePath))) {
    throw new Error('Path traversal attempt detected');
  }

  return resolved;
}

/**
 * Redact sensitive information from logs
 */
export function redactSensitive(text: string): string {
  // Redact API keys (common patterns)
  return text
    .replace(/AIza[a-zA-Z0-9_-]{35}/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/"api[_-]?key"\s*:\s*"[^"]+"/gi, '"api_key": "[REDACTED]"');
}
