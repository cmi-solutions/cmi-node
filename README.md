# cmi-node

[![npm version](https://img.shields.io/npm/v/cmi-node.svg)](https://www.npmjs.com/package/cmi-node)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Node.js SDK for the CMI payment gateway (Centre Monétique Interbancaire, Morocco).**
It signs payment requests, verifies CMI's callbacks and calls CMI's back-office API, with
framework adapters for Express, NestJS, Next.js, Fastify and Hono.

- **Two kits, one package**: the **Standard kit** sends the customer to CMI's payment page; the **API kit** captures, refunds, voids and checks orders from your server. A **Tokenization kit** is coming.
- **Secure by default**: SHA-512 (`ver3`) hashes, timing-safe verification, secrets kept in private fields and never logged, https-only URLs, server-only (importing it in browser code throws).
- **No runtime dependencies**, TypeScript types included, ESM and CommonJS. Requires **Node.js 22.12+**.

---

## Contents

- [Installation](#installation)
- [Kits](#kits)
- [Standard kit: payment page](#standard-kit-payment-page)
- [API kit: capture, refund, void, order status](#api-kit-capture-refund-void-order-status)
- [Logger](#logger)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Upgrading from 1.x](#upgrading-from-1x)
- [Development](#development)

---

## Installation

```bash
npm install cmi-node
# or
yarn add cmi-node
```

| | |
|---|---|
| Node.js | 22.12 or newer (22, 24 and 26 are tested) |
| Where it runs | Server code only: API routes, route handlers, server actions, controllers |
| Edge runtimes | Cloudflare Workers need the `nodejs_compat` flag. Vercel, Bun and Deno work as they are |
| TypeScript | Types included, also with `moduleResolution: "node"` (common in NestJS projects) |
| Frameworks (optional peers) | Express 4.17+ / 5, Fastify 4 / 5, Hono 4, Next.js 14–16, NestJS 10–12 |
| Yarn Berry / PnP | Works as is (no dependencies, complete `exports` map) |

## Kits

| Kit | What it does | Import from |
|---|---|---|
| **Standard kit** | Redirects the customer to CMI's payment page with a signed form, then verifies CMI's callback | `cmi-node/standard` |
| **API kit** | Back-office operations through CMI's XML API: capture, refund, void, order status and history | `cmi-node/api` |
| **Tokenization kit** | Payments with a registered card | coming soon |

`cmi-node` re-exports every kit, so `import { CMIPaymentGateway, CMIApiClient } from 'cmi-node'` works too.
Framework adapters have their own paths, so you load only the one you use:
`cmi-node/standard/express`, `/nextjs`, `/fastify`, `/hono`, `/nestjs` (the short forms `cmi-node/express`, `cmi-node/nextjs`, … are the same files).

---

## Standard kit: payment page

### How a payment works

1. Your server builds the signed payment parameters: `gateway.createPaymentParams(...)`.
2. It answers the browser with an auto-submitting form: `gateway.generatePaymentForm(params)`.
3. The customer pays on CMI's page (3D Secure included).
4. CMI posts the result to your **`callbackUrl`**, server to server. The SDK checks the `HASH`, runs your `validateOrder`, and answers CMI (`ACTION=POSTAUTH`, `APPROVED` or `FAILURE`).
5. CMI sends the customer back to your `okUrl` or `failUrl`.

Without a `callbackUrl`, step 4 does not happen and payments must be confirmed in CMI's back office.

### Configuration

```ts
import { CMIPaymentGateway } from 'cmi-node/standard';

const gateway = new CMIPaymentGateway({
  storeKey: process.env.CMI_STORE_KEY!,          // secret: server only
  clientId: process.env.CMI_CLIENT_ID!,
  gatewayUrl: 'https://testpayment.cmi.co.ma/fim/est3Dgate',
  storetype: '3d_pay_hosting',
  trantype: 'PreAuth',
  callbackUrl: 'https://api.yoursite.com/cmi/callback',
  confirmationMode: 'auto',                      // 'auto' | 'manual' (default 'manual')
});
```

| Field | Required | Description |
|---|---|---|
| `storeKey` | ✅ | Secret key from CMI. Read it from a server-side environment variable |
| `clientId` | ✅ | Merchant ID from CMI (digits only) |
| `gatewayUrl` | ✅ | CMI gateway URL. `https://` only (plain `http://` only for localhost) |
| `storetype` | ✅ | `3d_pay_hosting`, `3d`, `pay_hosting`, … |
| `trantype` | ✅ | `PreAuth`, `Auth`, … (case-insensitive) |
| `callbackUrl` | | Where CMI posts the result. `https://` only. Without it, confirm payments in CMI's back office |
| `confirmationMode` | | `'auto'`: approved payments are captured (`ACTION=POSTAUTH`). `'manual'` (default): they stay pre-authorized (`APPROVED`); capture them later with the [API kit](#api-kit-capture-refund-void-order-status) or the back office |
| `accountType` | | `'inshore'` (default, MAD) or `'offshore'` (foreign processing currency) |

Unknown or duplicate fields are rejected, so a typo fails at startup.

### Express example

```ts
import express from 'express';
import { CMIPaymentGateway } from 'cmi-node/standard';
import { createExpressMiddleware } from 'cmi-node/standard/express';

const app = express();
app.use(express.urlencoded({ extended: true }));   // CMI posts form-encoded data: needed before the callback route

const gateway = new CMIPaymentGateway({ /* configuration above */ });

// 1. Start a payment
app.post('/pay', async (req, res) => {
  const order = await db.orders.create({ amount: 150 });
  const params = gateway.createPaymentParams({
    oid: order.id,
    amount: order.amount,
    currency: '504',                 // MAD
    BillToName: 'Ishak Zail',
    email: 'customer@example.com',
    okUrl: 'https://yoursite.com/payment/ok',
    failUrl: 'https://yoursite.com/payment/fail',
    shopUrl: 'https://yoursite.com',
    lang: 'fr',                      // 'fr' | 'en' | 'ar'
  });
  res.type('html').send(gateway.generatePaymentForm(params));
});

// 2. CMI's callback: the SDK verifies the HASH and answers CMI
app.post('/cmi/callback', createExpressMiddleware(gateway, {
  // Runs BEFORE CMI is answered. Return false to answer FAILURE (CMI does not capture).
  // This is your amount check and your replay protection.
  validateOrder: async (result) => {
    const order = await db.orders.findOne(result.orderData!.orderId);
    return !!order && order.status !== 'paid' && order.amount === result.orderData!.amount;
  },
  // Runs after CMI has been answered: record the payment
  onSuccess: async (result) => {
    await db.orders.markPaid(result.orderData!.orderId, result.orderData!.transactionId);
  },
  onFailure: (result) => {
    console.warn('Payment not approved:', result.orderData?.orderId, result.status);
  },
}));

app.listen(3000);
```

Need a custom answer? `createCallbackHandler(gateway, { autoRespond: false, ... })` gives you
`handler.handle(req.body)` and `handler.getResponse(result)` (`{ status, body }`) to send yourself.
You can also pass `{ app, callbackPath, callbackConfig }` as the constructor's second argument to register the Express route automatically.

### Other frameworks

Every adapter takes the same options as the Express middleware (`validateOrder`, `onSuccess`, `onFailure`, …).

```ts
// Next.js App Router: app/api/cmi/callback/route.ts
import { createNextJsAppRouterHandler } from 'cmi-node/standard/nextjs';
export const POST = createNextJsAppRouterHandler(gateway, { validateOrder, onSuccess });

// Next.js Pages Router: pages/api/cmi/callback.ts (the body is parsed by Next.js)
import { createNextJsHandler } from 'cmi-node/standard/nextjs';
export default createNextJsHandler(gateway, { validateOrder, onSuccess });

// Fastify: CMI's form-encoded body needs @fastify/formbody, or the callback gets HTTP 415
import formbody from '@fastify/formbody';
import { createFastifyHandler } from 'cmi-node/standard/fastify';
await fastify.register(formbody);
fastify.post('/cmi/callback', createFastifyHandler(gateway, { validateOrder, onSuccess }));
// or: registerFastifyCallback(fastify, gateway, { path: '/cmi/callback', ... })

// Hono (reads the body itself)
import { createHonoHandler } from 'cmi-node/standard/hono';
app.post('/cmi/callback', createHonoHandler(gateway, { validateOrder, onSuccess }));
// or: registerHonoCallback(app, gateway, { path: '/cmi/callback', ... })

// NestJS
import { NestJSCallbackHandler } from 'cmi-node/standard/nestjs';
const callback = new NestJSCallbackHandler(gateway, { validateOrder, onSuccess });

@Post('cmi/callback')
handle(@Body() body: Record<string, unknown>, @Res() res: Response) {
  return callback.handle(body, res);   // or callback.process(body) to get the result only
}
```

The payment route is the same everywhere: `createPaymentParams()` then return `generatePaymentForm(params)` as HTML.
Express, Fastify, Next.js Pages and NestJS answer CMI first, then run `onSuccess` / `onFailure`; Hono and the App Router run them before answering, so keep them fast there.

### Callback results

| Callback from CMI | `success` | `verified` | `status` | Answer sent to CMI |
|---|---|---|---|---|
| Authentic, approved (`ProcReturnCode` `00`) | `true` | `true` | `ACTION=POSTAUTH` (auto) or `APPROVED` (manual) | same as `status` |
| Authentic, declined | `false` | `true` | `DECLINED` | `APPROVED` (an acknowledgement, as in CMI's `callback.php`) |
| Approved, but your `validateOrder` refused it | `false` | `true` | `FAILURE` | `FAILURE` (CMI does not capture) |
| Missing or wrong `HASH` (forged or altered) | `false` | `false` | `FAILURE` | `FAILURE` |

`onFailure` runs for the last three rows: check `result.verified` to tell a real decline from a forged callback.
`result.orderData` holds `orderId`, `amount`, `currency`, `transactionId`, `returnCode`, `response`, `errorMessage`, `authCode`, `maskedPan`, `cardBrand` and more. It contains card and customer data: log the order id, not the whole object.

To verify a callback without an adapter: `gateway.verifyCallback(params)` returns the same result.

**Handler options**

| Option | Default | Description |
|---|---|---|
| `validateOrder` | — | Runs before CMI is answered, for authentic approved payments. Return `false` (or throw) to answer `FAILURE`. Check the order exists, is not already paid and has this amount. The SDK warns once when it is missing |
| `onSuccess` / `onFailure` | — | Your code for approved / other callbacks |
| `autoRespond` | `true` | Send CMI's answer automatically |
| `successResponse` / `failureResponse` / `declinedResponse` | `ACTION=POSTAUTH` or `APPROVED` / `FAILURE` / `APPROVED` | Override an answer |
| `supportGetMethod` | `false` | Also read GET query strings. ⚠️ Query strings end up in access logs and caches: enable only if CMI requires it |

### Payment request fields

| Field | Required | Notes |
|---|---|---|
| `amount` | ✅ | At least 1. More than 2 decimals are rounded half-up to the cent, as CMI does (`125.6578` → `125.66`) |
| `currency` | ✅ | `"504"` or `"MAD"` |
| `BillToName` | ✅ | Up to 255 characters |
| `email` | ✅ | Up to 64 characters |
| `okUrl`, `failUrl`, `shopUrl` | ✅ | Where CMI sends the customer back |
| `oid` | | Your order ID, up to 64 characters (generated if omitted) |
| `lang` | | `fr` (default), `en`, `ar` |
| `tel`, `description` | | Up to 32 and 125 characters |
| `rnd` | | Random value, up to 20 characters (generated if omitted) |
| `AutoRedirect`, `redirectGet`, `sessiontimeout`, `CallbackResponse` | | Redirect without the receipt page, return with GET instead of POST, page timeout in seconds (30–2700, default 1800), turn the callback off for this payment |
| `amountCur` + `symbolCur` | | Show the amount in another currency (inshore only), e.g. `symbolCur: "840"` |
| `BillToCompany`, `BillToStreet1..3`, `BillToCity`, `BillToStateProv`, `BillToPostalCode`, `BillToCountry`, `BillToTelVoice` | | Billing address |
| `id1`, `itemnumber1`, `productcode1`, `qty1`, `desc1`, `price1`, `total1`, … | | Order lines (numbered) |

Other fields are passed to CMI as they are, and field names are case-insensitive. Like CMI's PHP script, the SDK removes accents and other characters from `BillToName`, `BillToCompany`, `BillToStreet1`, `BillToCity`, `BillToStateProv`, `BillToPostalCode` and `BillToCountry` (`Zoé` → `Zoe`; Arabic letters are dropped), so a `BillToName` written only in Arabic is refused.

**Strict CSP?** `generatePaymentForm(params, { nonce })` adds your nonce to its inline style and script, or build your own form from `gateway.generatePaymentInputs(params)` (escaped hidden inputs).

---

## API kit: capture, refund, void, order status

`CMIApiClient` calls CMI's XML API from your server, after the payment page:

| Method | CMI operation | Use it to |
|---|---|---|
| `postAuth({ orderId, amount? })` | PostAuth | Capture a pre-authorized order, fully or partly |
| `refund({ orderId, amount?, currency? })` | Credit | Refund a captured order: fully (no amount) or partly (several partial refunds allowed) |
| `void({ orderId })` | Void | Cancel a pre-authorization, capture, sale or refund |
| `orderStatus(orderId)` | ORDERSTATUS | Check an order, e.g. when CMI's callback never arrived |
| `orderHistory(orderId)` | ORDERHISTORY | List every transaction of an order |

It uses an **API user** (name and password created for API access in CMI's back office) and the API URL, both given by CMI, not the `storeKey`.

```ts
import { CMIApiClient, CMIApiError } from 'cmi-node/api';

const api = new CMIApiClient({
  apiUrl: process.env.CMI_API_URL!,          // https:// only (http for localhost)
  clientId: process.env.CMI_CLIENT_ID!,
  username: process.env.CMI_API_USER!,
  password: process.env.CMI_API_PASSWORD!,   // secret: server only
  timeoutMs: 30_000,                         // optional, for the whole call
});

// confirmationMode 'manual' leaves payments pre-authorized: capture when you ship
const capture = await api.postAuth({ orderId: 'ORDER-123' });
if (!capture.approved) console.warn('Capture refused:', capture.procReturnCode, capture.message);

await api.refund({ orderId: 'ORDER-123', amount: 50 });   // partial refund (currency defaults to MAD)
await api.refund({ orderId: 'ORDER-124' });               // full refund

const status = await api.orderStatus('ORDER-123');
if (status.found && status.transaction?.shipmentPossible) {
  // captured or settled: safe to ship
}
```

**Results.** A refused operation is a result, not an exception: `approved` is `false`, and `response` (`Declined` / `Error`), `procReturnCode` (`00` approved, `99` gateway error, other values are bank codes), `message` and `errorCode` say why. `fields` and `extra` hold CMI's whole answer.

**Order statuses.** `orderStatus()` returns the order's last successful transaction (or its last failed one), with amounts converted from cents. `orderHistory()` returns the same details for every transaction.

| `status` | CMI code | Can ship? | `transient` (query again later) |
|---|---|---|---|
| `preauthorized` | A | no | no |
| `captured` / `settled` | C / S | **yes** | no |
| `refunded` | C or S on a refund line | no | no |
| `voided` / `declined` | V / D | no | no |
| `pending` | PN | no | **yes**, for up to 72 h |
| `reversal_required` | R | no | **yes**, until end of day |
| `processing` | NW | no | **yes**, CMI suggests every 5 min |
| `error` / `cancelled` | ERR / CNCL | no | no (recurring orders) |

**Errors.** `CMIApiError` means no usable answer came back: `code` is `TIMEOUT`, `NETWORK`, `HTTP_STATUS` or `INVALID_RESPONSE`. The client never retries by itself. Wrong settings (an `http://` URL, a missing or too long value, a control character in the credentials, a currency without an amount) throw a plain `Error` before anything is sent.

> **After any `CMIApiError` on a capture, refund or void, check before retrying.** The request may have reached CMI even though the answer was lost. Call `orderStatus()` (or `orderHistory()` for refunds) first, or the money may move twice.

---

## Logger

Outside production the SDK logs warnings and errors; in production (`NODE_ENV=production`) only errors. It never logs secrets, the hash input or customer data.

```ts
import { configureLogger, resetLogger } from 'cmi-node';

configureLogger({ level: 'debug' });       // 'debug' | 'info' | 'warn' | 'error'
configureLogger({ enabled: false });       // silence it
configureLogger({ sink: pinoLogger });     // any object with debug/info/warn/error; each call gets one string
resetLogger();
```

---

## Security

- **Keep secrets on the server.** The `storeKey` signs every payment and callback: whoever has it can forge a "paid" callback. The API password can capture and refund. Read both from server-side environment variables (Vercel, Render, a `.env` in `.gitignore`…), never with a public prefix such as `NEXT_PUBLIC_` or `VITE_`. Importing `cmi-node` in browser code throws.
- **The SDK never outputs them.** They live in private fields, are masked in `toString()`, `JSON.stringify()` and `console.log()`, and are never logged. If a real key was ever committed, change it in CMI's back office.
- **Use a long random storeKey.** CMI's `ver3` hash is unsalted, so a short key can be guessed from one payment form. The SDK warns below 16 characters.
- **Callbacks are verified** with a timing-safe SHA-512 comparison. A valid callback can still be **replayed**: do the order, amount and "not already paid" checks in `validateOrder`, and make your update idempotent (`UPDATE orders SET status = 'paid' WHERE id = ? AND status <> 'paid'`).
- **API calls** use https only, refuse redirects (so credentials are never resent elsewhere) and reject answers over 1 MB; CMI's XML answers are read without entity expansion.
- **Rate-limit** your callback endpoint.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Hash verification failed` on callbacks | Use the exact storeKey of that CMI environment (test or production), and make sure the body is parsed before the callback route (`express.urlencoded`, `@fastify/formbody`) |
| CMI shows "3D-1004 Code de sécurité erroné" | The `storeKey` does not match the `clientId` (wrong key, or a key with extra characters) |
| The callback never reaches you in development | CMI cannot call `localhost`: use a tunnel such as `ngrok http 3000` and its https URL as `callbackUrl` |
| `Amount must be greater than or equal to 1` | CMI requires at least 1 (MAD) |
| `Unknown configuration field detected` | A typo or extra field in the gateway configuration: only the fields in the table above are accepted |
| API `TIMEOUT` / `NETWORK` on a capture or refund | Call `orderStatus()` before trying again |

---

## Upgrading from 1.x

Version 2 has breaking changes (full list in [CHANGELOG.md](./CHANGELOG.md)):

- Node.js **22.12** or newer.
- `gatewayUrl` and `callbackUrl` must use **https://** (http only for localhost); `clientId` must be digits only.
- Amounts with more than 2 decimals are **rounded half-up to the cent** (`1.005` → `1.01`).
- An authentic **declined** payment now has `status: 'DECLINED'` and `verified: true`, and CMI is answered `APPROVED`. `'FAILURE'` means a forged callback or one refused by `validateOrder`.
- The Next.js and Hono adapters read the URL query string only with `supportGetMethod`, and only for GET.
- The logger prints warnings and errors by default, and a `sink` receives one string per call.

From 2.0 to 2.1 nothing changes: every import path and export is the same, and the kit paths (`cmi-node/standard`, `cmi-node/api`) are new.

---

## Development

```bash
npm install
npm run build          # CJS, ESM and types
npm test               # unit and integration tests
npm run test:coverage  # CI requires 92% lines, 86% branches
npm run type-check
npm run lint
npm run check:pack     # no secrets or forbidden files in the npm tarball (after build)
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the project structure, the kit rules and the commit conventions, and [SECURITY.md](./SECURITY.md) to report a vulnerability.

## License

[MIT](./LICENSE)
