// src/types/callback-handler.types.ts

import { CallbackResult } from "./callback.types";

/**
 * HTTP request object (Express-compatible)
 */
export interface CallbackRequest {
  body?: any;
  query?: any;
  method?: string;
  headers?: any;
  [key: string]: any;
}

/**
 * HTTP response object (Express-compatible)
 */
export interface CallbackResponse {
  status: (code: number) => CallbackResponse;
  send: (data: any) => CallbackResponse;
  json: (data: any) => CallbackResponse;
  end: () => void;
  [key: string]: any;
}

/**
 * Callback handler options
 */
export interface CallbackHandlerOptions {
  /**
   * Whether to automatically send response
   * @default true
   */
  autoRespond?: boolean;

  /**
   * Custom success response message
   * @default "ACTION=POSTAUTH" or "APPROVED"
   */
  successResponse?: string;

  /**
   * Custom failure response message
   * @default "FAILURE"
   */
  failureResponse?: string;

  /**
   * Callback function when payment is verified
   */
  onSuccess?: (result: CallbackResult) => void | Promise<void>;

  /**
   * Callback function when payment verification fails
   */
  onFailure?: (result: CallbackResult) => void | Promise<void>;

  /**
   * Support both POST and GET methods (for backward compatibility)
   * @default false
   */
  supportGetMethod?: boolean;
}

/**
 * Next.js API handler context
 */
export interface NextApiContext {
  req: any;
  res: any;
}
