// src/middleware/hono.helper.ts

import { CallbackHandler } from "@core/CallbackHandler";
import { CMIPaymentGateway } from "@core/CMIPaymentGateway";
import { CallbackHandlerOptions } from "@types";
import { logger } from "@logger";

/**
 * Create Hono route handler for CMI payment callbacks
 * 
 * Hono is a small, simple, and ultrafast web framework for the Edge.
 * Works with Cloudflare Workers, Deno, Bun, and Node.js.
 * 
 * @param gateway - CMIPaymentGateway instance
 * @param options - Handler options
 * @returns Hono route handler function
 * 
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { CMIPaymentGateway, createHonoHandler } from '@ishakzail/cmi-payment-gateway';
 * 
 * const app = new Hono();
 * 
 * const gateway = new CMIPaymentGateway({
 *   clientId: process.env.CMI_CLIENT_ID!,
 *   storeKey: process.env.CMI_STORE_KEY!,
 *   gatewayUrl: process.env.CMI_GATEWAY_URL!,
 *   storetype: '3d_pay_hosting',
 *   trantype: 'PreAuth',
 *   shopUrl: 'https://yoursite.com',
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
            // Hono context - parse JSON body
            let params;
            try {
                params = await c.req.json();
            } catch {
                // Fallback to form data or query params
                params = await c.req.parseBody?.() ||
                    Object.fromEntries(new URL(c.req.url).searchParams);
            }

            const result = await handler.handle(params);
            const response = handler.getResponse(result);

            // Hono uses c.text() or c.body()
            return c.text(response.body, response.status);
        } catch (error) {
            return c.text('FAILURE', 500);
        }
    };
}

/**
 * Register Hono callback route
 * 
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { CMIPaymentGateway, registerHonoCallback } from '@ishakzail/cmi-payment-gateway';
 * 
 * const app = new Hono();
 * const gateway = new CMIPaymentGateway({ ... });
 * 
 * registerHonoCallback(app, gateway, {
 *   path: '/cmi/callback',
 *   onSuccess: async (result) => {
 *     console.log('Payment successful:', result.orderData);
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
