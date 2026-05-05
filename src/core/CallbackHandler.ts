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
  private options: Required<CallbackHandlerOptions>;

  constructor(gateway: CMIPaymentGateway, options?: CallbackHandlerOptions) {
    this.gateway = gateway;
    this.options = {
      autoRespond: options?.autoRespond ?? true,
      successResponse: options?.successResponse ?? "",
      failureResponse: options?.failureResponse ?? "FAILURE",
      onSuccess: options?.onSuccess ?? (() => { }),
      onFailure: options?.onFailure ?? (() => { }),
      supportGetMethod: options?.supportGetMethod ?? false,
    };
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
        const result: CallbackResult = this.gateway.verifyCallback(params);

        // IMPORTANT: Send the response to CMI FIRST, based solely on the
        // verification result.  If we let consumer callbacks run first,
        // a throw inside onSuccess would cause a 500 FAILURE response
        // even though the payment was legitimately verified.
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
    if (result.success) {
      const response = this.options.successResponse || result.status;
      res.status(200).send(response);
    } else {
      const response = this.options.failureResponse;
      res.status(200).send(response);
    }
  }

  async handle(params: any): Promise<CallbackResult> {
    const result: CallbackResult = this.gateway.verifyCallback(params);

    if (result.success) {
      await Promise.resolve(this.options.onSuccess(result));
    } else {
      await Promise.resolve(this.options.onFailure(result));
    }

    return result;
  }

  getResponse(result: CallbackResult): { status: number; body: string } {
    if (result.success) {
      return {
        status: 200,
        body: this.options.successResponse || result.status,
      };
    }

    return {
      status: 200,
      body: this.options.failureResponse,
    };
  }
}
