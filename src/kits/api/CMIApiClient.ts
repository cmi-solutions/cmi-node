// src/kits/api/CMIApiClient.ts
//
// API kit: CMI's back-office XML API (CC5): capture (PostAuth), refund (Credit),
// void, order status and order history. Server-only: it holds the API password.

import { CC5Transport, requireText, type CC5Node, type CC5Response } from '@shared/cc5';
import { normalizeCurrency } from '@shared/constants/currencies';
import { formatAmount } from '@shared/formatting/amount.util';
import { assertServerRuntime } from '@shared/security/runtime-guard.util';
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
import {
  historyLines,
  parseHistoryLine,
  parseOrderStatusText,
  transactionFromStatusFields,
} from './order-status';

const MAX_ORDER_ID_LENGTH = 64;

const orderIdOf = (value: unknown): string => requireText(value, 'orderId', MAX_ORDER_ID_LENGTH);

function positiveAmount(value: number | string, operation: string): string {
  const amount = formatAmount(value);
  if (amount.startsWith('-') || /^0+\.00$/.test(amount)) {
    throw new Error(`The ${operation} amount must be greater than 0 (got "${value}").`);
  }
  return amount;
}

const optional = (value: string | undefined): string | undefined => (value ? value : undefined);

/**
 * CMI back-office API client (API kit).
 *
 * Uses an API user (name + password created in CMI's back office), not the storeKey:
 * it is independent from the Standard kit's {@link CMIPaymentGateway}. Run it on your
 * server only.
 *
 * Every operation sends one request and never retries. A refused operation is a
 * result (`approved: false`); a {@link CMIApiError} means no usable answer came back.
 * After a CMIApiError on postAuth, refund or void, CMI may still have done it: call
 * `orderStatus()` (or `orderHistory()`) before sending it again.
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
  readonly #transport: CC5Transport;

  constructor(config: CMIApiConfig) {
    assertServerRuntime();
    this.#transport = new CC5Transport(config);
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
   * Several partial refunds are allowed, up to the captured amount. `currency` goes
   * with `amount` only.
   */
  async refund(request: CMIRefundRequest): Promise<CMITransactionResult> {
    const orderId = orderIdOf(request?.orderId);
    const elements: Array<[string, CC5Node]> = [['Type', 'Credit'], ['OrderId', orderId]];
    if (request.amount !== undefined) {
      const currency = normalizeCurrency(String(request.currency ?? '504'));
      if (!currency) throw new Error(`Unsupported currency "${request.currency}".`);
      elements.push(['Total', positiveAmount(request.amount, 'refund')], ['Currency', currency]);
    } else if (request.currency !== undefined) {
      throw new Error(
        'currency is only used with amount (a partial refund). Leave both out for a full refund, ' +
          'or give the amount to refund.',
      );
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
    const answer = await this.#transport.send('orderStatus', id, [
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
    const answer = await this.#transport.send('orderHistory', id, [
      ['OrderId', id],
      ['Extra', [['ORDERHISTORY', 'QUERY']]],
    ]);
    const base = this.#base(answer);
    const found = base.response === 'Approved' && base.procReturnCode === '00';
    return { ...base, found, transactions: found ? historyLines(answer.extra).map(parseHistoryLine) : [] };
  }

  /** Masks the credentials when the client is logged. */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    const { apiUrl, clientId, password } = this.#transport.describe();
    return `CMIApiClient { apiUrl: '${apiUrl}', clientId: '${clientId}', password: '${password}' }`;
  }

  toJSON(): Record<string, string> {
    return this.#transport.describe();
  }

  async #transaction(operation: string, orderId: string, elements: Array<[string, CC5Node]>): Promise<CMITransactionResult> {
    const answer = await this.#transport.send(operation, orderId, elements);
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
}
