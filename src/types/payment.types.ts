import { CurrencyCode } from "@constants";
import { Language } from "@constants";

export type CurrencyInput = CurrencyCode | string;

export interface PaymentRequest {
  amount: number | string;
  oid: string;
  okUrl: string;
  failUrl: string;
  shopUrl: string;
  email: string;
  BillToName: string;
  currency: CurrencyInput;
  lang: Language;
  hashAlgorithm?: string;
  tel?: string;

  rnd: string;
  encoding: string;
  AutoRedirect?: boolean;
  BillToCity?: string;
  BillToCountry?: string;
  BillToStreet1?: string;
  BillToStateProv?: string;
  BillToPostalCode?: string;
  BillToTelVoice?: string;

  amountCur?: number;
  symbolCur?: string;

  [key: string]: any;
}
