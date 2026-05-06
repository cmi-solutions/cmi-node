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

  [key: string]: any;
}
