import { isSupportedLanguage } from "@constants";
import { isSupportedCurrency, isMoroccanDirham } from "@constants/currencies";
import { PaymentRequest } from "@types";
import { Validator } from "@validators";

export class PaymentValidator extends Validator {
  static validate(request: PaymentRequest): void {
    // Check for duplicate/conflicting field names (case-insensitive)
    this.checkDuplicateFields(request);

    // Validate amount exists and is a valid number
    if (request.amount === undefined || request.amount === null) {
      throw new Error("Amount is required");
    }

    // Check if amount is a valid number (handles string amounts like "20a")
    const numericAmount = typeof request.amount === 'string'
      ? parseFloat(request.amount)
      : request.amount;

    if (typeof request.amount === 'string' && !/^-?\d*\.?\d+$/.test(request.amount.trim())) {
      throw new Error(
        `Invalid amount format: "${request.amount}". Amount must contain only numeric characters.`
      );
    }

    if (isNaN(numericAmount) || !isFinite(numericAmount)) {
      throw new Error(`Invalid amount: "${request.amount}". Must be a valid number.`);
    }

    if (numericAmount < 1) {
      throw new Error("Amount must be greater than or equal to 1");
    }

    if (!request.okUrl || !this.isValidUrl(request.okUrl)) {
      throw new Error("Valid okUrl is required");
    }

    if (!request.failUrl || !this.isValidUrl(request.failUrl)) {
      throw new Error("Valid failUrl is required");
    }

    if (!this.hasHttpProtocol(request.okUrl)) {
      throw new Error("http/https protocol is required for okUrl");
    }

    if (!this.hasHttpProtocol(request.failUrl)) {
      throw new Error("http/https protocol is required for failUrl");
    }

    if (!request.email || !this.isValidEmail(request.email)) {
      throw new Error("Valid email is required");
    }

    if (!request.BillToName || request.BillToName.trim().length === 0) {
      throw new Error("BillToName is required");
    }

    if (this.hasSpecialCharacters(request.BillToName)) {
      throw new Error(
        "BillToName contains special characters or consecutive spaces which are not allowed"
      );
    }

    if (!request.currency || !isSupportedCurrency(request.currency)) {
      throw new Error(
        `Unsupported currency: ${request.currency}. Must be a valid currency code (e.g., "MAD") or numeric code (e.g., "504"). Check the supported currencies list.`
      );
    }


    // Currency must be MAD for CMI (using centralized function)
    const isMAD = isMoroccanDirham(request.currency);

    // Check if currency is MAD (either "MAD" or "504")
    if (!isMAD) {
      throw new Error(
        `CMI gateway only accepts MAD as the processing currency.\n` +
        `Use currency: "504" or "MAD".\n` +
        `For multi-currency display, use amountCur and symbolCur fields.\n` +
        `Example:\n` +
        `  amount: 100 (in MAD)\n` +
        `  currency: "504"\n` +
        `  amountCur: 10 (customer sees this)\n` +
        `  symbolCur: "840" (USD)`
      );
    }

    // Validate amountCur and symbolCur (must be together)
    const hasAmountCur = request.amountCur !== undefined && request.amountCur > 0;
    const hasSymbolCur = request.symbolCur !== undefined && request.symbolCur.trim().length > 0;

    if (hasAmountCur !== hasSymbolCur) {
      throw new Error(
        "amountCur and symbolCur must be provided together.\n" +
        "Either provide both (for foreign currency display) or neither (MAD only)."
      );
    }

    // If symbolCur provided, validate it's a supported currency (but not MAD)
    // If symbolCur provided, validate it's a supported currency (but not MAD)
    if (hasSymbolCur && request.symbolCur) {
      if (!isSupportedCurrency(request.symbolCur)) {
        throw new Error(`Invalid symbolCur: ${request.symbolCur}. Must be a valid currency code.`);
      }

      const displayCurrencyIsMAD = isMoroccanDirham(request.symbolCur);
      if (displayCurrencyIsMAD) {
        throw new Error(
          "symbolCur should not be MAD since the main currency is already MAD.\n" +
          "For MAD-only payments, omit amountCur and symbolCur fields."
        );
      }
    }

    if (request.lang)
      if (!isSupportedLanguage(request.lang)) {
        throw new Error(
          `Unsupported language: ${request.lang}. Check the supported languages list.`
        );
      }

    if (request.phone) {
      throw new Error("The 'phone' field is not supported by the CMI package. Use 'tel' instead.");
    }

    if (request.tel) {
      if (
        !this.isPhoneNumber(request.tel) ||
        request.tel.trim().length === 0
      ) {
        throw new Error("Invalid phone number format");
      }
    }

    // Validate oid if provided - must be non-empty
    if (request.oid !== undefined) {
      if (typeof request.oid !== 'string' || request.oid.trim().length === 0) {
        throw new Error("oid must be a non-empty string when provided");
      }
    }

    // Validate rnd if provided - must be non-empty
    if (request.rnd !== undefined) {
      if (typeof request.rnd !== 'string' || request.rnd.trim().length === 0) {
        throw new Error("rnd must be a non-empty string when provided");
      }
    }

    // Validate hashAlgorithm if provided (including empty string check)
    // If user explicitly provides this field, it must be valid
    if (request.hashAlgorithm !== undefined) {
      if (typeof request.hashAlgorithm !== 'string' || request.hashAlgorithm.trim().length === 0) {
        throw new Error("hashAlgorithm cannot be empty when provided. Use 'ver3' or omit the field for default.");
      }
      if (request.hashAlgorithm !== "ver3") {
        throw new Error("hashAlgorithm must be 'ver3'");
      }
    }

    // Validate encoding if provided (including empty string check)
    // If user explicitly provides this field, it must be valid
    if (request.encoding !== undefined) {
      if (typeof request.encoding !== 'string' || request.encoding.trim().length === 0) {
        throw new Error("encoding cannot be empty when provided. Use 'UTF-8' or omit the field for default.");
      }
      if (request.encoding !== "UTF-8") {
        throw new Error("encoding must be 'UTF-8'");
      }
    }

    // Validate AutoRedirect if provided - must be boolean true or false
    if (request.AutoRedirect !== undefined) {
      if (typeof request.AutoRedirect !== "boolean") {
        throw new Error("AutoRedirect must be a boolean (true or false)");
      }
    }



    // Validate other billing fields if provided
    const billingFields: Array<{ key: keyof PaymentRequest; label: string }> = [
      { key: "BillToCompany", label: "BillToCompany" },
      { key: "BillToStreet1", label: "BillToStreet1" },
      { key: "BillToStreet2", label: "BillToStreet2" },
      { key: "BillToStreet3", label: "BillToStreet3" },
      { key: "BillToCity", label: "BillToCity" },
      { key: "BillToStateProv", label: "BillToStateProv" },
      { key: "BillToPostalCode", label: "BillToPostalCode" },
      { key: "BillToCountry", label: "BillToCountry" },
    ];

    for (const field of billingFields) {
      const value = request[field.key] as unknown as string | undefined;
      if (value !== undefined && value !== null) {
        if (typeof value !== "string" || value.trim().length === 0) {
          throw new Error(`${field.label} must be a non-empty string`);
        }
        if (this.hasSpecialCharacters(value)) {
          throw new Error(
            `${field.label} contains special characters or consecutive spaces which are not allowed`
          );
        }
      }
    }
  }

  /**
   * Check for duplicate/conflicting field names (case-insensitive)
   * 
   * Since JS objects normalize keys, this mainly catches case-insensitive duplicates
   * that might exist as distinct keys (e.g. "BillToName" and "billtoname")
   */
  private static checkDuplicateFields(request: PaymentRequest): void {
    const keys = Object.keys(request);
    const lowerCaseKeys = new Set<string>();
    const duplicates: string[] = [];

    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (lowerCaseKeys.has(lowerKey)) {
        duplicates.push(key);
      } else {
        lowerCaseKeys.add(lowerKey);
      }
    }

    if (duplicates.length > 0) {
      throw new Error(
        `Duplicate fields detected (case-insensitive): ${duplicates.join(', ')}. ` +
        `Ensure each field is provided only once.`
      );
    }
  }
}
