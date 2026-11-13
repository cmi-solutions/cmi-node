/**
 * Callback Verifier
 * 
 * Verifies callback responses from CMI gateway.
 * Extracted from CMIPaymentGateway for Single Responsibility Principle.
 */

import { CallbackResult, ConfirmationMode } from '@types';
import { HashUtil, SecretString } from '@utils';
import { timingSafeCompare } from '@utils/crypto';
import { logger } from '@logger';

export interface CallbackVerifierConfig {
    storeKey: string | SecretString;
    confirmationMode: ConfirmationMode;
}

/**
 * Verifies and processes callbacks from CMI gateway
 */
export class CallbackVerifier {
    private readonly config: Omit<CallbackVerifierConfig, 'storeKey'>;
    // ES private field: not reachable from outside the class at runtime.
    readonly #storeKey: string | SecretString;

    constructor(config: CallbackVerifierConfig) {
        const { storeKey, ...rest } = config;
        this.#storeKey = storeKey;
        this.config = rest;
    }

    /**
     * Copy the callback fields as strings (null prototype, so a "__proto__" key stays
     * an ordinary field). A repeated field keeps its last value, as in the hash.
     */
    private static toFieldStrings(params: Record<string, unknown>): Record<string, string> {
        const fields: Record<string, string> = Object.create(null);
        for (const key of Object.keys(params)) {
            fields[key] = HashUtil.toFieldString(params[key]);
        }
        return fields;
    }

    /**
     * Safely parse an amount value, returning 0 if unparseable
     */
    private static safeParseAmount(value: any): number {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    /**
     * Resolve a field from callbackParams by trying multiple key variants.
     * Returns the first non-empty string found, or undefined.
     */
    private static resolveField(
        params: Record<string, any>,
        ...keys: string[]
    ): string | undefined {
        for (const key of keys) {
            const val = params[key];
            if (val !== undefined && val !== null && val !== '') {
                return String(val);
            }
        }
        return undefined;
    }

    /**
     * Verify callback from CMI
     *
     * Validates the hash (HASH #2 - Incoming) and returns payment status
     *
     * @param callbackParams Parameters received from CMI callback
     * @returns Callback verification result
     */
    verify(rawParams: Record<string, any>): CallbackResult {
        try {
            // Read every field as text exactly once, so the hash and orderData use the
            // same values. Body parsers turn a repeated field (oid=A&oid=B) into an
            // array; the hash keeps the last value, like PHP's $_POST, so orderData
            // must report that value too, never the first one or the array.
            const callbackParams = CallbackVerifier.toFieldStrings(rawParams);

            // Extract received hash
            const receivedHash = callbackParams.HASH || callbackParams.hash;

            if (!receivedHash) {
                return {
                    success: false,
                    status: 'FAILURE',
                    verified: false,
                    message: 'Hash not found in callback',
                };
            }

            // Recalculate the hash over every received field, exactly as CMI's
            // callback.php does (hash and encoding are skipped inside HashUtil).
            const calculatedHash = HashUtil.generateForCallback(callbackParams, this.#storeKey);

            // Verify hash using constant-time comparison (prevents timing attacks)
            if (!timingSafeCompare(String(receivedHash), calculatedHash)) {
                return {
                    success: false,
                    status: 'FAILURE',
                    verified: false,
                    message: 'Hash verification failed - possible tampering',
                };
            }

            // Extract return code (use nullish coalescing to avoid skipping
            // falsy-but-valid values like numeric 0)
            const returnCode = String(
                callbackParams.ProcReturnCode ?? callbackParams.ReturnCode ?? ''
            );

            // ── Resolve all callback fields (case variants) ───────────────────────

            // transactionId maps strictly to TransId / transId.
            // oid / ReturnOid is the order identifier — a completely different field.
            // If TransId is absent from the payload, transactionId is simply undefined.
            const transactionId =
                CallbackVerifier.resolveField(callbackParams, 'TransId', 'transId');

            // Always present (success + failure)
            const response    = CallbackVerifier.resolveField(callbackParams, 'Response',   'response');
            const mdStatus    = CallbackVerifier.resolveField(callbackParams, 'mdStatus',   'MdStatus',  'MDSTATUS');
            const errMsg      = CallbackVerifier.resolveField(callbackParams, 'ErrMsg',     'errMsg',    'ERRMSG');
            const errCode     = CallbackVerifier.resolveField(callbackParams, 'ErrCode',    'errcode',   'ERRCODE');
            const returnOid   = CallbackVerifier.resolveField(callbackParams, 'ReturnOid',  'returnOid', 'RETURNOID');
            const clientIp    = CallbackVerifier.resolveField(callbackParams, 'ClientIp',   'clientIp',  'CLIENTIP');

            // Present on success
            const authCode    = CallbackVerifier.resolveField(callbackParams, 'AuthCode',   'authCode',  'AUTHCODE');
            // CMI sends transaction date as 'EXTRA.TRXDATE' (dot in key name)
            const transactionDate = CallbackVerifier.resolveField(
                callbackParams, 'EXTRA.TRXDATE', 'EXTRA.trxdate', 'extra.trxdate'
            );
            const maskedPan       = CallbackVerifier.resolveField(callbackParams, 'MaskedPan',  'maskedPan',  'MASKEDPAN');
            const cardHolderName  = CallbackVerifier.resolveField(callbackParams, 'cardHolderName', 'CardHolderName', 'CARDHOLDERNAME');
            const paymentType     = CallbackVerifier.resolveField(callbackParams, 'paymentType',    'PaymentType',    'PAYMENTTYPE');
            // CMI sends card brand/issuer as 'EXTRA.CARDBRAND' / 'EXTRA.CARDISSUER' (dot in key name)
            const cardBrand       = CallbackVerifier.resolveField(
                callbackParams, 'EXTRA.CARDBRAND', 'EXTRA.cardbrand', 'extra.cardbrand'
            );
            const cardIssuer      = CallbackVerifier.resolveField(
                callbackParams, 'EXTRA.CARDISSUER', 'EXTRA.cardissuer', 'extra.cardissuer'
            );
            const cardExpYear     = CallbackVerifier.resolveField(callbackParams, 'EcomPaymentCardExpDateYear',  'ecomPaymentCardExpDateYear');
            const cardExpMonth    = CallbackVerifier.resolveField(callbackParams, 'EcomPaymentCardExpDateMonth', 'ecomPaymentCardExpDateMonth');
            const hostRefNum      = CallbackVerifier.resolveField(callbackParams, 'HostRefNum',  'hostRefNum',  'HOSTREFNUM');
            const acqStan         = CallbackVerifier.resolveField(callbackParams, 'acqStan',     'AcqStan',    'ACQSTAN');
            const eci             = CallbackVerifier.resolveField(callbackParams, 'eci',         'Eci',        'ECI');
            const txStatus        = CallbackVerifier.resolveField(callbackParams, 'txstatus',    'txStatus',   'TXSTATUS');

            // ── Build result ───────────────────────────────────────────────────────

            if (returnCode === '00') {
                const confirmationResponse = this.getConfirmationResponse();

                return {
                    success: true,
                    status: confirmationResponse,
                    verified: true,
                    message: 'Payment successful',
                    orderData: {
                        orderId: callbackParams.oid,
                        amount: CallbackVerifier.safeParseAmount(callbackParams.amount),
                        currency: callbackParams.currency,
                        transactionId,
                        // Always present
                        returnCode,
                        response,
                        mdStatus,
                        errorMessage: errMsg,
                        errorCode: errCode,
                        returnOid,
                        clientIp,
                        // Success fields
                        authCode,
                        transactionDate,
                        maskedPan,
                        cardHolderName,
                        paymentType,
                        cardBrand,
                        cardIssuer,
                        cardExpYear,
                        cardExpMonth,
                        hostRefNum,
                        acqStan,
                        eci,
                        txStatus,
                    },
                };
            } else {
                // Authentic callback for a failed attempt (ProcReturnCode other than "00",
                // or missing). CMI expects the acknowledgement "APPROVED" (see CallbackHandler).
                return {
                    success: false,
                    status: 'DECLINED',
                    verified: true,
                    message: `Payment failed with return code: ${returnCode}`,
                    errorCode: returnCode,
                    errorMessage: errMsg,
                    orderData: {
                        orderId: callbackParams.oid,
                        amount: CallbackVerifier.safeParseAmount(callbackParams.amount),
                        currency: callbackParams.currency,
                        transactionId,
                        // Always present
                        returnCode,
                        response,
                        mdStatus,
                        errorMessage: errMsg,
                        errorCode: errCode,
                        returnOid,
                        clientIp,
                    },
                };
            }
        } catch (error) {
            logger.error('Error verifying callback:', error);
            return {
                success: false,
                status: 'FAILURE',
                verified: false,
                message: `Error verifying callback: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            };
        }
    }

    /**
     * Get confirmation response based on confirmation mode
     */
    private getConfirmationResponse(): 'ACTION=POSTAUTH' | 'APPROVED' {
        if (this.config.confirmationMode === 'auto') {
            // Auto capture: tell CMI to capture funds immediately
            return 'ACTION=POSTAUTH';
        } else {
            // Manual capture: tell CMI funds are approved but not captured
            return 'APPROVED';
        }
    }
}
