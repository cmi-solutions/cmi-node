// src/api/CMIApiClient.ts
//
// Client for CMI's back-office XML API (CC5): capture (PostAuth), refund (Credit),
// void, order status and order history. Server-only: it holds the API password.

import { normalizeCurrency } from '@constants/currencies';
import { logger } from '@logger';
import { FormatterUtil } from '@utils/formatter.util';
import { SecretString } from '@utils/secret-string.util';
import { assertServerRuntime } from '@utils/runtime-guard.util';
import { Validator } from '@validators/validator';
import type {
  CMIApiConfig,
  CMIApiResponse,
  CMITransactionResult,
  CMIOrderStatusResult,
  CMIOrderHistoryResult,
  CMIPostAuthRequest,
  CMIRefundRequest,
  CMIVoidRequest,
} from './api.types';
import { buildCC5Request, parseCC5Response, CC5XmlError, type CC5Node, type CC5Response } from './xml';
import {
  historyLines,
  parseHistoryLine,
  parseOrderStatusText,
  transactionFromStatusFields,
} from './order-status';

/** Why a CMI API call could not be completed (the request may or may not have reached CMI). */
export type CMIApiErrorCode = 'TIMEOUT' | 'NETWORK' | 'HTTP_STATUS' | 'INVALID_RESPONSE';

/**
 * Thrown when no usable answer came back from CMI: timeout, network failure,
 * non-2xx HTTP status or an unreadable answer. A declined or refused operation
 * is NOT an error: it is a result with `approved: false`.
 *
 * After a TIMEOUT or NETWORK error on a capture, refund or void, CMI may still have
 * done it: call `orderStatus()` before trying again, or the money may move twice.
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

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;
/** CMI's answers are a few kilobytes; anything far bigger is not a CC5Response. */
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_ORDER_ID_LENGTH = 64;
const MAX_CLIENT_ID_LENGTH = 15;
const MAX_CREDENTIAL_LENGTH = 255;

class ApiConfigValidator extends Validator {
  static isAllowedApiUrl(url: string): boolean {
    return this.isSecureOrLocalUrl(url);
  }
}

function requireText(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required and must be a non-empty string.`);
  }
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${name} must be at most ${maxLength} characters.`);
  return text;
}

function orderIdOf(value: unknown): string {
  const orderId = requireText(value, 'orderId', MAX_ORDER_ID_LENGTH);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(orderId)) throw new Error('orderId must not contain control characters.');
  return orderId;
}

function positiveAmount(value: number | string, operation: string): string {
  const amount = FormatterUtil.formatAmount(value);
  if (amount.startsWith('-') || /^0+\.00$/.test(amount)) {
    throw new Error(`The ${operation} amount must be greater than 0 (got "${value}").`);
  }
  return amount;
}

const optional = (value: string | undefined): string | undefined => (value ? value : undefined);

/**
 * CMI back-office API client.
 *
 * Uses an API user (name + password created in CMI's back office), not the storeKey:
 * it is independent from {@link CMIPaymentGateway}. Run it on your server only.
 *
 * @example
 * ```ts
 * const api = new CMIApiClient({
 *   apiUrl: process.env.CMI_API_URL!,
 *   clientId: process.env.CMI_CLIENT_ID!,
 *   username: process.env.CMI_API_USER!,
 *   password: process.env.CMI_API_PASSWORD!,
 * });
 *
 * const status = await api.orderStatus('ORDER-123');
 * if (status.transaction?.status === 'preauthorized') {
 *   const capture = await api.postAuth({ orderId: 'ORDER-123' });
 *   if (!capture.approved) console.error(capture.procReturnCode, capture.message);
 * }
 * ```
 */
export class CMIApiClient {
  readonly #apiUrl: string;
  readonly #clientId: string;
  readonly #username: string;
  readonly #password: SecretString;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(config: CMIApiConfig) {
    assertServerRuntime();
    if (!config || typeof config !== 'object') throw new Error('CMIApiClient needs a configuration object.');

    const apiUrl = requireText(config.apiUrl, 'apiUrl', 2048);
    if (!ApiConfigValidator.isAllowedApiUrl(apiUrl)) {
      throw new Error(`apiUrl must be an https:// URL (plain http only for localhost), got "${apiUrl}".`);
    }
    this.#apiUrl = apiUrl;
    this.#clientId = requireText(config.clientId, 'clientId', MAX_CLIENT_ID_LENGTH);
    this.#username = requireText(config.username, 'username', MAX_CREDENTIAL_LENGTH);
    if (typeof config.password !== 'string' || config.password === '') {
      throw new Error('password is required and must be a non-empty string.');
    }
    if (config.password.length > MAX_CREDENTIAL_LENGTH) {
      throw new Error(`password must be at most ${MAX_CREDENTIAL_LENGTH} characters.`);
    }
    this.#password = new SecretString(config.password);

    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new Error(`timeoutMs must be a whole number of milliseconds between 1 and ${MAX_TIMEOUT_MS}.`);
    }
    this.#timeoutMs = timeoutMs;

    const fetchImpl = config.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('No fetch function available: use Node.js 22 or later, or pass `fetch` in the config.');
    }
    this.#fetch = fetchImpl;
  }

  /**
   * Captures a pre-authorized order (PostAuth).
   * Leave `amount` out to capture the whole authorized amount; a smaller amount captures part of it.
   */
  async postAuth(request: CMIPostAuthRequest): Promise<CMITransactionResult> {
    const orderId = orderIdOf(request?.orderId);
    const elements: Array<[string, CC5Node]> = [['Type', 'PostAuth'], ['OrderId', orderId]];
    if (request.amount !== undefined) elements.push(['Total', positiveAmount(request.amount, 'capture')]);
    return this.#transaction('postAuth', orderId, elements);
  }

  /**
   * Refunds a captured order (Credit). Leave `amount` out to refund the whole order.
   * Several partial refunds are allowed, up to the captured amount.
   */
  async refund(request: CMIRefundRequest): Promise<CMITransactionResult> {
    const orderId = orderIdOf(request?.orderId);
    const elements: Array<[string, CC5Node]> = [['Type', 'Credit'], ['OrderId', orderId]];
    if (request.amount !== undefined) {
      const currency = normalizeCurrency(String(request.currency ?? '504'));
      if (!currency) throw new Error(`Unsupported currency "${request.currency}".`);
      elements.push(['Total', positiveAmount(request.amount, 'refund')], ['Currency', currency]);
    }
    return this.#transaction('refund', orderId, elements);
  }

  /** Cancels (voids) an order's pre-authorization, capture, sale or refund. */
  async void(request: CMIVoidRequest): Promise<CMITransactionResult> {
    const orderId = orderIdOf(request?.orderId);
    return this.#transaction('void', orderId, [['Type', 'Void'], ['OrderId', orderId]]);
  }

  /**
   * Queries an order's status. Nothing changes on CMI's side.
   * CMI reports the order's last successful transaction, or its last failed one when none succeeded.
   * For a `transient` status (pending, reversal_required, processing), query again later
   * (CMI suggests every 5 minutes).
   */
  async orderStatus(orderId: string): Promise<CMIOrderStatusResult> {
    const id = orderIdOf(orderId);
    const answer = await this.#call('orderStatus', id, [
      ['OrderId', id],
      ['Extra', [['ORDERSTATUS', 'QUERY']]],
    ]);
    const base = this.#base(answer);
    const found = base.response === 'Approved' && base.procReturnCode === '00';
    if (!found) return { ...base, found };

    // Separate Extra elements win; the ORDERSTATUS name:value text fills any gap.
    const fromText = answer.extra.ORDERSTATUS ? parseOrderStatusText(answer.extra.ORDERSTATUS) : {};
    const merged: Record<string, string> = Object.assign(Object.create(null), fromText);
    for (const [key, value] of Object.entries(answer.extra)) {
      if (value !== '' || merged[key] === undefined) merged[key] = value;
    }
    return {
      ...base,
      found,
      transaction: transactionFromStatusFields(merged),
      maskedPan: optional(answer.extra.PAN),
    };
  }

  /** Lists every transaction of an order (authorizations, captures, refunds, voids). */
  async orderHistory(orderId: string): Promise<CMIOrderHistoryResult> {
    const id = orderIdOf(orderId);
    const answer = await this.#call('orderHistory', id, [
      ['OrderId', id],
      ['Extra', [['ORDERHISTORY', 'QUERY']]],
    ]);
    const base = this.#base(answer);
    const found = base.response === 'Approved' && base.procReturnCode === '00';
    return { ...base, found, transactions: found ? historyLines(answer.extra).map(parseHistoryLine) : [] };
  }

  /** Masks the credentials when the client is logged. */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `CMIApiClient { apiUrl: '${this.#apiUrl}', clientId: '${this.#clientId}', password: '********' }`;
  }

  toJSON(): Record<string, string> {
    return { apiUrl: this.#apiUrl, clientId: this.#clientId, password: '********' };
  }

  async #transaction(operation: string, orderId: string, elements: Array<[string, CC5Node]>): Promise<CMITransactionResult> {
    const answer = await this.#call(operation, orderId, elements);
    const base = this.#base(answer);
    const { fields, extra } = answer;
    return {
      ...base,
      approved: base.response === 'Approved' && base.procReturnCode === '00',
      transId: optional(fields.TransId),
      groupId: optional(fields.GroupId),
      authCode: optional(fields.AuthCode),
      hostRefNum: optional(fields.HostRefNum),
      settleId: optional(extra.SETTLEID),
      transactionDate: optional(extra.TRXDATE),
      cardBrand: optional(extra.CARDBRAND),
      cardIssuer: optional(extra.CARDISSUER),
    };
  }

  #base({ fields, extra }: CC5Response): CMIApiResponse {
    return {
      response: fields.Response ?? '',
      procReturnCode: fields.ProcReturnCode ?? '',
      message: optional(fields.ErrMsg),
      errorCode: optional(extra.ERRORCODE ?? fields.ERRORCODE),
      orderId: optional(fields.OrderId),
      fields,
      extra,
    };
  }

  /** Sends one CC5Request and reads the CC5Response. Never retries: see CMIApiError. */
  async #call(operation: string, orderId: string, elements: Array<[string, CC5Node]>): Promise<CC5Response> {
    const xml = buildCC5Request([
      ['Name', this.#username],
      ['Password', this.#password.getValue()],
      ['ClientId', this.#clientId],
      ...elements,
    ]);

    let response: Response;
    try {
      response = await this.#fetch(this.#apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/xml, text/xml, */*',
        },
        body: new URLSearchParams({ DATA: xml }).toString(),
        // A redirect would resend the credentials to another URL: refuse it.
        redirect: 'error',
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      logger.warn(`CMI API ${operation} for order ${orderId}: ${timedOut ? 'timed out' : 'network error'}`);
      throw new CMIApiError(
        timedOut ? 'TIMEOUT' : 'NETWORK',
        operation,
        timedOut
          ? `CMI API ${operation} timed out after ${this.#timeoutMs} ms.`
          : `CMI API ${operation} failed: ${error instanceof Error ? error.message : 'network error'}.`,
        { cause: error },
      );
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      logger.warn(`CMI API ${operation} for order ${orderId}: HTTP ${response.status}`);
      throw new CMIApiError('HTTP_STATUS', operation, `CMI API ${operation} answered HTTP ${response.status}.`, {
        status: response.status,
      });
    }

    let answer: CC5Response;
    try {
      answer = parseCC5Response(await readBody(response));
    } catch (error) {
      if (error instanceof CMIApiError) throw error;
      const reason = error instanceof CC5XmlError ? error.message : 'the answer could not be read';
      logger.warn(`CMI API ${operation} for order ${orderId}: invalid answer (${reason})`);
      throw new CMIApiError('INVALID_RESPONSE', operation, `CMI API ${operation}: ${reason}`, { cause: error });
    }

    logger.debug(
      `CMI API ${operation} for order ${orderId}: ${answer.fields.Response ?? '?'} (${answer.fields.ProcReturnCode ?? '?'})`,
    );
    return answer;
  }
}

/** Reads the body (at most MAX_RESPONSE_BYTES) in the charset it declares, UTF-8 by default. */
async function readBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_RESPONSE_BYTES) throw new CC5XmlError('The CMI answer is too large.');

  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new CC5XmlError('The CMI answer is too large.');
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // Charset: the Content-Type header, else the XML declaration, else UTF-8.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const charset =
    /charset=["']?([\w-]+)/i.exec(response.headers.get('content-type') ?? '')?.[1] ??
    /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1] ??
    'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}
