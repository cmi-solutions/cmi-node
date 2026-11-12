/**
 * Centralized Field Definitions
 * 
 * Single source of truth for all field lists used across the package.
 * This prevents DRY violations and ensures consistency.
 */

/**
 * Optional payment request fields (billing + tel)
 */
export const OPTIONAL_PAYMENT_FIELDS = [
    'BillToCompany',
    'BillToStreet1',
    'BillToStreet2',
    'BillToStreet3',
    'BillToCity',
    'BillToCountry',
    'BillToStateProv',
    'BillToPostalCode',
    'BillToTelVoice',
    'description',
    'tel',
] as const;

export type OptionalPaymentField = typeof OPTIONAL_PAYMENT_FIELDS[number];

/**
 * Standard payment fields (used for filtering custom fields).
 * Every field handled explicitly by the builder must be listed here
 * to prevent it from falling through to addCustomFields.
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
    'sessiontimeout',
    'redirectGet',
    'CallbackResponse',
    ...OPTIONAL_PAYMENT_FIELDS,
] as const;

export type StandardPaymentField = typeof STANDARD_PAYMENT_FIELDS[number];

/**
 * Billing fields that CMI's reference 2.SendData.php cleans with str_without_accents()
 * (accents removed, only a-z A-Z 0-9 _ space - kept) before sending and hashing.
 */
export const PHP_CLEANED_BILLING_FIELDS = [
    'BillToName',
    'BillToCompany',
    'BillToStreet1',
    'BillToCity',
    'BillToStateProv',
    'BillToPostalCode',
    'BillToCountry',
] as const;
