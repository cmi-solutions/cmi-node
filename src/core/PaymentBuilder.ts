/**
 * Payment Parameters Builder
 * 
 * Responsible for constructing payment parameters for CMI gateway.
 * Extracted from CMIPaymentGateway for Single Responsibility Principle.
 */

import { PaymentRequest } from '@types';
import { PaymentValidator } from '@validators';
import { HashUtil, SanitizationUtil, FormatterUtil, GeneratorUtil, SecretString } from '@utils';
import { normalizeLanguage } from '@constants';
import { OPTIONAL_PAYMENT_FIELDS, STANDARD_PAYMENT_FIELDS } from '@constants/fields';

// Pre-computed at module load — STANDARD_PAYMENT_FIELDS is a constant so this
// never needs to be rebuilt per-request. Fixes a per-call allocation (PERF-2).
const STANDARD_FIELDS_LOWER: ReadonlySet<string> =
    new Set(STANDARD_PAYMENT_FIELDS.map(f => f.toLowerCase()));

export interface PaymentBuilderConfig {
    clientId: string;
    storeKey: string | SecretString;
    storetype: string;
    trantype: string;
    callbackUrl?: string;
}

/**
 * Builds payment parameters for CMI gateway submission
 */
export class PaymentBuilder {
    private readonly config: PaymentBuilderConfig;

    constructor(config: PaymentBuilderConfig) {
        this.config = config;
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

        // Validate payment request using existing validator
        PaymentValidator.validate(paymentRequest);

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
            BillToName: SanitizationUtil.sanitizeString(paymentRequest.BillToName, 50),
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

        // Add callbackUrl if provided in config
        if (this.config.callbackUrl) {
            params.callbackUrl = this.config.callbackUrl;
        }

        // Add optional billing fields
        this.addOptionalFields(params, paymentRequest);

        // Add AutoRedirect - use provided value or default to false
        // Validator ensures if provided, it must be a boolean
        params.AutoRedirect = FormatterUtil.formatAutoRedirect(paymentRequest.AutoRedirect ?? false);

        // Add amountCur and symbolCur if provided
        if (paymentRequest.amountCur !== undefined && paymentRequest.amountCur > 0) {
            params.amountCur = FormatterUtil.formatAmount(paymentRequest.amountCur);
        }

        if (paymentRequest.symbolCur !== undefined) {
            params.symbolCur = FormatterUtil.formatCurrencyCode(paymentRequest.symbolCur);
        }

        // Add any additional custom fields
        this.addCustomFields(params, paymentRequest);

        // Run final validation to catch any build-time duplicates
        // (e.g. if the user passed 'shopUrl' in request, but builder also added 'shopurl')
        PaymentValidator.validateFinalParams(params);

        // Generate hash (HASH #1 - Outgoing)
        params.hash = HashUtil.generate(params, this.config.storeKey);

        return params;
    }

    /**
     * Add optional billing fields to params
     */
    private addOptionalFields(
        params: Record<string, any>,
        paymentRequest: PaymentRequest
    ): void {
        for (const field of OPTIONAL_PAYMENT_FIELDS) {
            // Use explicit null/undefined check so falsy values like '0' or 0
            // are not silently dropped (fixes CORE-6).
            const value = paymentRequest[field];
            if (value !== undefined && value !== null) {
                params[field] = SanitizationUtil.sanitizeString(
                    String(value),
                    100
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
            // Skip if: it's a standard field OR already mapped (even with different casing)
            if (!STANDARD_FIELDS_LOWER.has(lowerKey) && !existingKeys.has(lowerKey) && value !== undefined && value !== null) {
                // Enforce a reasonable max length on custom field values (SEC-2).
                params[key] = String(value).substring(0, 255);
            }
        }
    }
}
