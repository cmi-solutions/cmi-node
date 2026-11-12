import { CurrencyCode } from "@constants";
import { Language } from "@constants";

export type CurrencyInput = CurrencyCode | string;

/**
 * Item-level fields (optional, dynamic naming):
 * CMI supports per-item order details using numbered field names.
 * Example for item N=1:
 *   id1, itemnumber1, productcode1, qty1, desc1, price1, total1
 *
 * These are passed as custom fields and are not strictly typed.
 * Example:
 *   gateway.createPaymentParams({
 *     ...baseParams,
 *     id1: 'ITEM-001',
 *     qty1: 2,
 *     price1: 14.99,
 *     total1: 29.98,
 *   })
 */
export interface PaymentRequest {
  amount: number | string;
  /** Order ID. Auto-generated if omitted. */
  oid?: string;
  okUrl: string;
  failUrl: string;
  shopUrl: string;
  email: string;
  BillToName: string;
  currency: CurrencyInput;
  /** Defaults to 'fr' if omitted. */
  lang?: Language;
  hashAlgorithm?: string;
  tel?: string;
  /** Random value. Auto-generated if omitted. */
  rnd?: string;
  /** Defaults to 'UTF-8' if omitted. */
  encoding?: string;
  AutoRedirect?: boolean;
  BillToCity?: string;
  BillToCountry?: string;
  BillToStreet1?: string;
  BillToStateProv?: string;
  BillToPostalCode?: string;
  BillToTelVoice?: string;
  BillToCompany?: string;
  BillToStreet2?: string;
  BillToStreet3?: string;

  /** Payment description (max 125 characters). */
  description?: string;

  amountCur?: number;
  symbolCur?: string;

  /**
   * Session timeout in seconds for the CMI hosted payment page.
   * Min: 30, Max: 2700, Default: 1800.
   */
  sessiontimeout?: number;

  /**
   * When true, CMI redirects the customer back to okUrl/failUrl via GET
   * instead of the default POST.
   */
  redirectGet?: boolean;

  /**
   * Enables or disables the server-to-server callback for this specific
   * payment request. Default: true.
   */
  CallbackResponse?: boolean;

  /** @deprecated Use `tel` instead. This field will throw at runtime. */
  phone?: never;

  /** Custom fields (e.g. id1, qty1, price1) are sent to CMI and included in the hash. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kept `any` so existing callers keep compiling
  [key: string]: any;
}

/** A value in the parameters posted to CMI. */
export type PaymentParamValue = string | number | boolean;

/**
 * Parameters returned by `createPaymentParams()`: exactly what is posted to CMI,
 * including the computed `hash`. Custom fields from the request are included as strings.
 */
export interface PaymentParams {
  oid: string;
  rnd: string;
  clientId: string;
  trantype: string;
  amount: string;
  currency: string;
  storetype: string;
  email: string;
  BillToName: string;
  lang: string;
  okUrl: string;
  failUrl: string;
  shopUrl: string;
  hashAlgorithm: string;
  encoding: string;
  AutoRedirect: string;
  hash: string;
  callbackUrl?: string;
  amountCur?: string;
  symbolCur?: string;
  redirectGet?: boolean;
  CallbackResponse?: boolean;
  sessiontimeout?: number;
  /**
   * Custom fields. Typed `any` (not PaymentParamValue) so existing code that reads them
   * as strings, or assigns the params to Record<string, string>, keeps compiling.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
}
