/**
 * Centralized Field Definitions
 * 
 * Single source of truth for all field lists used across the package.
 * This prevents DRY violations and ensures consistency.
 */

/**
 * Billing address fields
 */
export const BILLING_FIELDS = [
    'BillToName',
    'BillToCompany',
    'BillToStreet1',
    'BillToStreet2',
    'BillToStreet3',
    'BillToCity',
    'BillToStateProv',
    'BillToPostalCode',
    'BillToCountry',
] as const;

export type BillingField = typeof BILLING_FIELDS[number];

/**
 * Optional payment request fields (billing + tel)
 */
export const OPTIONAL_PAYMENT_FIELDS = [
    'BillToCity',
    'BillToCountry',
    'BillToStreet1',
    'BillToStateProv',
    'BillToPostalCode',
    'BillToTelVoice',
    'tel',
] as const;

export type OptionalPaymentField = typeof OPTIONAL_PAYMENT_FIELDS[number];

/**
 * Standard payment fields (used for filtering custom fields)
 */
export const STANDARD_PAYMENT_FIELDS = [
    'amount',
    'oid',
    'okUrl',
    'failUrl',
    'shopUrl',
    'email',
    'BillToName',
    'rnd',
    'encoding',
    'currency',
    'lang',
    'hashAlgorithm',
    'AutoRedirect',
    'amountCur',
    'symbolCur',
    ...OPTIONAL_PAYMENT_FIELDS,
] as const;

export type StandardPaymentField = typeof STANDARD_PAYMENT_FIELDS[number];

/**
 * Fields to exclude from hash calculation
 */
export const HASH_EXCLUDED_FIELDS = ['hash', 'HASH', 'encoding'] as const;

/**
 * Fields requiring special sanitization in hash generation
 */
export const HASH_SANITIZE_FIELDS = [
    'BillToName',
    'BillToCompany',
    'BillToStreet1',
    'BillToCity',
    'BillToStateProv',
    'BillToPostalCode',
    'BillToCountry',
] as const;
