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
 * import { CMIPaymentGateway, createFastifyHandler } from 'cmi-node';
 * 
 * const fastify = Fastify();
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
        let sent: unknown;
        try {
            // Fastify parses the body (register @fastify/formbody for CMI's
            // application/x-www-form-urlencoded posts). The query string is
            // only used for GET requests when supportGetMethod is enabled.
            const method = String(request?.method ?? 'POST').toUpperCase();
            const params = method === 'GET'
                ? (handler.supportsGetMethod ? request.query ?? {} : {})
                : request.body ?? {};

            const { result, response } = await handler.evaluate(params);

            // Answer CMI first (Fastify uses .code() instead of .status()),
            // then run onSuccess / onFailure.
            sent = reply.code(response.status).send(response.body);
            await handler.notify(result);
            return sent;
        } catch (error) {
            logger.error('Fastify callback handler error:', error);
            if (sent !== undefined) return sent;
            const answer = handler.errorResponse();
            return reply.code(answer.status).send(answer.body);
        }
    };
}

/**
 * Register Fastify callback route automatically
 * 
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import { CMIPaymentGateway, registerFastifyCallback } from 'cmi-node';
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
