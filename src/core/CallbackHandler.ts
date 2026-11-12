// src/core/CallbackHandler.ts
import type { CMIPaymentGateway } from "./CMIPaymentGateway";
import {
  CallbackHandlerOptions,
  CallbackRequest,
  CallbackResponse,
  CallbackResult,
  CallbackMiddleware,
} from "@types";
import { logger } from "@logger";

/** Status and body to answer CMI with. */
export interface CallbackAnswer {
  status: number;
  body: string;
}

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
  private warnedNoValidateOrder = false;

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

  /** Whether callback parameters may be read from the URL query string of a GET request. */
  get supportsGetMethod(): boolean {
    return this.options.supportGetMethod;
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
        const { result, response } = await this.evaluate(params);

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
            (res as CallbackResponse).status(response.status).send(response.body);
          } catch (sendError) {
            logger.error('Failed to send response to CMI:', sendError);
            // Do NOT attempt a second res.send() — the socket/response
            // is in an unknown state.  Fall through to consumer callbacks
            // so the payment can still be processed on our side.
          }

          // Invoke consumer callbacks AFTER the response is committed.
          // Errors here are logged but do NOT change the response.
          await this.notify(result);
        } else {
          (req as any).paymentResult = result;
          if (next) {
            next();
          } else {
            logger.warn(
              "CallbackHandler: autoRespond is false and no next() was given, so nothing answers CMI. " +
              "Send the answer yourself (see getResponse()), or leave autoRespond enabled."
            );
          }

          // Invoke consumer callbacks AFTER next() for non-autoRespond mode.
          await this.notify(result);
        }
      } catch (error) {
        logger.error('Callback handler error:', error);
        if (this.options.autoRespond) {
          try {
            const answer = this.errorResponse();
            (res as CallbackResponse).status(answer.status).send(answer.body);
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

  /**
   * Verify the callback, then let the merchant check the order (`validateOrder`)
   * before anything is answered to CMI — as CMI's integration guide requires
   * (the order exists and its amount matches). A rejected or failing check turns
   * the result into a FAILURE, so CMI does not capture the payment.
   */
  private async verifyAndValidate(params: unknown): Promise<CallbackResult> {
    const result: CallbackResult = this.gateway.verifyCallback(params as Record<string, unknown>);
    if (!result.success) {
      return result;
    }

    if (!this.options.validateOrder) {
      if (!this.warnedNoValidateOrder && this.gateway.getConfirmationMode() === 'auto') {
        this.warnedNoValidateOrder = true;
        logger.warn(
          "CallbackHandler: confirmationMode is 'auto' but no validateOrder was given. " +
          "Payments are captured without checking that the order exists, matches the amount " +
          "and was not already paid. Pass validateOrder to check the order before CMI captures it."
        );
      }
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
   * Verify the callback and work out the answer for CMI, without running
   * `onSuccess` / `onFailure`. Adapters send `response` first, then call
   * {@link notify}, so a slow consumer callback cannot delay CMI's answer.
   */
  async evaluate(params: unknown): Promise<{ result: CallbackResult; response: CallbackAnswer }> {
    const result = await this.verifyAndValidate(params);
    return { result, response: this.getResponse(result) };
  }

  /**
   * Run `onSuccess` or `onFailure` for a result. Errors thrown by the consumer
   * are logged and never propagate, so they cannot change the answer to CMI.
   */
  async notify(result: CallbackResult): Promise<void> {
    try {
      if (result.success) {
        await Promise.resolve(this.options.onSuccess(result));
      } else {
        await Promise.resolve(this.options.onFailure(result));
      }
    } catch (callbackError) {
      logger.error('User callback error (CMI answer not affected):', callbackError);
    }
  }

  /**
   * Handle callback params directly (for frameworks that manage their own response).
   *
   * `onSuccess` / `onFailure` run before this resolves. Consumer errors are
   * caught and logged, so they do not prevent the result from being returned.
   */
  async handle(params: unknown): Promise<CallbackResult> {
    const { result } = await this.evaluate(params);
    await this.notify(result);
    return result;
  }

  /**
   * The answer CMI expects for this result (as in CMI's reference callback.php):
   * - approved payment → "ACTION=POSTAUTH" or "APPROVED" (confirmation mode), or `successResponse`
   * - authentic decline → "APPROVED" (acknowledgement), or `declinedResponse`
   * - invalid hash, technical error or rejected order → "FAILURE", or `failureResponse`
   */
  getResponse(result: CallbackResult): CallbackAnswer {
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

  /** The answer sent when handling the callback threw unexpectedly. */
  errorResponse(): CallbackAnswer {
    return { status: 500, body: this.options.failureResponse };
  }
}
