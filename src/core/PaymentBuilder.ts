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

export interface PaymentBuilderConfig {
    clientId: string;
    storeKey: string | SecretString;
    storetype: string;
    trantype: string;
    shopUrl: string;
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
        // Validate payment request using existing validator
        PaymentValidator.validate(paymentRequest);

        // Generate order ID and random number if not provided
        const oid = paymentRequest.oid || GeneratorUtil.generateOrderId();
        const rnd = paymentRequest.rnd || GeneratorUtil.generateRandom();

        // Build payment parameters
        const params: Record<string, any> = {
            clientid: this.config.clientId,
            amount: FormatterUtil.formatAmount(paymentRequest.amount),
            currency: FormatterUtil.formatCurrencyNumeric(String(paymentRequest.currency)),
            oid,
            rnd,
            email: SanitizationUtil.sanitizeEmail(paymentRequest.email),
            BillToName: SanitizationUtil.sanitizeString(paymentRequest.BillToName, 50),
            okUrl: paymentRequest.okUrl,
            failUrl: paymentRequest.failUrl,
            storetype: FormatterUtil.formatStoreType(this.config.storetype),
            trantype: this.config.trantype,
            lang: normalizeLanguage(paymentRequest.lang || 'fr'),
            shopurl: this.config.shopUrl,
        };

        // Add hashAlgorithm - use provided value or default to 'ver3'
        // Validator ensures if provided, it must be 'ver3'
        params.hashAlgorithm = paymentRequest.hashAlgorithm ?? 'ver3';

        // Add encoding - use provided value or default to 'UTF-8'
        // Validator ensures if provided, it must be 'UTF-8'
        params.encoding = paymentRequest.encoding ?? 'UTF-8';

        // Add callbackURL if provided in config
        if (this.config.callbackUrl) {
            params.callbackURL = this.config.callbackUrl;
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
            if (paymentRequest[field]) {
                params[field] = SanitizationUtil.sanitizeString(
                    String(paymentRequest[field]),
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
        const standardFields = new Set(STANDARD_PAYMENT_FIELDS);

        for (const [key, value] of Object.entries(paymentRequest)) {
            // Skip if: it's a standard field OR if we already set this field in params
            if (!standardFields.has(key as any) && !(key in params) && value !== undefined && value !== null) {
                params[key] = String(value);
            }
        }
    }
}
