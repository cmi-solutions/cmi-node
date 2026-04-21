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
    private readonly config: CallbackVerifierConfig;

    constructor(config: CallbackVerifierConfig) {
        this.config = config;
    }

    /**
     * Safely parse an amount value, returning 0 if unparseable
     */
    private static safeParseAmount(value: any): number {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    /**
     * Verify callback from CMI
     *
     * Validates the hash (HASH #2 - Incoming) and returns payment status
     *
     * @param callbackParams Parameters received from CMI callback
     * @returns Callback verification result
     */
    verify(callbackParams: Record<string, any>): CallbackResult {


        try {
            // Extract received hash
            const receivedHash = callbackParams.HASH || callbackParams.hash;

            if (!receivedHash) {
                return {
                    success: false,
                    status: 'FAILURE',
                    message: 'Hash not found in callback',
                };
            }

            // Prepare params for hash verification (remove hash and encoding, case-insensitively)
            const paramsForHash: Record<string, any> = {};
            for (const [key, value] of Object.entries(callbackParams)) {
                const lowerKey = key.toLowerCase();
                if (lowerKey !== 'hash' && lowerKey !== 'encoding') {
                    paramsForHash[key] = value;
                }
            }

            // Recalculate hash (HASH #2 - Verify)
            const calculatedHash = HashUtil.generate(paramsForHash, this.config.storeKey);



            // Verify hash using constant-time comparison (prevents timing attacks)
            if (!timingSafeCompare(receivedHash, calculatedHash)) {
                return {
                    success: false,
                    status: 'FAILURE',
                    message: 'Hash verification failed - possible tampering',
                };
            }

            // Extract return code
            const returnCode = String(
                callbackParams.ProcReturnCode || callbackParams.ReturnCode || ''
            );

            // Check payment status
            if (returnCode === '00') {
                // Get response based on confirmation mode
                const response = this.getConfirmationResponse();

                return {
                    success: true,
                    status: response,
                    message: 'Payment successful',
                    orderData: {
                        orderId: callbackParams.oid,
                        amount: CallbackVerifier.safeParseAmount(callbackParams.amount),
                        currency: callbackParams.currency,
                        transactionId:
                            callbackParams.TransId ||
                            callbackParams.transId ||
                            callbackParams.oid,
                    },
                };
            } else {
                return {
                    success: false,
                    status: 'FAILURE',
                    message: `Payment failed with return code: ${returnCode}`,
                    errorCode: returnCode,
                    errorMessage: callbackParams.ErrMsg || callbackParams.errMsg,
                    orderData: {
                        orderId: callbackParams.oid,
                        amount: CallbackVerifier.safeParseAmount(callbackParams.amount),
                        currency: callbackParams.currency,
                        transactionId:
                            callbackParams.TransId ||
                            callbackParams.transId ||
                            callbackParams.oid,
                    },
                };
            }
        } catch (error) {
            logger.error('Error verifying callback:', error);
            return {
                success: false,
                status: 'FAILURE',
                message: `Error verifying callback: ${error instanceof Error ? error.message : String(error)
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
