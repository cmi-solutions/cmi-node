export interface CallbackResult {
  /** True only for an authentic, approved payment (ProcReturnCode "00"). */
  success: boolean;
  /**
   * - `"ACTION=POSTAUTH"` / `"APPROVED"`: authentic, approved payment (depends on confirmationMode).
   * - `"DECLINED"`: authentic callback for a failed payment attempt. CMI is answered
   *   `"APPROVED"` (acknowledgement), as in CMI's reference callback.php.
   * - `"FAILURE"`: missing or invalid HASH, a technical error, or an order rejected by `validateOrder`.
   */
  status: "ACTION=POSTAUTH" | "APPROVED" | "DECLINED" | "FAILURE";
  /** True when the HASH matched, i.e. the data really comes from CMI. */
  verified: boolean;
  message: string;
  orderData?: {
    // ── Core fields (always present) ────────────────────────────────────
    orderId: string | undefined;
    amount: number;
    currency: string;
    /** Bank transaction ID. From TransId. Undefined when absent (e.g. on failure callbacks). */
    transactionId?: string;

    // ── Always present (success + failure) ──────────────────────────────
    /** Bank/gateway return code. '00' = success. From ProcReturnCode. */
    returnCode?: string;
    /** Human-readable response label, e.g. "Approved", "Error", "Declined". From Response. */
    response?: string;
    /** 3D-Secure authentication status. 1 = full 3D, 0 = failed. From mdStatus. */
    mdStatus?: string;
    /** Error description. From ErrMsg. */
    errorMessage?: string;
    /** Error code, e.g. "CORE-5110". From ErrCode. */
    errorCode?: string;
    /** Order ID echoed back by CMI for cross-checking. From ReturnOid. */
    returnOid?: string;
    /** Cardholder IP address. From ClientIp. */
    clientIp?: string;

    // ── Present on success ───────────────────────────────────────────────
    /** Bank authorisation code. From AuthCode. */
    authCode?: string;
    /** Transaction date/time formatted as ddmmyyyy hhmmss. From EXTRA.TRXDATE. */
    transactionDate?: string;
    /** Masked card number, e.g. "400000XXXXXX7190". From MaskedPan. */
    maskedPan?: string;
    /** Cardholder full name. From cardHolderName. */
    cardHolderName?: string;
    /** Payment method type, e.g. "CARD". From paymentType. */
    paymentType?: string;
    /** Card scheme, e.g. "VISA", "MASTERCARD". From EXTRA.CARDBRAND. */
    cardBrand?: string;
    /** Card-issuing bank name. From EXTRA.CARDISSUER. */
    cardIssuer?: string;
    /** Card expiry year. From EcomPaymentCardExpDateYear. */
    cardExpYear?: string;
    /** Card expiry month. From EcomPaymentCardExpDateMonth. */
    cardExpMonth?: string;
    /** Host reference number assigned by acquirer. From HostRefNum. */
    hostRefNum?: string;
    /** Acquirer STAN (System Trace Audit Number). From acqStan. */
    acqStan?: string;
    /** Electronic Commerce Indicator. From eci. */
    eci?: string;
    /** 3D archival status: Y / N / A. From txstatus. */
    txStatus?: string;
  };
  errorCode?: string;
  errorMessage?: string;
}
