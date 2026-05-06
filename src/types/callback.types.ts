export interface CallbackResult {
  success: boolean;
  status: "ACTION=POSTAUTH" | "APPROVED" | "FAILURE";
  message: string;
  orderData?: {
    // Core fields (always present)
    orderId: string | undefined;
    amount: number;
    currency: string;
    transactionId: string;

    // Return code & response (always present)
    returnCode?: string;
    response?: string;

    // 3D-Secure status
    mdStatus?: string;

    // Error info (failure case)
    errorMessage?: string;

    // Authorization (success case)
    authCode?: string;

    // Cardholder info (success case)
    cardholderName?: string;
    maskedCardNumber?: string;
    transactionDate?: string;
  };
  errorCode?: string;
  errorMessage?: string;
}
