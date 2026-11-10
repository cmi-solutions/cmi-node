/**
 * Configurable Logger
 *
 * Environment-aware logging for the CMI Payment Gateway.
 * In production, only errors are logged by default.
 * Elsewhere, warnings and errors are logged by default.
 * Pass `sink` to send log lines to your own logger (pino, winston, console...).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Any object with these four methods, e.g. console, pino or winston. */
export interface LogSink {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}

export interface LoggerConfig {
    /** Minimum log level to output */
    level: LogLevel;
    /** Prefix for all log messages */
    prefix: string;
    /** Whether logging is enabled */
    enabled: boolean;
    /** Where log lines go. Defaults to the global console. */
    sink?: LogSink;
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
    // A library stays quiet by default: configureLogger({ level: 'debug' }) shows more.
    return 'warn';
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
 * configureLogger({ sink: pinoLogger }); // send lines to your own logger
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
     * Debug level logging (off by default)
     */
    debug: (...args: any[]): void => {
        if (shouldLog('debug')) {
            if (config.sink) config.sink.debug(...formatMessage('debug', ...args));
            else console.log(...formatMessage('debug', ...args));
        }
    },

    /**
     * Info level logging (off by default)
     */
    info: (...args: any[]): void => {
        if (shouldLog('info')) {
            if (config.sink) config.sink.info(...formatMessage('info', ...args));
            else console.log(...formatMessage('info', ...args));
        }
    },

    /**
     * Warning level logging
     */
    warn: (...args: any[]): void => {
        if (shouldLog('warn')) {
            (config.sink ?? console).warn(...formatMessage('warn', ...args));
        }
    },

    /**
     * Error level logging (always enabled by default)
     */
    error: (...args: any[]): void => {
        if (shouldLog('error')) {
            (config.sink ?? console).error(...formatMessage('error', ...args));
        }
    },
};

export default logger;
