import { CallbackHandler } from "@core/CallbackHandler";
import { CMIPaymentGateway } from "@core/CMIPaymentGateway";
import { CallbackHandlerOptions } from "@types";
import { logger } from "@logger";


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
        let sent: unknown;
        try {
            // The body is used for POST callbacks. The query string is used only
            // for GET requests when supportGetMethod is enabled, so callback data
            // does not end up in URLs (and access logs) by accident.
            const method = String(req?.method ?? 'POST').toUpperCase();
            const params = method === 'GET'
                ? (handler.supportsGetMethod ? req.query ?? {} : {})
                : req.body ?? {};

            const { result, response } = await handler.evaluate(params);

            // Answer CMI first, then run onSuccess / onFailure.
            sent = res.status(response.status).send(response.body);
            await handler.notify(result);
            return sent;
        } catch (error) {
            logger.error('Next.js callback handler error:', error);
            if (sent !== undefined) return sent;
            const answer = handler.errorResponse();
            return res.status(answer.status).send(answer.body);
        }
    };
}

/**
 * Read the callback parameters from a web-standard Request.
 *
 * A Request body can be read only once, so it is read a single time and parsed
 * according to its content type. CMI posts `application/x-www-form-urlencoded`;
 * JSON and multipart bodies are also accepted. The URL query parameters are used
 * only for a GET request, and only when `allowQuery` is true (`supportGetMethod`).
 */
export async function readAppRouterParams(
    request: any,
    options: { allowQuery?: boolean } = {}
): Promise<Record<string, any>> {
    const method = String(request?.method ?? 'POST').toUpperCase();
    if (method === 'GET') {
        if (!options.allowQuery) return {};
        return Object.fromEntries(request?.nextUrl?.searchParams ?? new URL(request?.url ?? 'http://localhost').searchParams);
    }

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

    return {};
}

/**
 * Create a Next.js App Router handler (route.ts) once, and reuse it for every request.
 *
 * @example
 * ```typescript
 * // app/api/payment/callback/route.ts
 * import { CMIPaymentGateway, createNextJsAppRouterHandler } from 'cmi-node';
 *
 * const gateway = new CMIPaymentGateway({ ... });
 * export const POST = createNextJsAppRouterHandler(gateway, {
 *   validateOrder: async (result) => isExpectedOrder(result.orderData),
 *   onSuccess: async (result) => { await markPaid(result.orderData!.orderId); },
 * });
 * ```
 */
export function createNextJsAppRouterHandler(
    gateway: CMIPaymentGateway,
    options?: CallbackHandlerOptions
): (request: any) => Promise<Response> {
    const handler = new CallbackHandler(gateway, options);
    return (request: any) => respondToAppRouterRequest(handler, request);
}

async function respondToAppRouterRequest(handler: CallbackHandler, request: any): Promise<Response> {
    try {
        const params = await readAppRouterParams(request, { allowQuery: handler.supportsGetMethod });
        // A Response can only be returned once, so onSuccess / onFailure run
        // before the answer is returned: keep them fast.
        const result = await handler.handle(params);
        const response = handler.getResponse(result);

        // Return web-standard Response (App Router compatible)
        return new Response(response.body, {
            status: response.status,
            headers: { 'Content-Type': 'text/plain' }
        });
    } catch (error) {
        logger.error('Next.js App Router callback handler error:', error);
        const answer = handler.errorResponse();
        return new Response(answer.body, {
            status: answer.status,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
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
    // Builds a handler per call. Prefer createNextJsAppRouterHandler(), which builds it once.
    return respondToAppRouterRequest(new CallbackHandler(gateway, options), request);
}
