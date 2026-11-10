/**
 * Confirmation Mode Constants
 * 
 * Supported confirmation modes for CMI payment gateway.
 */

export const SUPPORTED_CONFIRMATION_MODES = [
    'auto',
    'manual'
] as const;

export type ConfirmationModeValue = typeof SUPPORTED_CONFIRMATION_MODES[number];

/**
 * Check if a confirmation mode is supported (case-insensitive)
 */
export function isSupportedConfirmationMode(mode: string): boolean {
    return SUPPORTED_CONFIRMATION_MODES.includes(mode.toLowerCase() as ConfirmationModeValue);
}

