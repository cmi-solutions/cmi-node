/**
 * Transaction Type Constants
 * 
 * Supported transaction types for CMI payment gateway.
 */

export const SUPPORTED_TRAN_TYPES = [
    'preauth',
    'auth',
    'postauth',
    'void',
    'credit',
] as const;

export type TranType = typeof SUPPORTED_TRAN_TYPES[number];

/**
 * Check if a transaction type is supported (case-insensitive)
 */
export function isSupportedTranType(type: string): boolean {
    return SUPPORTED_TRAN_TYPES.includes(type.toLowerCase() as TranType);
}

