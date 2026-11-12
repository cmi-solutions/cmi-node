/**
 * Adapter tests against real frameworks (no mocks): a signed CMI callback is posted as
 * application/x-www-form-urlencoded, exactly as CMI sends it, and the answer is checked.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import { Hono } from 'hono';
import { CMIPaymentGateway } from '../src/core/CMIPaymentGateway.js';
import { HashUtil } from '../src/utils/hash.util.js';
import { configureLogger } from '../src/logger/index.js';
import { createExpressMiddleware } from '../src/middleware/express.middleware.js';
import { createFastifyHandler } from '../src/middleware/fastify.helper.js';
import { createHonoHandler } from '../src/middleware/hono.helper.js';
import { handleNextJsCallback } from '../src/middleware/nextjs.helper.js';

configureLogger({ enabled: false });

const STORE_KEY = 'integration-test-store-key-0001';
const gateway = new CMIPaymentGateway({
    storeKey: STORE_KEY,
    clientId: '600000123',
    gatewayUrl: 'https://testpayment.cmi.co.ma/fim/est3Dgate',
    storetype: '3d_pay_hosting',
    trantype: 'PreAuth',
    callbackUrl: 'https://shop.example.ma/api/cmi/callback',
    confirmationMode: 'auto',
});

function signedCallback(extra: Record<string, string> = {}): Record<string, string> {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(gateway.createPaymentParams({
        amount: '120.3365', currency: '504', email: 'customer@example.com', BillToName: 'Zoé Lahlou',
        okUrl: 'https://shop.example.ma/ok', failUrl: 'https://shop.example.ma/fail', shopUrl: 'https://shop.example.ma',
        description: 'Commande n°42 – thé à la menthe',
    }))) params[k] = String(v);
    delete params.hash;
    delete params.encoding;
    Object.assign(params, { ProcReturnCode: '00', Response: 'Approved', TransId: 'TXN_INT', ...extra });
    params.HASH = HashUtil.generate(params, STORE_KEY);
    return params;
}

const form = (fields: Record<string, string>) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
});

/** The four answers every adapter must give. */
const cases: Array<[string, () => Record<string, string>, string]> = [
    ['approved payment', () => signedCallback(), 'ACTION=POSTAUTH'],
    ['authentic decline', () => signedCallback({ ProcReturnCode: '05', Response: 'Declined' }), 'APPROVED'],
    ['tampered amount', () => ({ ...signedCallback(), amount: '1.00' }), 'FAILURE'],
    ['unsigned callback', () => { const { HASH: _h, ...rest } = signedCallback(); return rest; }, 'FAILURE'],
];

describe('the signed payload survives real form parsing (UTF-8, accents, Arabic-free cleaning)', () => {
    it('amount is rounded and BillToName cleaned before signing', () => {
        const params = signedCallback();
        assert.equal(params.amount, '120.34');
        assert.equal(params.BillToName, 'Zoe Lahlou');
        assert.equal(params.description, 'Commande n°42 – thé à la menthe');
    });
});

describe('Express 5 (real server)', () => {
    let server: Server;
    let base = '';
    before(async () => {
        const app = express();
        app.use(express.urlencoded({ extended: false }));
        app.post('/cb', createExpressMiddleware(gateway));
        await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    after(() => new Promise<void>((resolve) => server.close(() => resolve())));

    for (const [name, body, expected] of cases) {
        it(`${name} -> ${expected}`, async () => {
            const res = await fetch(`${base}/cb`, form(body()));
            assert.equal(res.status, 200);
            assert.equal(await res.text(), expected);
        });
    }
});

describe('Fastify 5 with @fastify/formbody (real server)', () => {
    const app = Fastify();
    let base = '';
    before(async () => {
        await app.register(formbody);
        app.post('/cb', createFastifyHandler(gateway));
        base = await app.listen({ port: 0, host: '127.0.0.1' });
    });
    after(() => app.close());

    for (const [name, body, expected] of cases) {
        it(`${name} -> ${expected}`, async () => {
            const res = await fetch(`${base}/cb`, form(body()));
            assert.equal(res.status, 200);
            assert.equal(await res.text(), expected);
        });
    }
});

describe('Hono 4 (app.request, real Request objects)', () => {
    const app = new Hono();
    app.post('/cb', createHonoHandler(gateway));

    for (const [name, body, expected] of cases) {
        it(`${name} -> ${expected}`, async () => {
            const res = await app.request('/cb', form(body()));
            assert.equal(res.status, 200);
            assert.equal(await res.text(), expected);
        });
    }
});

describe('Next.js App Router helper (web-standard Request)', () => {
    for (const [name, body, expected] of cases) {
        it(`${name} -> ${expected}`, async () => {
            const res = await handleNextJsCallback(gateway, new Request('https://shop.example.ma/api/cmi/callback', form(body())));
            assert.equal(res.status, 200);
            assert.equal(await res.text(), expected);
        });
    }
});
