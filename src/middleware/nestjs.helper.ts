// src/middleware/nestjs.helper.ts

import { CallbackHandler } from "@core/CallbackHandler";
import { CMIPaymentGateway } from "@core/CMIPaymentGateway";
import { CallbackHandlerOptions, CallbackResult } from "@types";

/**
 * NestJS callback handler wrapper
 * 
 * Since NestJS uses decorators and dependency injection,
 * we provide a simple wrapper class that can be used in controllers.
 * 
 * @example
 * ```typescript
 * // payment.controller.ts
 * import { Controller, Post, Body, Res } from '@nestjs/common';
 * import { Response } from 'express';
 * import { CMIPaymentGateway, NestJSCallbackHandler } from '@ishakzail/cmi-payment-gateway';
 * 
 * @Controller('payment')
 * export class PaymentController {
 *   private callbackHandler: NestJSCallbackHandler;
 * 
 *   constructor() {
 *     const gateway = new CMIPaymentGateway({
 *       clientId: process.env.CMI_CLIENT_ID!,
 *       storeKey: process.env.CMI_STORE_KEY!,
 *       gatewayUrl: process.env.CMI_GATEWAY_URL!,
 *       storetype: '3d_pay_hosting',
 *       trantype: 'PreAuth',
 *       shopUrl: 'https://yoursite.com',
 *       callbackUrl: 'https://yoursite.com/payment/callback',
 *       confirmationMode: 'auto'
 *     });
 * 
 *     this.callbackHandler = new NestJSCallbackHandler(gateway, {
 *       onSuccess: async (result) => {
 *         await this.orderService.markAsPaid(result.orderData?.orderId);
 *       },
 *       onFailure: async (result) => {
 *         console.error('Payment failed:', result.message);
 *       }
 *     });
 *   }
 * 
 *   @Post('callback')
 *   async handleCallback(@Body() body: any, @Res() res: Response) {
 *     return this.callbackHandler.handle(body, res);
 *   }
 * }
 * ```
 */
export class NestJSCallbackHandler {
    private handler: CallbackHandler;

    constructor(gateway: CMIPaymentGateway, options?: CallbackHandlerOptions) {
        this.handler = new CallbackHandler(gateway, options);
    }

    /**
     * Handle callback request
     * 
     * @param body - Request body from @Body() decorator
     * @param res - Response object from @Res() decorator
     */
    async handle(body: any, res: any): Promise<any> {
        try {
            const result = await this.handler.handle(body);
            const response = this.handler.getResponse(result);

            return res.status(response.status).send(response.body);
        } catch (error) {
            return res.status(500).send('FAILURE');
        }
    }

    /**
     * Handle callback and return result (for custom response handling)
     * 
     * @param body - Request body
     * @returns CallbackResult
     * 
     * @example
     * ```typescript
     * @Post('callback')
     * async handleCallback(@Body() body: any): Promise<string> {
     *   const result = await this.callbackHandler.process(body);
     *   
     *   // Custom logic here
     *   if (result.success) {
     *     await this.sendNotification(result.orderData);
     *   }
     *   
     *   return result.success ? result.status : 'FAILURE';
     * }
     * ```
     */
    async process(body: any): Promise<CallbackResult> {
        return this.handler.handle(body);
    }

    /**
     * Get the appropriate response string for a result
     */
    getResponseString(result: CallbackResult): string {
        const response = this.handler.getResponse(result);
        return response.body;
    }
}

/**
 * Create a simple callback handler function for NestJS
 * 
 * Alternative to using the class-based approach
 * 
 * @example
 * ```typescript
 * import { createNestJSHandler } from '@ishakzail/cmi-payment-gateway';
 * 
 * const handleCallback = createNestJSHandler(gateway, {
 *   onSuccess: async (result) => {
 *     await updateOrder(result.orderData?.orderId);
 *   }
 * });
 * 
 * @Post('callback')
 * async callback(@Body() body: any, @Res() res: Response) {
 *   return handleCallback(body, res);
 * }
 * ```
 */
export function createNestJSHandler(
    gateway: CMIPaymentGateway,
    options?: CallbackHandlerOptions
) {
    const nestHandler = new NestJSCallbackHandler(gateway, options);

    return async (body: any, res: any) => {
        return nestHandler.handle(body, res);
    };
}
