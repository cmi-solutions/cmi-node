// Public types of the API kit (CMI's back-office XML API, CC5).
import type { CC5TransportConfig } from '@shared/cc5';

/**
 * Settings of a {@link CMIApiClient}: the API URL, the merchant's ClientId and the
 * API user (`username`, `password`), plus an optional `timeoutMs` and `fetch`.
 */
export type CMIApiConfig = CC5TransportConfig;

/** What every CMI API answer carries. */
export interface CMIApiResponse {
  /** CMI's `Response`: "Approved", "Declined" or "Error". */
  response: string;
  /** CMI's `ProcReturnCode`: "00" approved, "99" gateway error, other values are bank (ISO-8583) codes. */
  procReturnCode: string;
  /** `ErrMsg`: the error text, or for queries "Record(s) found for ...". */
  message?: string;
  /** `Extra.ERRORCODE`, when CMI sends one (e.g. "CORE-2008"). */
  errorCode?: string;
  /** `OrderId` as answered by CMI. */
  orderId?: string;
  /** Every top-level element of the answer, as text. */
  fields: Readonly<Record<string, string>>;
  /** Every child of `<Extra>`, as text. */
  extra: Readonly<Record<string, string>>;
}

/** Answer to a PostAuth, refund (Credit) or Void. */
export interface CMITransactionResult extends CMIApiResponse {
  /** True when CMI answered `Response=Approved` with `ProcReturnCode=00`. */
  approved: boolean;
  transId?: string;
  groupId?: string;
  authCode?: string;
  hostRefNum?: string;
  /** `Extra.SETTLEID`. */
  settleId?: string;
  /** `Extra.TRXDATE`, as sent by CMI ("yyyyMMdd HH:mm:ss", Morocco time). */
  transactionDate?: string;
  /** `Extra.CARDBRAND`, e.g. "VISA". */
  cardBrand?: string;
  /** `Extra.CARDISSUER`. */
  cardIssuer?: string;
}

/**
 * Status of an order transaction, from CMI's TRANS_STAT and CHARGE_TYPE_CD.
 * - `declined` (D), `preauthorized` (A), `captured` (C), `settled` (S)
 * - `refunded` (C or S on a refund line), `voided` (V)
 * - `pending` (PN), `reversal_required` (R), `processing` (NW): not final yet, query again
 * - `error` (ERR) and `cancelled` (CNCL): recurring orders
 * - `unknown`: a code this SDK does not know
 */
export type CMIOrderStatus =
  | 'declined'
  | 'preauthorized'
  | 'captured'
  | 'settled'
  | 'refunded'
  | 'voided'
  | 'pending'
  | 'reversal_required'
  | 'processing'
  | 'error'
  | 'cancelled'
  | 'unknown';

/** One transaction of an order, as reported by the status and history queries. */
export interface CMIOrderTransaction {
  /** Readable status. */
  status: CMIOrderStatus;
  /** CMI's TRANS_STAT code (D, A, C, S, PN, V, R, NW, ERR, CNCL). */
  statusCode: string;
  /** CMI's CHARGE_TYPE_CD: "S" for an authorization/capture, "C" for a refund. */
  chargeType: string;
  /** True when the goods can be shipped (captured or settled payment). */
  shipmentPossible: boolean;
  /** True for a temporary state (pending, reversal required, processing): query again later. */
  transient: boolean;
  /** Authorized amount (ORIG_TRANS_AMT, converted from cents). */
  originalAmount?: number;
  /** Captured amount (CAPTURE_AMT, converted from cents). */
  capturedAmount?: number;
  /** AUTH_DTTM, as sent by CMI ("yyyy-MM-dd HH:mm:ss.S", Morocco time). */
  authorizedAt?: string;
  /** CAPTURE_DTTM, as sent by CMI. */
  capturedAt?: string;
  /** VOID_DTTM (history only), as sent by CMI. */
  voidedAt?: string;
  authCode?: string;
  hostRefNum?: string;
  /** PROC_RET_CD: the bank's return code for this transaction ("00" approved). */
  hostReturnCode?: string;
  transId?: string;
  settleId?: string;
  xid?: string;
  cavv?: string;
  eci?: string;
  mdStatus?: string;
}

/** Answer to an order status query. */
export interface CMIOrderStatusResult extends CMIApiResponse {
  /** True when CMI found the order. */
  found: boolean;
  /**
   * The order's last successful transaction, or its last failed one when none succeeded.
   * Undefined when the order was not found.
   */
  transaction?: CMIOrderTransaction;
  /** Masked card number (Extra.PAN), e.g. "4000 00** **** 0010". */
  maskedPan?: string;
}

/** One line of an order history. */
export interface CMIOrderHistoryEntry extends CMIOrderTransaction {
  /** The TRXn line as sent by CMI. */
  raw: string;
}

/** Answer to an order history query. */
export interface CMIOrderHistoryResult extends CMIApiResponse {
  /** True when CMI found the order. */
  found: boolean;
  /** Every transaction of the order, in CMI's TRX1..TRXn order. */
  transactions: CMIOrderHistoryEntry[];
}

/** A capture of a pre-authorized order. */
export interface CMIPostAuthRequest {
  orderId: string;
  /** Amount to capture. Leave it out to capture the whole authorized amount. */
  amount?: number | string;
}

/** A refund of a captured order. */
export interface CMIRefundRequest {
  orderId: string;
  /** Amount to refund. Leave it out to refund the whole order. Several partial refunds are allowed. */
  amount?: number | string;
  /** Currency of the amount, numeric or alphabetic ("504" or "MAD"). Default "504". */
  currency?: string;
}

/** A cancellation (Void) of an order: a pre-authorization, capture, sale or refund. */
export interface CMIVoidRequest {
  orderId: string;
}
