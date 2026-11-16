// =============================================================================
// API KIT — CMI's back-office XML API (CC5)
//
// Capture (PostAuth), refund (Credit), void, order status and order history,
// called from the shop's server with a CMI API user (not the storeKey).
// Public entry point: `cmi-node/api` (also re-exported by `cmi-node`).
// =============================================================================

export { CMIApiClient } from './CMIApiClient';
// The error class and the transport live in src/shared/cc5 (the Tokenization kit will use them too).
export { CMIApiError } from '@shared/cc5';
export type { CMIApiErrorCode } from '@shared/cc5';
export type {
  CMIApiConfig,
  CMIApiResponse,
  CMITransactionResult,
  CMIOrderStatus,
  CMIOrderTransaction,
  CMIOrderStatusResult,
  CMIOrderHistoryEntry,
  CMIOrderHistoryResult,
  CMIPostAuthRequest,
  CMIRefundRequest,
  CMIVoidRequest,
} from './api.types';
