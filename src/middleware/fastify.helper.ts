// src/middleware/fastify.helper.ts

import { CallbackHandler } from "@core/CallbackHandler";
import { CMIPaymentGateway } from "@core/CMIPaymentGateway";
import { CallbackHandlerOptions } from "@types";
import { logger } from "@logger";

/**
 * Create Fastify route handler for CMI payment callbacks
 * 
 * @param gateway - CMIPaymentGateway instance
 * @param options - Handler options
 * @returns Fastify route handler function
 * 
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import { CMIPaymentGateway, createFastifyHandler } from '@ishakzail/cmi-payment-gateway';
 * 
 * const fastify = Fastify();
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
 * fastify.post('/cmi/callback', createFastifyHandler(gateway, {
 *   onSuccess: async (result) => {
 *     await db.orders.update(result.orderData?.orderId, { status: 'paid' });
 *   }
 * }));
 * 
 * fastify.listen({ port: 3000 });
 * ```
 */
export function createFastifyHandler(
    gateway: CMIPaymentGateway,
    options?: CallbackHandlerOptions
) {
    const handler = new CallbackHandler(gateway, options);

    return async (request: any, reply: any) => {
        try {
            // Fastify automatically parses body
            const params = request.body || {};

            const result = await handler.handle(params);
            const response = handler.getResponse(result);

            // Fastify uses .code() instead of .status()
            return reply.code(response.status).send(response.body);
        } catch (error) {
            return reply.code(500).send('FAILURE');
        }
    };
}

/**
 * Register Fastify callback route automatically
 * 
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import { CMIPaymentGateway, registerFastifyCallback } from '@ishakzail/cmi-payment-gateway';
 * 
 * const fastify = Fastify();
 * const gateway = new CMIPaymentGateway({ ... });
 * 
 * // Auto-register callback route
 * registerFastifyCallback(fastify, gateway, {
 *   path: '/cmi/callback',
 *   onSuccess: async (result) => {
 *     await updateOrder(result.orderData?.orderId);
 *   }
 * });
 * ```
 */
export function registerFastifyCallback(
    fastify: any,
    gateway: CMIPaymentGateway,
    options: CallbackHandlerOptions & { path?: string }
) {
    const path = options.path || '/api/payment/callback';
    const handler = createFastifyHandler(gateway, options);

    fastify.post(path, handler);

    logger.info(`CMI Payment Gateway: Callback registered at POST ${path}`);
}
