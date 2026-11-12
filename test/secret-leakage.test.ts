/**
 * Regression guards: the storeKey must never leave the SDK, whatever the caller does.
 *
 * A canary storeKey is used everywhere. Every log line (debug level, through the logger and
 * through console.*), every thrown error (message, stack, cause), every serialization of the
 * gateway and every returned value or HTTP answer is collected, and none may contain it.
 * Customer data (email, name, masked card) must not appear in log lines either.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { CMIPaymentGateway } from '../src/core/CMIPaymentGateway.js';
import { CallbackHandler } from '../src/core/CallbackHandler.js';
import { HashUtil } from '../src/utils/hash.util.js';
import { SecretString } from '../src/utils/secret-string.util.js';
import { configureLogger, resetLogger } from '../src/logger/index.js';
import { createExpressMiddleware } from '../src/middleware/express.middleware.js';
import { createFastifyHandler } from '../src/middleware/fastify.helper.js';
import { createHonoHandler } from '../src/middleware/hono.helper.js';
import { createNextJsHandler, handleNextJsCallback } from '../src/middleware/nextjs.helper.js';
import { NestJSCallbackHandler } from '../src/middleware/nestjs.helper.js';

const CANARY = 'TEST_STOREKEY_CANARY_123';
const PII = { email: 'pii.canary@example.com', name: 'Canary Person', pan: '411111XXXXXX1111', holder: 'CANARY HOLDER' };

const config = {
    storeKey: CANARY,
    clientId: '600000123',
    gatewayUrl: 'https://testpayment.cmi.co.ma/fim/est3Dgate',
    storetype: '3d_pay_hosting' as const,
    trantype: 'PreAuth',
    callbackUrl: 'https://shop.example.ma/api/cmi/callback',
};

const request = {
    amount: '125.6578',
    currency: '504',
    email: PII.email,
    BillToName: PII.name,
    okUrl: 'https://shop.example.ma/ok',
    failUrl: 'https://shop.example.ma/fail',
    shopUrl: 'https://shop.example.ma',
};

/** Everything that left the SDK during the test, as text. */
const outputs: string[] = [];
const logLines: string[] = [];

const deep = (value: unknown): string => {
    try {
        return `${inspect(value, { depth: Infinity, showHidden: true, getters: true })}\n${safeJson(value)}`;
    } catch (error) {
        return `inspect failed: ${String(error)}`;
    }
};
const safeJson = (value: unknown): string => {
    try {
        return JSON.stringify(value) ?? '';
    } catch (error) {
        return `JSON.stringify threw: ${error instanceof Error ? `${error.message}\n${error.stack}` : String(error)}`;
    }
};
const record = (value: unknown) => outputs.push(typeof value === 'string' ? value : deep(value));
const recordError = (fn: () => unknown) => {
    try {
        record(fn());
    } catch (error) {
        const e = error as Error & { cause?: unknown };
        record(`${e.message}\n${e.stack}\n${deep(e.cause)}\n${deep(e)}`);
    }
};
const mockRes = () => {
    const res: Record<string, any> = { _status: 0, _body: '' };
    res.status = (code: number) => { res._status = code; return res; };
    res.code = res.status;
    res.type = () => res;
    res.send = (body: unknown) => { res._body = body; return res; };
    res.json = (body: unknown) => { res._body = JSON.stringify(body); return res; };
    res.end = () => res;
    return res;
};

function signedCallback(gateway: CMIPaymentGateway, extra: Record<string, string> = {}): Record<string, string> {
    const params: Record<string, string> = { ...gateway.createPaymentParams(request) };
    delete params.hash;
    delete params.encoding;
    Object.assign(params, {
        ProcReturnCode: '00', Response: 'Approved', TransId: 'TXN_CANARY',
        MaskedPan: PII.pan, cardHolderName: PII.holder, ...extra,
    });
    params.HASH = HashUtil.generate(params, CANARY);
    return params;
}

const consoleMethods = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;
const originalConsole = Object.fromEntries(consoleMethods.map((m) => [m, console[m]]));

before(() => {
    // Debug level, through the SDK logger AND through any direct console.* call.
    for (const m of consoleMethods) {
        (console as any)[m] = (...args: unknown[]) => { logLines.push(args.map((a) => (typeof a === 'string' ? a : deep(a))).join(' ')); };
    }
    configureLogger({ enabled: true, level: 'debug' });
});

after(() => {
    for (const m of consoleMethods) (console as any)[m] = originalConsole[m];
    resetLogger();
    configureLogger({ enabled: false });
});

describe('storeKey canary never leaves the SDK', () => {
    it('exercises every public path (runs first, collects outputs)', async () => {
        const gateway = new CMIPaymentGateway({ ...config, confirmationMode: 'auto' });

        // Serialization of the gateway and of everything it holds
        record(gateway);
        record(String(gateway));
        record({ ...gateway });
        record(Object.entries(gateway));
        record(gateway.getConfig());
        record(gateway.getConfirmationMode());
        recordError(() => structuredClone(gateway));

        // Payment creation and the HTML form
        const params = gateway.createPaymentParams(request);
        record(params);
        record(gateway.generatePaymentForm(params, { nonce: 'n' }));
        record(gateway.generatePaymentInputs(params));

        // Callback verification: valid, tampered, unsigned, declined, wrong types
        const valid = signedCallback(gateway);
        record(gateway.verifyCallback(valid));
        record(gateway.verifyCallback({ ...valid, amount: '1.00' }));
        record(gateway.verifyCallback({ oid: 'X' }));
        record(gateway.verifyCallback(signedCallback(gateway, { ProcReturnCode: '05', ErrMsg: 'Declined' })));
        record(gateway.verifyCallback({ HASH: ['a', 'b'], amount: { nested: true } } as any));
        recordError(() => gateway.verifyCallback(null as any));

        // Callback handler, including throwing consumer callbacks and validateOrder
        const handler = new CallbackHandler(gateway, {
            validateOrder: () => { throw new Error('validateOrder boom'); },
            onFailure: () => { throw new Error('onFailure boom'); },
        });
        record(await handler.handle(valid));
        record(await handler.evaluate(valid));
        record(handler.errorResponse());
        record(handler);

        // Every framework adapter: answers and error paths
        const res1 = mockRes();
        await createExpressMiddleware(gateway)({ method: 'POST', body: valid }, res1);
        record(res1._body);
        const res2 = mockRes();
        await createExpressMiddleware(gateway)({ method: 'POST', get body(): any { throw new Error('broken body'); } }, res2);
        record(res2._body);
        const res3 = mockRes();
        await createFastifyHandler(gateway)({ method: 'POST', body: valid }, res3);
        record(res3._body);
        await createHonoHandler(gateway)({
            req: { method: 'POST', json: async () => valid, url: 'https://shop.example.ma/cb' },
            text: (body: string, status: number) => { record(body); return new Response(body, { status }); },
        });
        const res4 = mockRes();
        await createNextJsHandler(gateway)({ method: 'POST', body: valid }, res4);
        record(res4._body);
        const app = await handleNextJsCallback(gateway, new Request('https://shop.example.ma/cb', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(valid).toString(),
        }));
        record(await app.text());
        const res5 = mockRes();
        await new NestJSCallbackHandler(gateway).handle(valid, res5);
        record(res5._body);

        // Thrown errors: invalid configs (each still carries the canary)
        recordError(() => new CMIPaymentGateway({ ...config, gatewayUrl: 'not-a-url' }));
        recordError(() => new CMIPaymentGateway({ ...config, gatewayUrl: 'http://evil.example' }));
        recordError(() => new CMIPaymentGateway({ ...config, clientId: 'abc' }));
        recordError(() => new CMIPaymentGateway({ ...config, unknownField: CANARY.toLowerCase() } as any));
        recordError(() => new CMIPaymentGateway({ ...config, STOREKEY: CANARY } as any));
        recordError(() => new CMIPaymentGateway({ ...config, storetype: 'nope' } as any));
        recordError(() => new CMIPaymentGateway({ ...config, storeKey: { toString: () => CANARY } } as any));
        recordError(() => new CMIPaymentGateway({ ...config, confirmationMode: 'sometimes' }));
        recordError(() => new CMIPaymentGateway({ ...config }, { app: { post: () => { throw new Error('no express'); } } }));

        // Thrown errors: invalid payment requests
        recordError(() => gateway.createPaymentParams({ ...request, amount: 'abc' }));
        recordError(() => gateway.createPaymentParams({ ...request, email: 'bad' }));
        recordError(() => gateway.createPaymentParams({ ...request, BillToName: 'محمد' }));
        recordError(() => gateway.createPaymentParams({ ...request, currency: 'XXX' }));
        recordError(() => gateway.createPaymentParams(null as any));

        // Direct use of the hash helper with a SecretString must not leak through errors either
        recordError(() => HashUtil.generate({ a: 'b' }, new SecretString(CANARY)));
        record(new SecretString(CANARY));

        assert.ok(outputs.length > 40, `collected ${outputs.length} outputs`);
    });

    it('the canary is in no returned value, answer, serialization or error', () => {
        const leaks = outputs.filter((o) => o.includes(CANARY) || o.toLowerCase().includes(CANARY.toLowerCase()));
        assert.deepEqual(leaks.map((l) => l.slice(0, 300)), []);
    });

    it('the canary is in no log line, even at debug level', () => {
        assert.ok(logLines.length > 0, 'expected some log lines at debug level');
        const leaks = logLines.filter((l) => l.toLowerCase().includes(CANARY.toLowerCase()));
        assert.deepEqual(leaks.map((l) => l.slice(0, 300)), []);
    });

    it('the hash plaintext (values joined with "|" plus the key) is never exposed', () => {
        const all = [...outputs, ...logLines];
        assert.equal(all.some((o) => o.includes(`|${CANARY}`)), false);
    });

    it('customer data and the masked card are never logged', () => {
        for (const value of Object.values(PII)) {
            const hits = logLines.filter((l) => l.includes(value));
            assert.deepEqual(hits.map((l) => l.slice(0, 200)), [], `"${value}" appeared in logs`);
        }
    });

    it('the generated form carries the hash, never the key', () => {
        const gateway = new CMIPaymentGateway(config);
        const html = gateway.generatePaymentForm(gateway.createPaymentParams(request));
        assert.match(html, /name="hash" value="[A-Za-z0-9+/=]{88}"/);
        assert.equal(html.includes(CANARY), false);
    });
});
