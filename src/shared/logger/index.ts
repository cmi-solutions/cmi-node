/**
 * Configurable Logger
 *
 * Environment-aware logging for the CMI Payment Gateway.
 * In production, only errors are logged by default.
 * Elsewhere, warnings and errors are logged by default.
 * Pass `sink` to send log lines to your own logger (pino, winston, console...).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Any object with these four methods, e.g. console, pino or winston.
 * Each method receives ONE string: prefix, level, time, the message and, for an
 * error, its stack. (pino keeps only its first string argument as the message.)
 */
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

function formatMessage(level: LogLevel, ...args: unknown[]): unknown[] {
    const timestamp = new Date().toISOString();
    return [`${config.prefix} [${level.toUpperCase()}] ${timestamp}`, ...args];
}

/** One log argument as text: an error as its stack (or name and message). */
function argToText(arg: unknown): string {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
    try {
        return typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : String(arg);
    } catch {
        return String(arg);
    }
}

function write(level: LogLevel, args: unknown[]): void {
    if (!shouldLog(level)) return;
    const parts = formatMessage(level, ...args);
    if (config.sink) {
        // A single string, so loggers that keep only the first argument (pino) lose nothing.
        config.sink[level](parts.map(argToText).join(' '));
        return;
    }
    if (level === 'warn') console.warn(...parts);
    else if (level === 'error') console.error(...parts);
    else console.log(...parts);
}

/**
 * Logger instance with environment-aware logging
 */
export const logger = {
    /** Debug level logging (off by default) */
    debug: (...args: unknown[]): void => write('debug', args),

    /** Info level logging (off by default) */
    info: (...args: unknown[]): void => write('info', args),

    /** Warning level logging */
    warn: (...args: unknown[]): void => write('warn', args),

    /** Error level logging (always enabled by default) */
    error: (...args: unknown[]): void => write('error', args),
};

export default logger;
