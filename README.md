# cmi-node ( NodeJS Package)

[![npm version](https://img.shields.io/npm/v/cmi-node.svg)](https://www.npmjs.com/package/cmi-node)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Framework-agnostic CMI Payment Gateway SDK with built-in security for Node.js.**

The `cmi-node` package provides a seamless way to integrate the Centre Monétique Interbancaire (CMI) payment gateway into any Node.js application. It handles parameter building, hash generation, form generation, and callback verification with a focus on security and developer experience.

---

## 🚀 Features

- **Framework Agnostic**: Works with Express, NestJS, Next.js, Fastify, Hono, Koa, and more.
- **Type Safe**: Fully written in TypeScript with comprehensive type definitions.
- **Secure by Design**: Built-in hash verification (SHA-512) and timing-safe comparisons.
- **Flexible Callbacks**: Support for both 'auto' and 'manual' confirmation modes.
- **Middleware Helpers**: Pre-built helpers for popular frameworks to get you started in minutes.
- **No External Runtime Dependencies**: Uses only Node.js built-ins (`crypto`, `buffer`). Requires Node.js ≥ 18.

---

## 📦 Installation

```bash
# Using npm
npm install cmi-node

# Using yarn (Classic or Berry)
yarn add cmi-node
```

> **Yarn Berry / PnP:** This package has zero runtime dependencies and correct `exports` maps, so it works out of the box with Yarn Berry's Plug'n'Play resolution. No special configuration is needed.

### Subpath Imports (Recommended)

For optimal bundle size, import framework adapters from their dedicated subpath:

```typescript
// Core — always available
import { CMIPaymentGateway } from 'cmi-node';

// Framework adapters — import only what you need
import { createExpressMiddleware } from 'cmi-node/express';
import { handleNextJsCallback } from 'cmi-node/nextjs';
import { createFastifyHandler } from 'cmi-node/fastify';
import { createHonoHandler } from 'cmi-node/hono';
import { NestJSCallbackHandler } from 'cmi-node/nestjs';
```

> **Note:** All adapters are also re-exported from the main `'cmi-node'` entry for convenience, but using subpath imports avoids loading adapters you don't need.

---

## 🛠️ Configuration

```typescript
import { CMIPaymentGateway } from 'cmi-node';

const gateway = new CMIPaymentGateway({
  storeKey: process.env.CMI_STORE_KEY!,    // Your CMI Store Key
  clientId: process.env.CMI_CLIENT_ID!,    // Your CMI Client ID
  gatewayUrl: 'https://testpayment.cmi.co.ma/fim/est3Dgate', // Gateway URL
  storetype: '3d_pay_hosting',
  trantype: 'PreAuth',
  callbackUrl: 'https://api.yoursite.com/payment/callback',
  confirmationMode: 'auto' // Optional: 'auto' | 'manual' (default: 'manual')
});
```

---

## 💻 Framework Examples

### 1. Express.js

```typescript
import express from 'express';
import { CMIPaymentGateway, createExpressMiddleware } from 'cmi-node';

const app = express();
app.use(express.urlencoded({ extended: true }));

const gateway = new CMIPaymentGateway(config);

// Initiate Payment
app.get('/pay', (req, res) => {
  const params = gateway.createPaymentParams({
    amount: 100.50,
    BillToName: 'John Doe',
    email: 'john@example.com',
    okUrl: 'https://yoursite.com/success',
    failUrl: 'https://yoursite.com/failure',
    shopUrl: 'https://yoursite.com',   // required
    currency: '504',                   // required — MAD numeric code
  });
  
  const form = gateway.generatePaymentForm(params);
  res.send(form);
});

// Handle Callback
app.post('/payment/callback', createExpressMiddleware(gateway, {
  onSuccess: async (result) => {
    console.log('Payment Successful:', result.orderData);
  },
  onFailure: (result) => {
    console.error('Payment Failed:', result.message);
  }
}));
```

### 2. NestJS

```typescript
// payment.controller.ts
import { Controller, Post, Body, Res } from '@nestjs/common';
import { CMIPaymentGateway, NestJSCallbackHandler } from 'cmi-node';

@Controller('payment')
export class PaymentController {
  private callbackHandler: NestJSCallbackHandler;

  constructor() {
    const gateway = new CMIPaymentGateway(config);
    this.callbackHandler = new NestJSCallbackHandler(gateway, {
      onSuccess: async (result) => {
        // Handle success
      }
    });
  }

  @Post('callback')
  async handleCallback(@Body() body: any, @Res() res: any) {
    return this.callbackHandler.handle(body, res);
  }
}
```

### 3. Next.js (App Router)

```typescript
// app/api/payment/callback/route.ts
import { NextRequest } from 'next/server';
import { CMIPaymentGateway, handleNextJsCallback } from 'cmi-node';

const gateway = new CMIPaymentGateway(config);

export async function POST(request: NextRequest) {
  return handleNextJsCallback(gateway, request, {
    onSuccess: async (result) => {
      console.log('Order verified:', result.orderData.orderId);
    }
  });
}
```

### 4. Fastify

```typescript
import { createFastifyHandler } from 'cmi-node';

fastify.post('/cmi/callback', createFastifyHandler(gateway, {
  onSuccess: async (result) => {
    // Process payment
  }
}));
```

### 5. Hono

```typescript
import { createHonoHandler } from 'cmi-node';

app.post('/cmi/callback', createHonoHandler(gateway, {
  onSuccess: async (result) => {
    // Process payment
  }
}));
```

### 6. Koa

```typescript
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { CMIPaymentGateway } from 'cmi-node';

const app = new Koa();
app.use(bodyParser());

const gateway = new CMIPaymentGateway(config);

app.use(async (ctx) => {
  if (ctx.method === 'POST' && ctx.path === '/payment/callback') {
    const result = gateway.verifyCallback(ctx.request.body);

    if (result.success) {
      await updateOrder(result.orderData.orderId, 'paid');
      ctx.status = 200;
      ctx.body = result.status; // 'ACTION=POSTAUTH' or 'APPROVED'
    } else {
      ctx.status = 200;
      ctx.body = 'FAILURE';
    }
  }
});
```

---

## 📖 API Reference

### `CMIPaymentGateway`

The main class for interacting with the CMI payment gateway.

#### Constructor

```typescript
new CMIPaymentGateway(config: PaymentConfig, options?: CMIPaymentGatewayOptions)
```

#### `PaymentConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `storeKey` | `string` | ✅ | Secret key provided by CMI for hash generation |
| `clientId` | `string` | ✅ | Numeric Client ID provided by CMI |
| `gatewayUrl` | `string` | ✅ | CMI gateway URL (must use `http://` or `https://`) |
| `storetype` | `string` | ✅ | Store type (`3d_pay_hosting`, `3d`, `pay_hosting`, etc.) |
| `trantype` | `string` | ✅ | Transaction type (case-insensitive: `preauth`, `auth`, `postauth`, `void`, `credit`) |
| `accountType` | `string` | ❌ | Account type: `'inshore'` (default) or `'offshore'`. See [Account Types](#-account-types) below. |
| `callbackUrl` | `string` | ❌ | Callback URL for payment notifications |

#### `CMIPaymentGatewayOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `app` | `Express` | — | Express app for auto-registration of callback endpoint |
| `callbackPath` | `string` | `'/api/payment/callback'` | Custom callback endpoint path |
| `callbackConfig` | `object` | — | Callback handler configuration (see below) |
| `callbackConfig.onSuccess` | `(result) => void` | — | Called when payment is verified successfully |
| `callbackConfig.onFailure` | `(result) => void` | — | Called when payment verification fails |
| `callbackConfig.autoRespond` | `boolean` | `true` | Automatically send response to CMI |
| `callbackConfig.supportGetMethod` | `boolean` | `false` | Support GET method for callbacks ⚠️ |

> ⚠️ **Security Warning:** Enabling `supportGetMethod` causes callback parameters (including `HASH` and payment data) to be read from query strings. Query strings are logged in server access logs, browser history, proxy caches, and CDN logs. Only enable this if your gateway requires it, and ensure your infrastructure does not log query parameters.

---

### `gateway.createPaymentParams(request)`

Creates payment parameters for initiating a payment.

#### `PaymentRequest`

| Field | Type | Required | Max Length | Description |
|---|---|---|---|---|
| `amount` | `number \| string` | ✅ | — | Payment amount (≥ 1, formatted to 2 decimal places) |
| `email` | `string` | ✅ | 64 | Customer email address |
| `BillToName` | `string` | ✅ | 255 | Customer billing name (alphanumeric + spaces) |
| `okUrl` | `string` | ✅ | — | Redirect URL on success (must use `http(s)://`) |
| `failUrl` | `string` | ✅ | — | Redirect URL on failure (must use `http(s)://`) |
| `shopUrl` | `string` | ✅ | — | Your shop URL (must use `http(s)://`) |
| `currency` | `string` | ✅ | — | Currency code or numeric. Inshore: must be `"504"` or `"MAD"`. Offshore: any supported currency. |
| `oid` | `string` | ❌ | 64 | Order ID (auto-generated if omitted) |
| `rnd` | `string` | ❌ | 20 | Random value (auto-generated if omitted, must be alphabetic) |
| `lang` | `string` | ❌ | — | Language code: `"fr"`, `"en"`, `"ar"`, etc. (default: `"fr"`) |
| `tel` | `string` | ❌ | 32 | Customer phone number |
| `description` | `string` | ❌ | 125 | Payment description |
| `AutoRedirect` | `boolean` | ❌ | — | Auto-redirect after payment (default: `false`) |
| `hashAlgorithm` | `string` | ❌ | — | Must be `"ver3"` if provided |
| `encoding` | `string` | ❌ | — | Must be `"UTF-8"` if provided |
| `amountCur` | `number` | ❌ | — | Display amount in foreign currency (requires `symbolCur`) |
| `symbolCur` | `string` | ❌ | — | Foreign currency code, e.g. `"840"` for USD (requires `amountCur`) |
| `BillToCompany` | `string` | ❌ | 255 | Billing company name |
| `BillToStreet1` | `string` | ❌ | 255 | Billing street address line 1 |
| `BillToStreet2` | `string` | ❌ | 255 | Billing street address line 2 |
| `BillToStreet3` | `string` | ❌ | 255 | Billing street address line 3 |
| `BillToCity` | `string` | ❌ | 64 | Billing city |
| `BillToStateProv` | `string` | ❌ | 32 | Billing state/province |
| `BillToPostalCode` | `string` | ❌ | 32 | Billing postal code |
| `BillToCountry` | `string` | ❌ | 3 | Billing country code |

> **Note:** Custom fields not listed above will be passed through to the gateway. Field names are case-insensitive — `shopUrl`, `SHOPURL`, and `shopurl` all resolve to the same field.

---

### `gateway.generatePaymentForm(params)`

Generates an auto-submitting HTML form for payment submission.

```typescript
const form = gateway.generatePaymentForm(params);
// Returns HTML string with all params as hidden inputs
// Auto-submits via an inline <script> tag
// All values are HTML-escaped to prevent XSS
```

---

### `gateway.verifyCallback(callbackParams)`

Verifies a callback from the CMI gateway using timing-safe hash comparison.

#### `CallbackResult`

```typescript
interface CallbackResult {
  success: boolean;
  status: 'ACTION=POSTAUTH' | 'APPROVED' | 'FAILURE';
  message: string;
  orderData?: {
    orderId: string | undefined;
    amount: number;
    currency: string;
    transactionId: string;
  };
  errorCode?: string;
  errorMessage?: string;
}
```

---

### `gateway.getConfirmationMode()`

Returns the current confirmation mode (`'auto'` or `'manual'`).

### `gateway.getConfig()`

Returns the gateway configuration **without** the `storeKey` (sanitized for safety).

---

## 📋 Logger Configuration

The SDK includes an environment-aware logger. In production (`NODE_ENV=production`), only errors are logged. In development, all levels are shown.

```typescript
import { configureLogger, resetLogger } from 'cmi-node';

// Set log level
configureLogger({ level: 'error' }); // 'debug' | 'info' | 'warn' | 'error'

// Disable all logging
configureLogger({ enabled: false });

// Customize prefix
configureLogger({ prefix: '[MyApp Payment]' });

// Reset to defaults
resetLogger();
```

---

## 🔒 Security

This SDK implements the **SHA-512** hashing algorithm required by CMI. 

- **Outgoing**: Parameters are automatically sorted and hashed before being sent to CMI.
- **Incoming**: Callbacks are verified by recalculating the hash from the received parameters and performing a **timing-safe comparison** to prevent timing attacks.

```typescript
// Manual verification if not using middleware
const result = gateway.verifyCallback(req.body);
if (result.success) {
  // Trust the data!
}
```

---

## 🛡️ Security Best Practices

### 1. Idempotency & Replay Protection
The CMI callback mechanism verifies that the data is authentic, but it does **not** prevent the same callback from being sent twice (replay attack). 
- **Consumer Responsibility**: In your `onSuccess` handler, you **must** check your database to see if the order has already been marked as paid.
- **Example**:
  ```typescript
  onSuccess: async (result) => {
    const order = await db.orders.find(result.orderData.orderId);
    if (order.status === 'paid') return; // Already processed
    await db.orders.update(order.id, { status: 'paid' });
  }
  ```

### 2. Content Security Policy (CSP)
If your application uses a strict CSP that blocks `'unsafe-inline'` scripts:
- **Use generateInputs()**: Instead of `generatePaymentForm()`, use `generateInputs()` to get the raw HTML inputs and render them into your own form with a custom, CSP-compliant submission script.
- **Use a Nonce**: Alternatively, pass a nonce to `generatePaymentForm()`:
  ```typescript
  const form = gateway.generatePaymentForm(params, { nonce: 'your-csp-nonce' });
  ```

### 3. Rate Limiting
Always implement rate limiting on your callback endpoint to prevent brute-force or Denial-of-Service (DoS) attacks.

---

## 🏦 Account Types

The SDK supports two account types that affect currency and multi-currency behavior:

| Account Type | Currency | `amountCur` / `symbolCur` | Description |
|---|---|---|---|
| `'inshore'` (default) | MAD only (`"504"` or `"MAD"`) | ✅ Allowed | Standard Moroccan merchant account. Use `amountCur`/`symbolCur` to display a foreign currency equivalent. |
| `'offshore'` | Any supported currency | ❌ Not allowed | Offshore merchant account that processes in a foreign currency directly. |

```typescript
// Inshore (default) — process in MAD, display in EUR
const inshoreGateway = new CMIPaymentGateway({
  ...config,
  // accountType: 'inshore' is the default
});

// Offshore — process directly in USD
const offshoreGateway = new CMIPaymentGateway({
  ...config,
  accountType: 'offshore',
});
```

---

## ❓ Troubleshooting

### Hash Mismatch on Callback

**Symptom:** `verifyCallback()` returns `{ success: false, message: 'Hash verification failed' }`

**Common causes:**
1. **Wrong `storeKey`** — Ensure you're using the exact key provided by CMI (test vs. production).
2. **Body parser not configured** — `req.body` must be parsed before reaching the callback handler:
   ```typescript
   // Express: add BEFORE callback route
   app.use(express.urlencoded({ extended: true }));
   ```
3. **Case-sensitive field names** — The SDK normalizes field casing automatically, but if you're manually constructing params, be consistent.

### "Amount must be greater than or equal to 1"

The CMI gateway requires `amount >= 1`. For sub-unit pricing, multiply to reach the minimum.

### "Inshore accounts only accept MAD"

For **inshore** accounts (default), the `currency` field must be `"504"` (numeric) or `"MAD"`. For foreign currency display, use `amountCur` and `symbolCur`:
```typescript
gateway.createPaymentParams({
  amount: 100,            // Amount in MAD
  currency: '504',        // Always MAD for inshore
  amountCur: 10,          // Display amount in foreign currency
  symbolCur: '840',       // Foreign currency (USD)
  // ...
});
```

For **offshore** accounts, you can use any supported currency directly:
```typescript
const gateway = new CMIPaymentGateway({ ...config, accountType: 'offshore' });
gateway.createPaymentParams({
  amount: 50,
  currency: 'USD',        // Any supported currency
  // amountCur/symbolCur are NOT allowed for offshore
  // ...
});
```

### Callback URL Not Reachable in Development

CMI sends callbacks to `callbackUrl` from their servers. `localhost` URLs won't work. Use a tunnel like [ngrok](https://ngrok.com/) for local development:
```bash
ngrok http 3000
# Use the https://*.ngrok.io URL as your callbackUrl
```

### "Unknown configuration field detected"

The SDK strictly validates configuration fields. Only these fields are accepted:
`storeKey`, `clientId`, `gatewayUrl`, `storetype`, `trantype`, `accountType`, `callbackUrl`, `confirmationMode`.

Check for typos or extra fields.

---

## 🧪 Development

```bash
# Install dependencies
npm install

# Build the project (CJS, ESM, Types)
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Linting
npm run lint

# Format code
npm run format
```

---

## 📄 License

MIT © [Ishak Zail](mailto:ishak.zail.iz@gmail.com)
