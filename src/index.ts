// =============================================================================
// PUBLIC API - Only these are accessible to developers using the package
// =============================================================================

// Core exports - ONLY high-level API
export {
  CMIPaymentGateway,
  CallbackHandler,
} from './core';

// Type exports
export type {
  PaymentConfig,
  PaymentRequest,
  CallbackResult,
  CallbackHandlerOptions,
  ConfirmationMode,
  CallbackMiddleware,
  CMIPaymentGatewayOptions
} from './types';

// Constant exports (configuration values only - no security-related exports)
export {
  SUPPORTED_CURRENCIES,
  SUPPORTED_LANGUAGES,
  SUPPORTED_STORE_TYPES,
  SUPPORTED_TRAN_TYPES,
  SUPPORTED_CONFIRMATION_MODES,
} from './constants';

// =============================================================================
// INTERNAL - The following are NOT exported to prevent misuse:
// - CallbackVerifier: Hash verification logic (internal only)
// - PaymentBuilder: Payment parameter building with hash (internal only)
// - FormGenerator: Form generation (internal only)
// - HashUtil: SHA-512 hash generation (internal only)  
// - timingSafeCompare: Crypto utilities (internal only)
// - ConfigValidator, PaymentValidator: Validation logic (internal only)
// - PHP_CLEANED_BILLING_FIELDS, etc.: Internal field definitions
// =============================================================================

// Logger exports
export { logger, configureLogger, resetLogger } from './logger';
export type { LogLevel, LoggerConfig, LogSink } from './logger';

// ============================================
// Framework-Specific Helpers
// ============================================

// Express
export {
  createExpressMiddleware,
  createCallbackHandler,
} from './middleware';

// Next.js (Pages Router & App Router)
export {
  createNextJsHandler,
  createNextJsAppRouterHandler,
  handleNextJsCallback
} from './middleware';

// Fastify
export {
  createFastifyHandler,
  registerFastifyCallback
} from './middleware';

// Hono (Edge/Cloudflare Workers/Bun)
export {
  createHonoHandler,
  registerHonoCallback
} from './middleware';

// NestJS
export {
  NestJSCallbackHandler,
  createNestJSHandler
} from './middleware';
