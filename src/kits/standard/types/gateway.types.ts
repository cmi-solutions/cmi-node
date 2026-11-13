/**
 * Gateway-Specific Types
 * 
 * Types specific to the CMI Payment Gateway initialization and operation.
 * Moved here for better organization.
 */

import type { CallbackHandlerOptions } from './callback-handler.types';

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
    callbackConfig?: CallbackHandlerOptions;
}
