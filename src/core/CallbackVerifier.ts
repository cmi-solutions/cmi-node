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

            // Prepare params for hash verification (remove hash and encoding)
            const paramsForHash = { ...callbackParams };
            delete paramsForHash.HASH;
            delete paramsForHash.hash;
            delete paramsForHash.encoding;

            // Recalculate hash (HASH #2 - Verify)
            const calculatedHash = HashUtil.generate(paramsForHash, this.config.storeKey);



            // Verify hash using constant-time comparison (prevents timing attacks)
            if (!timingSafeCompare(receivedHash, calculatedHash)) {
                // console.warn('[Callback] ❌ Hash mismatch - possible tampering detected!');
                return {
                    success: false,
                    status: 'FAILURE',
                    message: 'Hash verification failed - possible tampering',
                };
            }

            // console.debug('[Callback] ✅ Hash verified successfully');

            // Extract return code
            const returnCode = String(
                callbackParams.ProcReturnCode || callbackParams.ReturnCode || ''
            );

            // Check payment status
            if (returnCode === '00') {
                // console.debug('[Callback] ✅ Payment successful');

                // Get response based on confirmation mode
                const response = this.getConfirmationResponse();

                return {
                    success: true,
                    status: response,
                    message: 'Payment successful',
                    orderData: {
                        orderId: callbackParams.oid,
                        amount: parseFloat(callbackParams.amount),
                        currency: callbackParams.currency,
                        transactionId:
                            callbackParams.TransId ||
                            callbackParams.transId ||
                            callbackParams.oid,
                    },
                };
            } else {
                // console.warn(`[Callback] ❌ Payment failed with code: ${returnCode}`);
                return {
                    success: false,
                    status: 'FAILURE',
                    message: `Payment failed with return code: ${returnCode}`,
                    errorCode: returnCode,
                    errorMessage: callbackParams.ErrMsg || callbackParams.errMsg,
                    orderData: {
                        orderId: callbackParams.oid,
                        amount: parseFloat(callbackParams.amount),
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
