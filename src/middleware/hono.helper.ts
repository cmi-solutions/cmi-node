// src/middleware/hono.helper.ts

import { CallbackHandler } from "@core/CallbackHandler";
import { CMIPaymentGateway } from "@core/CMIPaymentGateway";
import { CallbackHandlerOptions } from "@types";
import { logger } from "@logger";
import { readAppRouterParams } from "./nextjs.helper";

/**
 * Create Hono route handler for CMI payment callbacks
 * 
 * Hono is a small, simple, and ultrafast web framework for the Edge.
 * Works with Node.js, Bun and Deno. On Cloudflare Workers, enable the
 * `nodejs_compat` compatibility flag: the gateway uses Node.js 'crypto' and Buffer.
 * 
 * @param gateway - CMIPaymentGateway instance
 * @param options - Handler options
 * @returns Hono route handler function
 * 
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { CMIPaymentGateway, createHonoHandler } from 'cmi-node';
 * 
 * const app = new Hono();
 * 
 * const gateway = new CMIPaymentGateway({
 *   clientId: process.env.CMI_CLIENT_ID!,
 *   storeKey: process.env.CMI_STORE_KEY!,
 *   gatewayUrl: process.env.CMI_GATEWAY_URL!,
 *   storetype: '3d_pay_hosting',
 *   trantype: 'PreAuth',
 *   callbackUrl: 'https://yoursite.com/cmi/callback',
 *   confirmationMode: 'auto'
 * });
 * 
 * // ONE LINE setup!
 * app.post('/cmi/callback', createHonoHandler(gateway, {
 *   onSuccess: async (result) => {
 *     await db.orders.update(result.orderData?.orderId, { status: 'paid' });
 *   }
 * }));
 * 
 * export default app;
 * ```
 */
export function createHonoHandler(
    gateway: CMIPaymentGateway,
    options?: CallbackHandlerOptions
) {
    const handler = new CallbackHandler(gateway, options);

    return async (c: any) => {
        try {
            // Read the body once (as text, then JSON or form). Trying c.req.json()
            // first consumed the body on Hono < 4.12.34, so the form-encoded
            // callback CMI sends could no longer be read. The query string is
            // accepted only for GET, and only when supportGetMethod is enabled.
            const params = await readAppRouterParams(
                {
                    method: c.req.method,
                    url: c.req.url,
                    headers: { get: (name: string) => c.req.header(name) ?? null },
                    text: () => c.req.text(),
                    formData: () => c.req.formData(),
                },
                { allowQuery: handler.supportsGetMethod }
            );

            // A Response can only be returned once, so onSuccess / onFailure run
            // before the answer is returned (keep them fast, or hand the work to
            // c.executionCtx.waitUntil() on Workers).
            const result = await handler.handle(params);
            const response = handler.getResponse(result);

            // Hono uses c.text() or c.body()
            return c.text(response.body, response.status);
        } catch (error) {
            logger.error('Hono callback handler error:', error);
            const answer = handler.errorResponse();
            return c.text(answer.body, answer.status);
        }
    };
}

/**
 * Register Hono callback route
 * 
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { CMIPaymentGateway, registerHonoCallback } from 'cmi-node';
 * 
 * const app = new Hono();
 * const gateway = new CMIPaymentGateway({ ... });
 * 
 * registerHonoCallback(app, gateway, {
 *   path: '/cmi/callback',
 *   onSuccess: async (result) => {
 *     console.log('Payment successful for order', result.orderData?.orderId); // avoid logging card data
 *   }
 * });
 * 
 * export default app;
 * ```
 */
export function registerHonoCallback(
    app: any,
    gateway: CMIPaymentGateway,
    options: CallbackHandlerOptions & { path?: string }
) {
    const path = options.path || '/api/payment/callback';
    const handler = createHonoHandler(gateway, options);

    app.post(path, handler);

    logger.info(`CMI Payment Gateway: Callback registered at POST ${path}`);
}
