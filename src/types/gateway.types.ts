/**
 * Gateway-Specific Types
 * 
 * Types specific to the CMI Payment Gateway initialization and operation.
 * Moved here for better organization.
 */

import { CallbackResult } from './callback.types';

/**
 * Payment authorization mode
 *
 * @type {'auto'} - CMI captures funds automatically (ACTION=POSTAUTH)
 * @type {'manual'} - You capture funds manually later (APPROVED)
 */
export type ConfirmationMode = 'auto' | 'manual';

/**
 * Middleware function type that works with any framework
 *
 * Compatible with:
 * - Express: (req, res, next?) => Promise<void>
 * - NestJS: (req, res) => Promise<void>
 * - Fastify: (request, reply) => Promise<void>
 * - Koa: (ctx, next) => Promise<void>
 * - Next.js: (req, res) => Promise<void>
 */
export type CallbackMiddleware = (req: any, res: any, next?: any) => Promise<void>;

/**
 * CMI Payment Gateway constructor options
 */
export interface CMIPaymentGatewayOptions {
    /**
     * Optional: Express-like app for auto-registration
     *
     * Pass Express app to automatically register callback endpoint
     * Only works with Express framework
     */
    app?: any;

    /**
     * Custom callback endpoint path
     * @default '/api/payment/callback'
     */
    callbackPath?: string;

    /**
     * Callback handler configuration
     */
    callbackConfig?: {
        /**
         * Called when payment is verified successfully
         */
        onSuccess?: (result: CallbackResult) => Promise<void> | void;

        /**
         * Called when payment verification fails
         */
        onFailure?: (result: CallbackResult) => Promise<void> | void;

        /**
         * Whether to automatically send response to CMI
         * @default true
         */
        autoRespond?: boolean;

        /**
         * Custom success response message
         * @default "ACTION=POSTAUTH" or "APPROVED" (based on confirmationMode)
         */
        successResponse?: string;

        /**
         * Custom failure response message
         * @default "FAILURE"
         */
        failureResponse?: string;

        /**
         * Support both POST and GET methods
         * @default false
         */
        supportGetMethod?: boolean;
    };
}
