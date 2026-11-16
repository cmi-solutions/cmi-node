/**
 * Account Types
 * 
 * Supported account types for CMI payment gateway.
 */

export const SUPPORTED_ACCOUNT_TYPES = [
    'inshore',
    'offshore'
] as const;

export type AccountTypeValue = typeof SUPPORTED_ACCOUNT_TYPES[number];

/**
 * Check if a account type is supported (case-insensitive)
 */
export function isSupportedAccountType(type: string): boolean {
    return SUPPORTED_ACCOUNT_TYPES.includes(type.toLowerCase() as AccountTypeValue);
}

