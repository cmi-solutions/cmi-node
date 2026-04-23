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

/**
 * Normalize account type to the canonical format (lowercase)
 */
export function normalizeAccountType(type: string): AccountTypeValue {
    const normalized = type.toLowerCase() as AccountTypeValue;
    if (!SUPPORTED_ACCOUNT_TYPES.includes(normalized)) {
        throw new Error(`Unsupported account type: ${type}. Supported types: ${SUPPORTED_ACCOUNT_TYPES.join(', ')}`);
    }
    return normalized;
}
