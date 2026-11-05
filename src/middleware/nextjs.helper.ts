import { CallbackHandler } from "@core/CallbackHandler";
import { CMIPaymentGateway } from "@core/CMIPaymentGateway";
import { CallbackHandlerOptions } from "@types";


/**
 * Create Next.js API route handler for CMI payment callbacks
 * 
 * Works with both Pages Router (/pages/api/*) and App Router (/app/api/*)
 * 
 * @param gateway - CMIPaymentGateway instance
 * @param options - Handler options
 * @returns Next.js API route handler
 * 
 * @example Pages Router
 * ```typescript
 * // pages/api/payment/callback.ts
 * import { CMIPaymentGateway, createNextJsHandler } from 'cmi-node';
 * 
 * const gateway = new CMIPaymentGateway({
 *   clientId: process.env.CMI_CLIENT_ID!,
 *   storeKey: process.env.CMI_STORE_KEY!,
 *   gatewayUrl: process.env.CMI_GATEWAY_URL!,
 *   storetype: '3d_pay_hosting',
 *   trantype: 'PreAuth',
 * });
 * 
 * export default createNextJsHandler(gateway, {
 *   onSuccess: async (result) => {
 *     console.log('Payment successful:', result.orderData);
 *     // Update database
 *     await prisma.order.update({
 *       where: { id: result.orderData.orderId },
 *       data: { status: 'PAID' }
 *     });
 *   }
 * });
 * ```
 * 
 * @example App Router
 * ```typescript
 * // app/api/payment/callback/route.ts
 * import { NextRequest, NextResponse } from 'next/server';
 * import { CMIPaymentGateway } from 'cmi-node';
 * 
 * const gateway = new CMIPaymentGateway({ ... });
 * 
 * export async function POST(request: NextRequest) {
 *   const body = await request.json();
 *   const result = gateway.verifyCallback(body);
 *   
 *   if (result.success) {
 *     // Update order
 *     await updateOrder(result.orderData.orderId);
 *     return new NextResponse('ACTION=POSTAUTH', { status: 200 });
 *   }
 *   
 *   return new NextResponse('FAILURE', { status: 200 });
 * }
 * ```
 */
export function createNextJsHandler(
    gateway: CMIPaymentGateway,
    options?: CallbackHandlerOptions
) {
    const handler = new CallbackHandler(gateway, options);

    return async (req: any, res: any) => {
        // Handle both Pages Router and potential body parsing
        const params = req.body || req.query || {};

        try {
            const result = await handler.handle(params);
            const response = handler.getResponse(result);

            return res.status(response.status).send(response.body);
        } catch {
            return res.status(500).send('FAILURE');
        }
    };
}

/**
 * Read the callback parameters from a web-standard Request.
 *
 * A Request body can be read only once, so it is read a single time and parsed
 * according to its content type. CMI posts `application/x-www-form-urlencoded`;
 * JSON and multipart bodies are also accepted. When the body is empty, the URL
 * query parameters are used.
 */
export async function readAppRouterParams(request: any): Promise<Record<string, any>> {
    const contentType = String(request?.headers?.get?.('content-type') ?? '').toLowerCase();

    if (contentType.includes('multipart/form-data') && typeof request.formData === 'function') {
        const formData = await request.formData();
        return Object.fromEntries(formData.entries());
    }

    const raw: string = typeof request?.text === 'function' ? await request.text() : '';
    if (raw.trim() !== '') {
        const looksLikeJson = contentType.includes('application/json') || /^\s*\{/.test(raw);
        if (looksLikeJson) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            } catch {
                // Not JSON after all: parse it as a form body below.
            }
        }
        // Like PHP's $_POST, a repeated field keeps its last value.
        return Object.fromEntries(new URLSearchParams(raw));
    }

    return Object.fromEntries(request?.nextUrl?.searchParams ?? new URL(request?.url ?? 'http://localhost').searchParams);
}

/**
 * Helper for Next.js App Router (route.ts)
 *
 * Returns a web-standard Response object compatible with Next.js App Router.
 * The return type is kept as `any` to avoid leaking internal type dependencies
 * to consumers — the actual returned value is always a `Response` instance.
 * 
 * @param gateway - CMIPaymentGateway instance
 * @param request - Incoming Request (NextRequest or web-standard Request)
 * @param options - Handler options
 * @returns A web-standard Response object
 * 
 * @example
 * ```typescript
 * // app/api/payment/callback/route.ts
 * import { NextRequest } from 'next/server';
 * import { CMIPaymentGateway, handleNextJsCallback } from 'cmi-node';
 * 
 * const gateway = new CMIPaymentGateway({ ... });
 * 
 * export async function POST(request: NextRequest) {
 *   return handleNextJsCallback(gateway, request, {
 *     onSuccess: async (result) => {
 *       await updateOrder(result.orderData.orderId, 'paid');
 *     }
 *   });
 * }
 * ```
 */
export async function handleNextJsCallback(
    gateway: CMIPaymentGateway,
    request: any,
    options?: CallbackHandlerOptions
): Promise<any> {
    const handler = new CallbackHandler(gateway, options);

    try {
        const params = await readAppRouterParams(request);
        const result = await handler.handle(params);
        const response = handler.getResponse(result);

        // Return web-standard Response (App Router compatible)
        return new Response(response.body, {
            status: response.status,
            headers: { 'Content-Type': 'text/plain' }
        });
    } catch {
        return new Response('FAILURE', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}
