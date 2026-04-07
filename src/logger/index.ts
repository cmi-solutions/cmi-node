/**
 * Configurable Logger
 * 
 * Environment-aware logging for the CMI Payment Gateway.
 * In production, only errors are logged by default.
 * In development, all logs are shown.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
    /** Minimum log level to output */
    level: LogLevel;
    /** Prefix for all log messages */
    prefix: string;
    /** Whether logging is enabled */
    enabled: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

function getDefaultLogLevel(): LogLevel {
    try {
        if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
            return 'error';
        }
    } catch {
        // process.env access may throw in some edge runtimes
    }
    return 'debug';
}

const defaultConfig: LoggerConfig = {
    level: getDefaultLogLevel(),
    prefix: '[CMI Gateway]',
    enabled: true,
};

let config: LoggerConfig = { ...defaultConfig };

/**
 * Configure the logger
 * 
 * @example
 * ```typescript
 * configureLogger({ level: 'info', enabled: true });
 * ```
 */
export function configureLogger(options: Partial<LoggerConfig>): void {
    config = { ...config, ...options };
}

/**
 * Reset logger to default configuration
 */
export function resetLogger(): void {
    config = { ...defaultConfig };
}

function shouldLog(level: LogLevel): boolean {
    if (!config.enabled) return false;
    return LOG_LEVELS[level] >= LOG_LEVELS[config.level];
}

function formatMessage(level: LogLevel, ...args: any[]): string[] {
    const timestamp = new Date().toISOString();
    return [`${config.prefix} [${level.toUpperCase()}] ${timestamp}`, ...args];
}

/**
 * Logger instance with environment-aware logging
 */
export const logger = {
    /**
     * Debug level logging (development only by default)
     */
    debug: (...args: any[]): void => {
        if (shouldLog('debug')) {
            console.log(...formatMessage('debug', ...args));
        }
    },

    /**
     * Info level logging
     */
    info: (...args: any[]): void => {
        if (shouldLog('info')) {
            console.log(...formatMessage('info', ...args));
        }
    },

    /**
     * Warning level logging
     */
    warn: (...args: any[]): void => {
        if (shouldLog('warn')) {
            console.warn(...formatMessage('warn', ...args));
        }
    },

    /**
     * Error level logging (always enabled by default)
     */
    error: (...args: any[]): void => {
        if (shouldLog('error')) {
            console.error(...formatMessage('error', ...args));
        }
    },
};

export default logger;
