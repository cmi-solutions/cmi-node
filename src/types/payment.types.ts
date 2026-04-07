import { CurrencyCode } from "@constants";
import { Language } from "@constants";

export type CurrencyInput = CurrencyCode | string;

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

  amountCur?: number;
  symbolCur?: string;

  [key: string]: any;
}
