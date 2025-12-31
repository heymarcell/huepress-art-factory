import log from 'electron-log/main';

/**
 * Logger configuration and utilities
 * Wraps electron-log with application-specific settings
 */

// Configure log levels based on environment
const isDev = process.env.NODE_ENV === 'development';

// Configure transports
log.transports.file.level = 'info';
log.transports.console.level = isDev ? 'debug' : 'warn';

// Set log format
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.console.format = '{h}:{i}:{s} [{level}] {text}';

// Export configured logger
export const logger = {
  debug: log.debug.bind(log),
  info: log.info.bind(log),
  warn: log.warn.bind(log),
  error: log.error.bind(log),

  /**
   * Log an error with stack trace
   */
  exception: (message: string, error: unknown): void => {
    if (error instanceof Error) {
      log.error(`${message}: ${error.message}`);
      if (error.stack) {
        log.debug(error.stack);
      }
    } else {
      log.error(`${message}: ${String(error)}`);
    }
  },

  /**
   * Create a child logger with a prefix
   */
  child: (prefix: string) => ({
    debug: (msg: string, ...args: unknown[]) => log.debug(`[${prefix}] ${msg}`, ...args),
    info: (msg: string, ...args: unknown[]) => log.info(`[${prefix}] ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) => log.warn(`[${prefix}] ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) => log.error(`[${prefix}] ${msg}`, ...args),
  }),

  /**
   * Get the path to the log file
   */
  getLogPath: (): string => {
    return log.transports.file.getFile()?.path || '';
  },
};

export default logger;
