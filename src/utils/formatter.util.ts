import { normalizeCurrency, normalizeCurrencyCode } from "@constants/currencies";

export class FormatterUtil {
  /**
   * Format an amount for the CMI gateway, with exactly 2 decimals.
   *
   * Any number of decimals is accepted. Amounts with more than 2 decimals are
   * rounded half-up to the cent, the way CMI's gateway does it
   * ("125.6578" -> "125.66", "125.3333" -> "125.33", "1.005" -> "1.01").
   * The rounding works on the decimal digits, never on a binary float, so
   * Number.toFixed() errors (1.005 -> "1.00") cannot happen. The rounded value
   * is the one posted to CMI and hashed, so the charged amount is known exactly.
   *
   * @param amount - The amount as number or string
   * @returns Formatted amount string (e.g., "220.00")
   * @throws Error if amount is not a plain decimal number
   */
  static formatAmount(amount: number | string): string {
    let text: string;
    if (typeof amount === 'number') {
      if (isNaN(amount) || !isFinite(amount)) {
        throw new Error('Amount must be a valid finite number');
      }
      // String() gives the shortest decimal that round-trips to this number:
      // 1.005 -> "1.005", 19.99 * 3 -> "59.97000000000001".
      text = String(amount);
    } else {
      text = String(amount).trim();
    }

    const match = /^(-?)(\d*)(?:\.(\d+))?$/.exec(text);
    if (!match || (match[2] === '' && match[3] === undefined)) {
      throw new Error(
        `Invalid amount format: "${amount}". Amount must contain only numeric characters (e.g., "220" or "220.50")`
      );
    }

    const [, sign, integerDigits, fractionDigits = ''] = match;

    // Whole cents as a BigInt, so very long inputs stay exact.
    let cents = BigInt((integerDigits || '0') + fractionDigits.slice(0, 2).padEnd(2, '0'));
    if (fractionDigits.length > 2 && fractionDigits.charCodeAt(2) >= 0x35 /* '5' */) {
      cents += 1n; // half-up (away from zero)
    }

    const whole = (cents / 100n).toString();
    const fraction = (cents % 100n).toString().padStart(2, '0');
    const negative = sign === '-' && cents !== 0n;
    return `${negative ? '-' : ''}${whole}.${fraction}`;
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

