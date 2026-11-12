/**
 * Payment Parameters Builder
 * 
 * Responsible for constructing payment parameters for CMI gateway.
 * Extracted from CMIPaymentGateway for Single Responsibility Principle.
 */

import { PaymentRequest } from '@types';
import { PaymentValidator } from '@validators';
import { HashUtil, SanitizationUtil, FormatterUtil, GeneratorUtil, SecretString } from '@utils';
import { logger } from '@logger';
import { normalizeLanguage, AccountTypeValue } from '@constants';
import { OPTIONAL_PAYMENT_FIELDS, STANDARD_PAYMENT_FIELDS, PHP_CLEANED_BILLING_FIELDS } from '@constants/fields';

// Pre-computed at module load — STANDARD_PAYMENT_FIELDS is a constant so this
// never needs to be rebuilt per-request. Fixes a per-call allocation (PERF-2).
const STANDARD_FIELDS_LOWER: ReadonlySet<string> =
    new Set(STANDARD_PAYMENT_FIELDS.map(f => f.toLowerCase()));

export interface PaymentBuilderConfig {
    clientId: string;
    storeKey: string | SecretString;
    storetype: string;
    trantype: string;
    accountType: AccountTypeValue;
    callbackUrl?: string;
    confirmationMode?: string;
}

/**
 * Builds payment parameters for CMI gateway submission
 */
export class PaymentBuilder {
    private readonly config: Omit<PaymentBuilderConfig, 'storeKey'>;
    // ES private field: not reachable from outside the class at runtime,
    // unlike TypeScript's `private` (which `(builder as any).config` bypasses).
    readonly #storeKey: string | SecretString;

    constructor(config: PaymentBuilderConfig) {
        const { storeKey, ...rest } = config;
        this.#storeKey = storeKey;
        this.config = rest;
    }

    /**
     * Create payment parameters for initiating a payment
     *
     * @param paymentRequest Payment request details
     * @returns Payment parameters ready to send to CMI
     */
    build(paymentRequest: PaymentRequest): Record<string, any> {
        // Normalize field names case-insensitively to their canonical form first
        // e.g. "shopurl" -> "shopUrl", "OKURL" -> "okUrl", "billtoname" -> "BillToName"
        // Unknown/custom fields are kept as-is.
        paymentRequest = PaymentValidator.normalizeRequest(paymentRequest as Record<string, any>);

        // Clean the billing fields the way CMI's reference 2.SendData.php does
        // (accents removed, unsupported characters dropped), before validating them.
        paymentRequest = PaymentBuilder.cleanBillingFields(paymentRequest);

        // Validate payment request using existing validator
        PaymentValidator.validate(paymentRequest, this.config.accountType);

        // Generate order ID and random number if not provided
        const oid = paymentRequest.oid || GeneratorUtil.generateOrderId();
        const rnd = paymentRequest.rnd || GeneratorUtil.generateRandom();

        // Build payment parameters
        const params: Record<string, any> = {
            oid,
            rnd,
            clientId: this.config.clientId,
            trantype: this.config.trantype,
            amount: FormatterUtil.formatAmount(paymentRequest.amount),
            currency: FormatterUtil.formatCurrencyNumeric(String(paymentRequest.currency)),
            storetype: FormatterUtil.formatStoreType(this.config.storetype),
            email: SanitizationUtil.sanitizeEmail(paymentRequest.email),
            BillToName: SanitizationUtil.sanitizeString(paymentRequest.BillToName, 255),
            lang: normalizeLanguage(paymentRequest.lang || 'fr'),
            okUrl: paymentRequest.okUrl,
            failUrl: paymentRequest.failUrl,
            shopUrl: paymentRequest.shopUrl,
        };

        // Add hashAlgorithm - use provided value or default to 'ver3'
        // Validator ensures if provided, it must be 'ver3'
        params.hashAlgorithm = paymentRequest.hashAlgorithm ?? 'ver3';

        // Add encoding - use provided value or default to 'UTF-8'
        // Validator ensures if provided, it must be 'UTF-8'
        params.encoding = paymentRequest.encoding ?? 'UTF-8';

        // When CallbackResponse is explicitly false, the server-to-server callback
        // is disabled for this specific payment. In that case callbackUrl must NOT
        // be sent to CMI, and confirmationMode is irrelevant so we omit it too.
        const callbackDisabled = paymentRequest.CallbackResponse === false;

        if (!callbackDisabled && this.config.callbackUrl) {
            params.callbackUrl = this.config.callbackUrl;
        }

        // Add optional billing fields
        this.addOptionalFields(params, paymentRequest);

        // Add AutoRedirect - use provided value or default to false
        // Validator ensures if provided, it must be a boolean
        params.AutoRedirect = FormatterUtil.formatAutoRedirect(paymentRequest.AutoRedirect ?? false);

        // Explicitly forward redirectGet when provided.
        // Must be set before addCustomFields so it is not accidentally
        // treated as a passthrough custom field.
        if (paymentRequest.redirectGet !== undefined) {
            params.redirectGet = paymentRequest.redirectGet;
        }

        // Forward CallbackResponse when explicitly set.
        // false → server-to-server callback disabled (callbackUrl already suppressed above).
        // true  → callback enabled (default CMI behaviour, explicit opt-in).
        if (paymentRequest.CallbackResponse !== undefined) {
            params.CallbackResponse = paymentRequest.CallbackResponse;
        }

        // Explicitly forward sessiontimeout when provided.
        if (paymentRequest.sessiontimeout !== undefined) {
            params.sessiontimeout = paymentRequest.sessiontimeout;
        }

        // Offshore accounts don't use amountCur/symbolCur
        if (this.config.accountType !== 'offshore') {
            // Add amountCur and symbolCur if provided
            if (paymentRequest.amountCur !== undefined && paymentRequest.amountCur > 0) {
                params.amountCur = FormatterUtil.formatAmount(paymentRequest.amountCur);
            }

            if (paymentRequest.symbolCur !== undefined) {
                params.symbolCur = FormatterUtil.formatCurrencyCode(paymentRequest.symbolCur);
            }
        }

        // Add any additional custom fields
        this.addCustomFields(params, paymentRequest);

        // Post exactly the values that are hashed: PHP-trim every text value, as
        // 2.SendData.php does for both the form and the hash.
        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string') {
                params[key] = SanitizationUtil.phpTrim(value);
            } else if (value === undefined || value === null) {
                delete params[key];
            }
        }

        // Run final validation to catch any build-time duplicates
        // (e.g. if the user passed 'shopUrl' in request, but builder also added 'shopurl')
        PaymentValidator.validateFinalParams(params);

        // Generate hash (HASH #1 - Outgoing)
        params.hash = HashUtil.generate(params, this.#storeKey);

        return params;
    }

    /**
     * Apply str_without_accents() (CMI's reference 2.SendData.php) to the billing
     * fields PHP cleans. A required field left empty by the cleaning (e.g. a name
     * written only in Arabic letters) is an error; an optional one is not sent.
     */
    private static cleanBillingFields(request: PaymentRequest): PaymentRequest {
        const cleaned: Record<string, any> = { ...request };
        for (const field of PHP_CLEANED_BILLING_FIELDS) {
            const raw = cleaned[field];
            if (raw === undefined || raw === null) continue;
            if (typeof raw !== 'string' && typeof raw !== 'number') continue; // left to the validator

            const value = SanitizationUtil.removeAccents(String(raw));
            if (value === '' && String(raw).trim() !== '') {
                if (field === 'BillToName') {
                    // The raw value is not echoed: error messages often end up in logs.
                    throw new Error(
                        `BillToName has no character CMI accepts. ` +
                        `Use Latin letters, digits, spaces, "-" or "_" (accents are removed automatically).`
                    );
                }
                delete cleaned[field];
                continue;
            }
            cleaned[field] = value;
        }
        return cleaned as PaymentRequest;
    }

    /**
     * Add optional billing fields to params
     */
    private addOptionalFields(
        params: Record<string, any>,
        paymentRequest: PaymentRequest
    ): void {
        const fieldLimits: Record<string, number> = {
            BillToCompany: 255,
            BillToStreet1: 255,
            BillToStreet2: 255,
            BillToStreet3: 255,
            BillToCity: 64,
            BillToStateProv: 32,
            BillToPostalCode: 32,
            BillToCountry: 3,
            description: 125,
            tel: 32,
        };

        for (const field of OPTIONAL_PAYMENT_FIELDS) {
            // Use explicit null/undefined check so falsy values like '0' or 0
            // are not silently dropped (fixes CORE-6).
            const value = paymentRequest[field];
            if (value !== undefined && value !== null) {
                const limit = fieldLimits[field] || 255; // default to safe 255
                params[field] = SanitizationUtil.sanitizeString(
                    String(value),
                    limit
                );
            }
        }
    }

    /**
     * Add custom fields that weren't already handled
     */
    private addCustomFields(
        params: Record<string, any>,
        paymentRequest: PaymentRequest
    ): void {
        // Use pre-computed module-level Set (avoids per-call allocation).
        const existingKeys = new Set(Object.keys(params).map(k => k.toLowerCase()));

        for (const [key, value] of Object.entries(paymentRequest)) {
            const lowerKey = key.toLowerCase();
            // The hash is always computed by the SDK. A caller-supplied "hash" (any
            // casing) would be posted next to the real one, so it is dropped.
            if (lowerKey === 'hash') {
                logger.warn(`CMI Warning: Custom field '${key}' was ignored; the hash is computed by the SDK.`);
                continue;
            }
            // Skip if: it's a standard field OR already mapped (even with different casing)
            if (!STANDARD_FIELDS_LOWER.has(lowerKey) && !existingKeys.has(lowerKey) && value !== undefined && value !== null) {
                // Enforce a reasonable max length on custom field values (SEC-2).
                const strValue = String(value);
                if (strValue.length > 255) {
                    logger.warn(`CMI Warning: Custom field '${key}' exceeded 255 characters and was truncated to prevent request rejection.`);
                    params[key] = strValue.substring(0, 255);
                } else {
                    params[key] = strValue;
                }
            }
        }
    }
}
