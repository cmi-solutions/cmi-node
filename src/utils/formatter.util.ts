import { normalizeCurrency, normalizeCurrencyCode } from "@constants/currencies";

export class FormatterUtil {
  /**
   * Format and validate amount for CMI gateway
   * 
   * @param amount - The amount as number or string
   * @returns Properly formatted amount string (e.g., "220.00")
   * @throws Error if amount contains non-numeric characters
   */
  static formatAmount(amount: number | string): string {
    if (typeof amount === 'number') {
      if (isNaN(amount) || !isFinite(amount)) {
        throw new Error('Amount must be a valid finite number');
      }
      // Work in whole cents. A number that is not a whole number of cents
      // (beyond floating-point noise such as 19.99 * 3) is rejected instead of
      // being rounded: Number.toFixed(2) turns 1.005 into "1.00".
      const scaled = amount * 100;
      const cents = Math.round(scaled);
      if (Math.abs(scaled - cents) > 1e-6 || !Number.isSafeInteger(cents)) {
        throw new Error(
          `Invalid amount: ${amount}. Amounts must have at most 2 decimal places.`
        );
      }
      return FormatterUtil.centsToString(cents);
    }

    // Strings are formatted from their digits, without going through a float.
    const trimmedAmount = String(amount).trim();
    const match = /^(-?)(\d*)(?:\.(\d+))?$/.exec(trimmedAmount);

    if (!match || (match[2] === '' && match[3] === undefined)) {
      throw new Error(
        `Invalid amount format: "${amount}". Amount must contain only numeric characters (e.g., "220" or "220.50")`
      );
    }

    const [, sign, integerDigits, fractionDigits = ''] = match;
    if (fractionDigits.length > 2) {
      throw new Error(
        `Invalid amount: "${amount}". Amounts must have at most 2 decimal places.`
      );
    }

    // Leading zeros are dropped: "0220" -> "220.00", ".5" -> "0.50".
    const integer = integerDigits.replace(/^0+(?=\d)/, '') || '0';
    return `${sign}${integer}.${fractionDigits.padEnd(2, '0')}`;
  }

  private static centsToString(cents: number): string {
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(cents);
    return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
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

