# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-06

### Added
- Framework-agnostic CMI Payment Gateway SDK for Node.js
- Core `CMIPaymentGateway` class with payment parameter building, form generation, and callback verification
- SHA-512 hash generation with timing-safe comparison for callback verification
- `SecretString` wrapper to prevent accidental exposure of store keys
- Framework helpers for Express, NestJS, Next.js (Pages & App Router), Fastify, and Hono
- `CallbackHandler` with configurable `onSuccess`/`onFailure` hooks
- Support for `auto` and `manual` confirmation modes
- Comprehensive input validation for config, payment requests, currencies, and billing fields
- Dual CJS/ESM package output with TypeScript declarations
- Configurable environment-aware logger
- HTML escaping in generated payment forms to prevent XSS
- Support for multi-currency display via `amountCur` and `symbolCur` fields
