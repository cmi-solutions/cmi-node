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

/**
 * A repeated field reaches the SDK as an array (Express, Fastify) or as its last value
 * (Hono, web Request). The hash uses the last value, like PHP's $_POST, so validateOrder
 * must see exactly that value: never the array, never the first value.
 */
describe('repeated callback fields: validateOrder sees the signed values', () => {
    const signed = signedCallback();
    // A payer replays their own signed callback with fields of another order in front.
    const prepended = `oid=ATTACKER-ORDER&amount=500.00&${new URLSearchParams(signed).toString()}`;
    // Fields appended after the signed ones are the ones hashed, so the hash fails.
    const appended = `${new URLSearchParams(signed).toString()}&oid=ATTACKER-ORDER&amount=500.00`;
    const post = (body: string) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });

    type Seen = { orderId: unknown; amount: unknown } | undefined;
    const recorder = () => {
        const state: { seen: Seen } = { seen: undefined };
        const options = {
            validateOrder: (result: { orderData?: { orderId?: unknown; amount?: unknown } }) => {
                state.seen = { orderId: result.orderData?.orderId, amount: result.orderData?.amount };
                return true;
            },
        };
        return { state, options };
    };

    const servers: Array<[string, (options: object) => Promise<{ url: string; close: () => Promise<void> }>]> = [
        ...[false, true].map((extended): [string, (options: object) => Promise<{ url: string; close: () => Promise<void> }>] => [
            `Express 5, urlencoded extended=${extended}`,
            async (options) => {
                const app = express();
                app.use(express.urlencoded({ extended }));
                app.post('/cb', createExpressMiddleware(gateway, options));
                const server: Server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
                return {
                    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/cb`,
                    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
                };
            },
        ]),
        ['Fastify 5 with @fastify/formbody', async (options) => {
            const app = Fastify();
            await app.register(formbody);
            app.post('/cb', createFastifyHandler(gateway, options));
            const base = await app.listen({ port: 0, host: '127.0.0.1' });
            return { url: `${base}/cb`, close: () => app.close() };
        }],
    ];

    for (const [name, start] of servers) {
        it(`${name}: prepended fields are ignored, the signed order is reported`, async () => {
            const { state, options } = recorder();
            const server = await start(options);
            try {
                const res = await fetch(server.url, post(prepended));
                assert.equal(await res.text(), 'ACTION=POSTAUTH');
                assert.deepEqual(state.seen, { orderId: signed.oid, amount: 120.34 });
            } finally {
                await server.close();
            }
        });

        it(`${name}: appended fields break the hash`, async () => {
            const { state, options } = recorder();
            const server = await start(options);
            try {
                const res = await fetch(server.url, post(appended));
                assert.equal(await res.text(), 'FAILURE');
                assert.equal(state.seen, undefined);
            } finally {
                await server.close();
            }
        });
    }

    it('Hono 4: prepended fields are ignored, the signed order is reported', async () => {
        const { state, options } = recorder();
        const app = new Hono();
        app.post('/cb', createHonoHandler(gateway, options));
        const res = await app.request('/cb', post(prepended));
        assert.equal(await res.text(), 'ACTION=POSTAUTH');
        assert.deepEqual(state.seen, { orderId: signed.oid, amount: 120.34 });
    });

    it('verifyCallback with array values reports the last (signed) value as a string', () => {
        const result = gateway.verifyCallback({ ...signed, oid: ['ATTACKER-ORDER', signed.oid], amount: ['500.00', signed.amount] });
        assert.equal(result.verified, true);
        assert.equal(result.orderData?.orderId, signed.oid);
        assert.equal(result.orderData?.amount, 120.34);
    });
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
