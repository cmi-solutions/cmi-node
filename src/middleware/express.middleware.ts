import { CallbackHandler } from "@core/CallbackHandler";
import { CMIPaymentGateway } from "@core/CMIPaymentGateway";
import { CallbackHandlerOptions } from "@types";

/**
 * Create Express middleware for handling CMI payment callbacks
 * 
 * @param gateway - CMIPaymentGateway instance
 * @param options - Handler options
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * import express from 'express';
 * import { CMIPaymentGateway, createExpressMiddleware } from '@ishakzail/cmi-payment-gateway';
 * 
 * const app = express();
 * app.use(express.json());
 * app.use(express.urlencoded({ extended: true }));
 * 
 * const gateway = new CMIPaymentGateway({
 *   clientId: 'YOUR_CLIENT_ID',
 *   storeKey: 'YOUR_STORE_KEY',
 *   gatewayUrl: 'https://gateway.cmi.co.ma/...',
 *   storetype: '3d_pay_hosting',
 *   trantype: 'PreAuth',
 *   // Note: callbackUrl is optional when using middleware
 * });
 * 
 * // SDK-managed callback handling
 * app.post('/payment/callback', createExpressMiddleware(gateway, {
 *   onSuccess: async (result) => {
 *     console.log('Payment successful:', result.orderData);
 *     // Update your database
 *     await db.orders.update(result.orderData.orderId, { status: 'paid' });
 *   },
 *   onFailure: async (result) => {
 *     console.error('Payment failed:', result.message);
 *   }
 * }));
 * 
 * app.listen(3000);
 * ```
 */
export function createExpressMiddleware(
    gateway: CMIPaymentGateway,
    options?: CallbackHandlerOptions
) {
    const handler = new CallbackHandler(gateway, options);
    return handler.middleware();
}

/**
 * Create callback handler with custom response handling
 * 
 * @example
 * ```typescript
 * app.post('/payment/callback', async (req, res) => {
 *   const handler = createCallbackHandler(gateway, {
 *     autoRespond: false, // We'll handle the response manually
 *     onSuccess: async (result) => {
 *       await updateOrder(result.orderData.orderId, 'paid');
 *     }
 *   });
 * 
 *   const result = await handler.handle(req.body);
 *   
 *   // Custom response logic
 *   if (result.success) {
 *     res.status(200).send('ACTION=POSTAUTH');
 *   } else {
 *     res.status(200).send('FAILURE');
 *   }
 * });
 * ```
 */
export function createCallbackHandler(
    gateway: CMIPaymentGateway,
    options?: CallbackHandlerOptions
): CallbackHandler {
    return new CallbackHandler(gateway, options);
}
