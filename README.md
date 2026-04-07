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

# Using yarn
yarn add cmi-node
```

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

## 🧪 Development

```bash
# Install dependencies
npm install

# Build the project (CJS, ESM, Types)
npm run build

# Run tests
npm test

# Linting
npm run lint
```

---

## 📄 License

MIT © [Ishak Zail](mailto:ishak.zail.iz@gmail.com)
