// src/core/CallbackHandler.ts
import { CMIPaymentGateway } from "./CMIPaymentGateway";
import {
  CallbackHandlerOptions,
  CallbackRequest,
  CallbackResponse,
  CallbackResult,
  CallbackMiddleware,
} from "@types";
import { logger } from "@logger";

/**
 * Framework‑agnostic callback handling.
 * 
 * **Security Note:** This handler verifies the SHA-512 hash to ensure data integrity,
 * but it does NOT provide built-in replay attack protection or rate limiting.
 * Consumers MUST implement their own idempotency logic (e.g., checking if the 
 * `orderId` has already been processed in their database) to prevent multiple
 * executions for the same payment.
 */
export class CallbackHandler {
  private gateway: CMIPaymentGateway;
  private options: Required<Omit<CallbackHandlerOptions, 'validateOrder'>> &
    Pick<CallbackHandlerOptions, 'validateOrder'>;

  constructor(gateway: CMIPaymentGateway, options?: CallbackHandlerOptions) {
    this.gateway = gateway;
    this.options = {
      autoRespond: options?.autoRespond ?? true,
      successResponse: options?.successResponse ?? "",
      failureResponse: options?.failureResponse ?? "FAILURE",
      declinedResponse: options?.declinedResponse ?? "APPROVED",
      validateOrder: options?.validateOrder,
      onSuccess: options?.onSuccess ?? (() => { }),
      onFailure: options?.onFailure ?? (() => { }),
      supportGetMethod: options?.supportGetMethod ?? false,
    };

    if (this.options.supportGetMethod) {
      logger.warn("Security Warning: 'supportGetMethod' is enabled. CMI callback parameters (including sensitive payment data) will be accepted via URL query strings. Ensure your server access logs and CDNs do not expose these query strings.");
    }
  }

  /** Express/Connect‑style middleware usable in any framework */
  middleware(): CallbackMiddleware {
    return async (
      req: any,
      res: any,
      next?: (...args: any[]) => any
    ): Promise<void> => {
      try {
        const params = this.extractParams(req);
        const result: CallbackResult = await this.verifyAndValidate(params);

        // IMPORTANT: Send the response to CMI FIRST, based on the verification
        // result and `validateOrder` (which runs before any answer, so an order
        // that doesn't match is never captured). If we let onSuccess run first,
        // a throw inside it would cause a 500 FAILURE response even though the
        // payment was legitimately verified.
        if (this.options.autoRespond) {
          // Send response to CMI inside a try-catch to prevent
          // double-send if res.send() throws (e.g. socket closed,
          // headers already sent).
          try {
            this.sendResponse(res as CallbackResponse, result);
          } catch (sendError) {
            logger.error('Failed to send response to CMI:', sendError);
            // Do NOT attempt a second res.send() — the socket/response
            // is in an unknown state.  Fall through to consumer callbacks
            // so the payment can still be processed on our side.
          }

          // Invoke consumer callbacks AFTER the response is committed.
          // Errors here are logged but do NOT change the response.
          try {
            if (result.success) {
              await Promise.resolve(this.options.onSuccess(result));
            } else {
              await Promise.resolve(this.options.onFailure(result));
            }
          } catch (callbackError) {
            logger.error('User callback error (response already sent):', callbackError);
          }
        } else if (next) {
          (req as any).paymentResult = result;
          next();

          // Invoke consumer callbacks AFTER next() for non-autoRespond mode.
          try {
            if (result.success) {
              await Promise.resolve(this.options.onSuccess(result));
            } else {
              await Promise.resolve(this.options.onFailure(result));
            }
          } catch (callbackError) {
            logger.error('User callback error:', callbackError);
          }
        }
      } catch (error) {
        logger.error('Callback handler error:', error);
        if (this.options.autoRespond) {
          try {
            (res as CallbackResponse).status(500).send("FAILURE");
          } catch (sendError) {
            // Response is in an unknown state — nothing more we can do.
            logger.error('Failed to send error response:', sendError);
          }
        } else if (next) {
          next(error);
        }
      }
    };
  }

  /**
   * Extract params from the incoming request.
   *
   * @security `supportGetMethod` — enabling this option causes CMI callback
   * parameters (including order ID, amount, and return codes) to arrive via
   * the URL query string. Query strings are recorded in server access logs,
   * browser history, and HTTP `Referer` headers sent to third-party resources.
   * Only enable this option if your infrastructure cannot receive POST requests
   * and you have taken steps to redact sensitive query parameters from logs.
   */
  private extractParams(req: CallbackRequest): any {
    const method = (req.method || "POST").toUpperCase();

    if (method === "POST") {
      return req.body || {};
    }

    if (this.options.supportGetMethod) {
      return req.query || req.body || {};
    }

    return req.body || {};
  }

  private sendResponse(res: CallbackResponse, result: CallbackResult): void {
    const response = this.getResponse(result);
    res.status(response.status).send(response.body);
  }

  /**
   * Verify the callback, then let the merchant check the order (`validateOrder`)
   * before anything is answered to CMI — as CMI's integration guide requires
   * (the order exists and its amount matches). A rejected or failing check turns
   * the result into a FAILURE, so CMI does not capture the payment.
   */
  private async verifyAndValidate(params: any): Promise<CallbackResult> {
    const result: CallbackResult = this.gateway.verifyCallback(params);
    if (!result.success || !this.options.validateOrder) {
      return result;
    }

    let accepted = false;
    let reason = 'validateOrder returned false';
    try {
      accepted = (await Promise.resolve(this.options.validateOrder(result))) === true;
    } catch (error) {
      reason = `validateOrder threw: ${error instanceof Error ? error.message : String(error)}`;
      logger.error('Order validation error:', error);
    }

    if (accepted) {
      return result;
    }
    return {
      ...result,
      success: false,
      status: 'FAILURE',
      message: `Order validation failed (${reason})`,
    };
  }

  /**
   * Handle callback params directly (for frameworks that manage their own response).
   *
   * Consumer-provided `onSuccess` / `onFailure` callbacks are wrapped in a
   * try-catch so that a throw inside them does not propagate to the caller and
   * does not prevent the result from being returned.
   */
  async handle(params: any): Promise<CallbackResult> {
    const result: CallbackResult = await this.verifyAndValidate(params);

    try {
      if (result.success) {
        await Promise.resolve(this.options.onSuccess(result));
      } else {
        await Promise.resolve(this.options.onFailure(result));
      }
    } catch (callbackError) {
      logger.error('User callback error in handle():', callbackError);
    }

    return result;
  }

  /**
   * The answer CMI expects for this result (as in CMI's reference callback.php):
   * - approved payment → "ACTION=POSTAUTH" or "APPROVED" (confirmation mode), or `successResponse`
   * - authentic decline → "APPROVED" (acknowledgement), or `declinedResponse`
   * - invalid hash, technical error or rejected order → "FAILURE", or `failureResponse`
   */
  getResponse(result: CallbackResult): { status: number; body: string } {
    if (result.success) {
      return {
        status: 200,
        body: this.options.successResponse || result.status,
      };
    }

    if (result.status === 'DECLINED' && result.verified) {
      return { status: 200, body: this.options.declinedResponse };
    }

    return {
      status: 200,
      body: this.options.failureResponse,
    };
  }
}
