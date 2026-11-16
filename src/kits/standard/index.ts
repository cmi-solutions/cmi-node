// =============================================================================
// STANDARD KIT — hosted payment page (HPP)
//
// The customer is sent to CMI's payment page with a signed form; CMI calls the
// shop back (callbackUrl) and returns the customer to okUrl / failUrl.
// Public entry point: `cmi-node/standard` (also re-exported by `cmi-node`).
// The framework adapters are also available one by one: `cmi-node/standard/express`, ...
// =============================================================================

// Gateway and callback handling
export { CMIPaymentGateway } from './CMIPaymentGateway';
export { CallbackHandler } from './callback/CallbackHandler';

// Types
export type {
  PaymentConfig,
  PaymentRequest,
  PaymentParams,
  PaymentParamValue,
  CallbackResult,
  CallbackHandlerOptions,
  ConfirmationMode,
  CallbackMiddleware,
  CMIPaymentGatewayOptions,
} from './types';

// Configuration values (no security-related exports)
export {
  SUPPORTED_CURRENCIES,
  SUPPORTED_LANGUAGES,
  SUPPORTED_STORE_TYPES,
  SUPPORTED_TRAN_TYPES,
  SUPPORTED_CONFIRMATION_MODES,
} from './constants';

// Logger (shared by every kit)
export { logger, configureLogger, resetLogger } from '@shared/logger';
export type { LogLevel, LoggerConfig, LogSink } from '@shared/logger';

// Framework adapters
export { createExpressMiddleware, createCallbackHandler } from './adapters';
export { createNextJsHandler, createNextJsAppRouterHandler, handleNextJsCallback } from './adapters';
export { createFastifyHandler, registerFastifyCallback } from './adapters';
export { createHonoHandler, registerHonoCallback } from './adapters';
export { NestJSCallbackHandler, createNestJSHandler } from './adapters';

// =============================================================================
// INTERNAL — not exported, to prevent misuse:
// - CallbackVerifier, PaymentBuilder, FormGenerator: hash verification, signed
//   parameters and form generation (use CMIPaymentGateway instead)
// - HashUtil, timingSafeCompare: crypto helpers
// - ConfigValidator, PaymentValidator: validation logic
// - field definitions (PHP_CLEANED_BILLING_FIELDS, ...)
// =============================================================================
