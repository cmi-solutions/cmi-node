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

        if (result.success) {
          await Promise.resolve(this.options.onSuccess(result));
        } else {
          await Promise.resolve(this.options.onFailure(result));
        }

        if (this.options.autoRespond) {
          this.sendResponse(res as CallbackResponse, result);
        } else if (next) {
          (req as any).paymentResult = result;
          next();
        }
      } catch (error) {
        logger.error('Callback handler error:', error);
        if (this.options.autoRespond) {
          (res as CallbackResponse).status(500).send("FAILURE");
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
    try {
      if (result.success) {
        const response = this.options.successResponse || result.status;
        res.status(200).send(response);
      } else {
        const response = this.options.failureResponse;
        res.status(200).send(response);
      }
    } catch {
      res.status(500).send("ERROR");
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
