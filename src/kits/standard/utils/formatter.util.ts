import { formatAmount } from "@shared/formatting/amount.util";
import { normalizeCurrency, normalizeCurrencyCode } from "@shared/constants/currencies";

export class FormatterUtil {
  /**
   * Format an amount for the CMI gateway, with exactly 2 decimals, rounded half-up to
   * the cent ("125.6578" -> "125.66"). See {@link formatAmount}.
   */
  static formatAmount(amount: number | string): string {
    return formatAmount(amount);
  }

  static formatAutoRedirect(autoRedirect: boolean | undefined): string {
    if (autoRedirect === undefined) return "false";
    return autoRedirect ? "true" : "false";
  }

  static formatStoreType(storeType: string): string {
    return storeType.toLowerCase();
  }

  static formatCurrencyCode(currencyCode: string): string {
    return normalizeCurrencyCode(currencyCode) || "";
  }

  static formatCurrencyNumeric(currencyNumeric: string): string {
    return normalizeCurrency(currencyNumeric) || "";
  }
}

