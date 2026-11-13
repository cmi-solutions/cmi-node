# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - planned as 2.1.0

### Changed
- The sources are organised in kits: the hosted payment page code is the **Standard kit**
  (`src/kits/standard`), and code used by every kit is in `src/shared`. ESLint rejects
  imports between kits. Nothing changes for users: every import path and every exported
  name and type is the same as in 2.0.0.

### Added
- `cmi-node/standard` and `cmi-node/standard/{express,nextjs,fastify,hono,nestjs}` import
  paths for the Standard kit. The existing paths (`cmi-node`, `cmi-node/express`, ...) keep
  working and give the same exports.

## [2.0.0] - 2026-11-13

### Breaking changes
- Requires Node.js 22.12 or newer (Node 18 and 20 are end of life).
- `gatewayUrl` and `callbackUrl` must use `https://`; plain `http://` is accepted only for
  `localhost`, `*.localhost`, `127.0.0.1` and `[::1]`.
- `clientId` must contain digits only.
- The logger defaults to `warn` outside production (it used to print `debug` and `info`).
- The Next.js (Pages and App Router) and Hono adapters no longer read callback parameters
  from the URL query string unless `supportGetMethod` is enabled, and then only for GET.
- Peer dependency ranges are now explicit: Express 4.17+/5, Fastify 4/5, Hono 4,
  Next.js 14–16, NestJS 10–12.
- Removed unused internal helpers: `sha512Base64`, `FormatterUtil.formatLanguage`,
  `normalizeAccountType`, `normalizeConfirmationMode`, `normalizeStoreType`,
  `normalizeTranType`, `BILLING_FIELDS`, `HASH_EXCLUDED_FIELDS`.
- An authentic callback for a declined payment returns `status: 'DECLINED'` with
  `verified: true` (it was `'FAILURE'`), and CMI is answered `APPROVED` as an
  acknowledgement, like CMI's reference `callback.php` (`declinedResponse` changes it).
  `'FAILURE'` now means a forged or invalid callback, or an order refused by
  `validateOrder`. `onFailure` still runs for both: check `result.verified`.
- A logger `sink` receives one string per call (prefix, level, time, message and error
  stack) instead of separate arguments. pino kept only the first argument, so the message
  and the error were lost.

### Added
- `gateway.generatePaymentInputs(params)` for custom forms under a strict CSP.
- `createNextJsAppRouterHandler(gateway, options)`, built once and reused per request.
- `CallbackHandler.evaluate()`, `notify()` and `errorResponse()` for custom adapters.
- `configureLogger({ sink })` to send log lines to your own logger; `LogSink` type.
- A one-time warning when a callback handler runs without `validateOrder`, in `auto` mode
  (payments are captured unchecked) and in `manual` mode (payments are approved and
  `onSuccess` runs for every replayed callback).
- `confirmationMode` in the exported `PaymentConfig` type (it was accepted but untyped, so
  `const config: PaymentConfig = { ..., confirmationMode: 'auto' }` did not compile).
- `SECURITY.md` and Dependabot configuration.
- Server-only guard: importing the SDK into browser code fails at once (a `browser`
  export condition resolves to a module that throws), and the constructor refuses to run
  where `window` and `document` exist. Cloudflare Workers (`workerd`, `worker`) keep the
  real build.
- A one-time warning when the storeKey is shorter than 16 characters.
- `PaymentParams` and `PaymentParamValue` types: `createPaymentParams()` now returns
  `PaymentParams` (known fields typed, custom fields still `any`, so existing code compiles).
- Regression guards: storeKey canary tests, `npm run check:pack` (tarball secret scan) in CI
  and before publishing, gitleaks in CI and as a pre-commit hook, and `no-console` in `src/`.

### Security
- The storeKey is held in ES private fields (`#storeKey`) in the gateway, the payment
  builder and the callback verifier. Before, TypeScript-only `private` properties made it
  readable at runtime with `(gateway as any).secureStoreKey.getValue()`.
- `SecretString.equals()` compares fixed-length digests, so it no longer returns early on
  a length mismatch.
- README: new "Handling your storeKey safely" section; JSDoc examples log the order id
  instead of the full callback data.
- A callback field sent twice (`oid=A&oid=B`) is now reported with the value that was
  verified. Express and Fastify parse a repeated field into an array: the hash used its
  last value (as PHP's `$_POST` does), but `orderData` reported the array and the first
  amount, so a payer could prepend another order's id and amount to their own signed
  callback and have them passed to `validateOrder` and `onSuccess`.
- README: every framework example now checks the order (exists, not already paid,
  amount) in `validateOrder`, which runs before CMI is answered, instead of in `onSuccess`.

### Fixed
- Bundlers kept the server-only guard out of browser builds: `"sideEffects": false` let
  esbuild drop the throwing `browser` stub, so `import { CMIPaymentGateway } from 'cmi-node'`
  in client code became `undefined` instead of throwing. `sideEffects` now lists the stub.
- `gateway.getConfig()` returns a copy: changing the result no longer changes
  `getConfirmationMode()` while the callback verifier kept the old mode.
- The Hono adapter answered `500 FAILURE` to every form-encoded callback on Hono 4.0.0
  to 4.12.26: trying `json()` first consumed the request body. It now reads the body once.
  CI also runs the adapter tests on Hono 4.0.0.
- README: the Fastify example registers `@fastify/formbody` (without it CMI's callback got
  HTTP 415) and no longer registers the same route twice; the Next.js Pages Router
  example exports `gateway`; duplicated object keys removed from the Express and NestJS
  examples; the manual Express handler answers with `handler.getResponse()`.
- Amounts with more than 2 decimals are rounded half-up to the cent on their decimal
  digits, like CMI's gateway (`125.6578` → `125.66`, `125.3333` → `125.33`). The old
  `Number.toFixed(2)` rounding was wrong for some values (`1.005` → `"1.00"`, now `"1.01"`).
  The rounded value is the one posted to CMI and hashed.
- Fastify, Next.js Pages and NestJS adapters answer CMI before running `onSuccess` /
  `onFailure`, like the Express middleware, so slow callbacks cannot delay CMI's answer.
- A custom `HASH` field is ignored instead of being posted next to the SDK's hash.
- `__proto__` request keys are rejected, and inherited names such as `constructor` no
  longer map to schema fields.
- Adapter errors are logged and answered with the configured `failureResponse`.
- `autoRespond: false` without `next()` still runs `onSuccess` / `onFailure` and warns.
- `BillToName` is no longer echoed in error messages.

### Changed
- Toolchain: TypeScript 6.0, ESLint 10 (flat config), tsup 9, c8 12, commitlint 21.
- Tests are type-checked (`npm run type-check`), and CI enforces coverage
  (92% lines, 86% branches) on Node 22, 24 and 26.
- GitHub Actions are pinned to commit SHAs.
- Published source maps no longer embed the sources (`sourcesContent`), which roughly
  halves the package size. File and line mappings are kept.
- `generatePaymentForm()`, `generatePaymentInputs()`, `verifyCallback()` and
  `CallbackHandler.handle()` / `evaluate()` accept `unknown` values instead of `any`.

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
