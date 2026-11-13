// =============================================================================
// cmi-node — PUBLIC API
//
// The SDK is organised in kits. Each kit has its own entry point, and this root
// entry re-exports all of them, so `import { ... } from 'cmi-node'` keeps working:
//
// - Standard kit (hosted payment page):  cmi-node/standard   (src/kits/standard)
// - API kit (back-office XML API):        coming in 2.1
// - Tokenization kit:                     coming soon
//
// Code used by several kits (logger, security, validation, amounts, currencies)
// lives in src/shared and is never imported from one kit into another.
// =============================================================================

export * from './kits/standard';
