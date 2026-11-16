/** Why a call to CMI's XML API could not be completed. */
export type CMIApiErrorCode = 'TIMEOUT' | 'NETWORK' | 'HTTP_STATUS' | 'INVALID_RESPONSE';

/**
 * Thrown when no usable answer came back from CMI's XML API: timeout, network
 * failure, non-2xx HTTP status or an unreadable answer. A declined or refused
 * operation is NOT an error: it is a result with `approved: false`.
 *
 * The request may still have reached CMI. After any CMIApiError on an operation
 * that moves money (capture, refund, void), the outcome is unknown: query the
 * order status before sending it again, or the money may move twice.
 */
export class CMIApiError extends Error {
  readonly code: CMIApiErrorCode;
  /** The operation that failed, e.g. "refund". */
  readonly operation: string;
  /** HTTP status, for HTTP_STATUS errors. */
  readonly status?: number;

  constructor(code: CMIApiErrorCode, operation: string, message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'CMIApiError';
    this.code = code;
    this.operation = operation;
    this.status = options?.status;
  }
}
