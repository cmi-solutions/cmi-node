/**
 * Regression tests for the fixes from the 2026-11 code review
 * (amount rounding, query-string fallbacks, answer-before-callback order,
 * reserved hash field, https-only URLs, prototype keys, logger sink).
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { CMIPaymentGateway } from '../src/core/CMIPaymentGateway.js';
import { CallbackHandler } from '../src/core/CallbackHandler.js';
import { HashUtil } from '../src/utils/hash.util.js';
import { FormatterUtil } from '../src/utils/formatter.util.js';
import { configureLogger, resetLogger, logger } from '../src/logger/index.js';
import { createNextJsHandler, createNextJsAppRouterHandler, handleNextJsCallback, readAppRouterParams } from '../src/middleware/nextjs.helper.js';
import { createHonoHandler } from '../src/middleware/hono.helper.js';
import { createFastifyHandler } from '../src/middleware/fastify.helper.js';
import { NestJSCallbackHandler } from '../src/middleware/nestjs.helper.js';
import { createExpressMiddleware } from '../src/middleware/express.middleware.js';

configureLogger({ enabled: false });

const validConfig = {
    storeKey: 'test-store-key-12345',
    clientId: '600000123',
    gatewayUrl: 'https://testpayment.cmi.co.ma/fim/est3Dgate',
    storetype: '3d_pay_hosting' as const,
    trantype: 'PreAuth',
};

const validPaymentRequest = {
    amount: 100,
    email: 'test@example.com',
    BillToName: 'Test User',
    okUrl: 'https://example.com/success',
    failUrl: 'https://example.com/failure',
    shopUrl: 'https://example.com',
    currency: '504',
};

function signedCallback(gateway: CMIPaymentGateway): Record<string, any> {
    const params: Record<string, any> = { ...gateway.createPaymentParams(validPaymentRequest) };
    delete params.hash;
    delete params.encoding;
    params.ProcReturnCode = '00';
    params.TransId = 'TXN_1';
    params.HASH = HashUtil.generate(params, validConfig.storeKey);
    return params;
}

function mockRes(order?: string[]) {
    const res: Record<string, any> = { _status: 0, _body: '' };
    res.status = (code: number) => { res._status = code; return res; };
    res.code = res.status;
    res.send = (body: any) => { res._body = body; order?.push('answer'); return res; };
    return res;
}

describe('Amounts are rounded half-up to the cent, without float errors (H1)', () => {
    it('keeps exact string amounts', () => {
        assert.equal(FormatterUtil.formatAmount('220'), '220.00');
        assert.equal(FormatterUtil.formatAmount('0220.5'), '220.50');
        assert.equal(FormatterUtil.formatAmount('.5'), '0.50');
        assert.equal(FormatterUtil.formatAmount(' 10.25 '), '10.25');
    });

    const rounding: Array<[number | string, string]> = [
        ['125.6578', '125.66'], // CMI log: "Amount 125.6578 updated to 125.66"
        ['125.3333', '125.33'],
        [125.6578, '125.66'],
        [125.3333, '125.33'],
        [1.005, '1.01'],       // Number.toFixed(2) gives "1.00"
        ['1.005', '1.01'],
        [10.235, '10.24'],
        ['220.555', '220.56'],
        ['1.001', '1.00'],
        ['9.995', '10.00'],    // carries into the integer part
        ['99.999', '100.00'],
        ['0.004', '0.00'],
        [19.99 * 3, '59.97'],  // float noise: 59.97000000000001
        [0.1 + 0.2, '0.30'],   // 0.30000000000000004
        [100, '100.00'],
        ['123456789012345678.995', '123456789012345679.00'], // beyond Number precision
    ];
    for (const [input, expected] of rounding) {
        it(`formats ${JSON.stringify(input)} as ${expected}`, () => {
            assert.equal(FormatterUtil.formatAmount(input), expected);
        });
    }

    for (const bad of ['1e3', '12,50', '220.', '', '-', 'abc']) {
        it(`rejects the string ${JSON.stringify(bad)}`, () => {
            assert.throws(() => FormatterUtil.formatAmount(bad), /Invalid amount/);
        });
    }

    it('rejects 1e21, which String() writes in exponent form', () => {
        assert.throws(() => FormatterUtil.formatAmount(1e21), /Invalid amount/);
    });

    for (const input of ['125.6578', 125.3333]) {
        it(`createPaymentParams posts and hashes the rounded amount for ${JSON.stringify(input)}`, () => {
            const gw = new CMIPaymentGateway(validConfig);
            const params = gw.createPaymentParams({ ...validPaymentRequest, amount: input });
            const expected = FormatterUtil.formatAmount(input);
            assert.equal(params.amount, expected);
            const { hash, ...rest } = params;
            assert.equal(hash, HashUtil.generate(rest, validConfig.storeKey));
        });
    }
});

describe('Callbacks are not read from the query string unless supportGetMethod (H2, H3)', () => {
    it('Next.js Pages handler ignores the query string on a POST with no body', async () => {
        const gw = new CMIPaymentGateway(validConfig);
        const res = mockRes();
        await createNextJsHandler(gw)({ method: 'POST', body: undefined, query: signedCallback(gw) }, res);
        assert.equal(res._body, 'FAILURE');
    });

    it('Next.js Pages handler ignores the query string on GET by default', async () => {
        const gw = new CMIPaymentGateway(validConfig);
        const res = mockRes();
        await createNextJsHandler(gw)({ method: 'GET', query: signedCallback(gw) }, res);
        assert.equal(res._body, 'FAILURE');
    });

    it('Next.js Pages handler reads GET queries when supportGetMethod is set', async () => {
        const gw = new CMIPaymentGateway(validConfig);
        const res = mockRes();
        await createNextJsHandler(gw, { supportGetMethod: true })({ method: 'GET', query: signedCallback(gw) }, res);
        assert.equal(res._body, 'APPROVED');
    });

    it('Hono handler does not fall back to the URL when the body cannot be parsed', async () => {
        const gw = new CMIPaymentGateway(validConfig);
        const query = new URLSearchParams(signedCallback(gw)).toString();
        let body = '';
        await createHonoHandler(gw)({
            req: { method: 'POST', json: async () => { throw new Error('not json'); }, url: `https://shop.example.ma/cb?${query}` },
            text: (b: string, s: number) => { body = b; return new Response(b, { status: s }); },
        });
        assert.equal(body, 'FAILURE');
    });

    it('Hono handler reads GET queries only with supportGetMethod', async () => {
        const gw = new CMIPaymentGateway(validConfig);
        const url = `https://shop.example.ma/cb?${new URLSearchParams(signedCallback(gw)).toString()}`;
        const run = async (supportGetMethod: boolean) => {
            let body = '';
            await createHonoHandler(gw, { supportGetMethod })({
                req: { method: 'GET', url },
                text: (b: string, s: number) => { body = b; return new Response(b, { status: s }); },
            });
            return body;
        };
        assert.equal(await run(false), 'FAILURE');
        assert.equal(await run(true), 'APPROVED');
    });

    it('App Router: an empty POST body does not fall back to the URL', async () => {
        const gw = new CMIPaymentGateway(validConfig);
        const url = `https://shop.example.ma/cb?${new URLSearchParams(signedCallback(gw)).toString()}`;
        const response = await handleNextJsCallback(gw, new Request(url, { method: 'POST' }));
        assert.equal(await response.text(), 'FAILURE');
    });

    it('App Router: GET queries are read only with supportGetMethod', async () => {
        const gw = new CMIPaymentGateway(validConfig);
        const url = `https://shop.example.ma/cb?${new URLSearchParams(signedCallback(gw)).toString()}`;
        assert.deepEqual(await readAppRouterParams(new Request(url)), {});
        const response = await handleNextJsCallback(gw, new Request(url), { supportGetMethod: true });
        assert.equal(await response.text(), 'APPROVED');
    });
});

describe('Adapters answer CMI before running onSuccess (M1)', () => {
    const cases: Array<[string, (gw: CMIPaymentGateway, order: string[]) => Promise<unknown>]> = [
        ['Express', (gw, order) => createExpressMiddleware(gw, { onSuccess: () => { order.push('onSuccess'); } })({ method: 'POST', body: signedCallback(gw) }, mockRes(order))],
        ['Next.js Pages', (gw, order) => createNextJsHandler(gw, { onSuccess: () => { order.push('onSuccess'); } })({ method: 'POST', body: signedCallback(gw) }, mockRes(order))],
        ['Fastify', (gw, order) => createFastifyHandler(gw, { onSuccess: () => { order.push('onSuccess'); } })({ method: 'POST', body: signedCallback(gw) }, mockRes(order))],
        ['NestJS', (gw, order) => new NestJSCallbackHandler(gw, { onSuccess: () => { order.push('onSuccess'); } }).handle(signedCallback(gw), mockRes(order))],
    ];

    for (const [name, run] of cases) {
        it(`${name}: the answer is sent first, then onSuccess runs`, async () => {
            const order: string[] = [];
            await run(new CMIPaymentGateway(validConfig), order);
            assert.deepEqual(order, ['answer', 'onSuccess']);
        });
    }

    it('App Router keeps running onSuccess before returning its Response', async () => {
        const gw = new CMIPaymentGateway(validConfig);
        let called = false;
        const handler = createNextJsAppRouterHandler(gw, { onSuccess: () => { called = true; } });
        const response = await handler(new Request('https://shop.example.ma/cb', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(signedCallback(gw)).toString(),
        }));
        assert.equal(called, true);
        assert.equal(await response.text(), 'APPROVED');
    });
});

describe('Error answers use failureResponse and are logged (M9, L3)', () => {
    afterEach(() => configureLogger({ enabled: false }));

    it('Express middleware answers 500 with the configured failureResponse', async () => {
        const gw = new CMIPaymentGateway(validConfig);
        const res = mockRes();
        // A body getter that throws makes extractParams fail.
        const req = { method: 'POST', get body(): any { throw new Error('broken body'); } };
        await createExpressMiddleware(gw, { failureResponse: 'NOK' })(req, res);
        assert.equal(res._status, 500);
        assert.equal(res._body, 'NOK');
    });

    it('Hono handler logs the error before answering', async () => {
        const errors: unknown[][] = [];
        configureLogger({ enabled: true, level: 'error', sink: { debug() {}, info() {}, warn() {}, error: (...a: unknown[]) => { errors.push(a); } } });
        const gw = new CMIPaymentGateway(validConfig);
        let status = 0;
        await createHonoHandler(gw, { failureResponse: 'NOK' })({
            req: { get method(): string { throw new Error('no method'); } },
            text: (b: string, s: number) => { status = s; assert.equal(b, 'NOK'); return new Response(b, { status: s }); },
        });
        assert.equal(status, 500);
        assert.equal(errors.length, 1);
    });
});

describe('autoRespond: false without next() still runs the consumer callbacks (L2)', () => {
    it('stores the result on req and calls onSuccess', async () => {
        const gw = new CMIPaymentGateway(validConfig);
        let called = false;
        const req: Record<string, any> = { method: 'POST', body: signedCallback(gw) };
        await createExpressMiddleware(gw, { autoRespond: false, onSuccess: () => { called = true; } })(req, mockRes());
        assert.equal(called, true);
        assert.equal(req.paymentResult.success, true);
    });
});

describe('A custom HASH field is never posted (M2)', () => {
    it('drops a custom HASH field and keeps one valid hash', () => {
        const gw = new CMIPaymentGateway(validConfig);
        const params = gw.createPaymentParams({ ...validPaymentRequest, HASH: 'forged' } as any);
        const hashKeys = Object.keys(params).filter((k) => k.toLowerCase() === 'hash');
        assert.deepEqual(hashKeys, ['hash']);
        assert.notEqual(params.hash, 'forged');
    });
});

describe('Configured URLs must use https (M4) and clientId must be digits (L5)', () => {
    it('rejects an http gatewayUrl on a public host', () => {
        assert.throws(() => new CMIPaymentGateway({ ...validConfig, gatewayUrl: 'http://testpayment.cmi.co.ma/fim/est3Dgate' }), /https/);
    });

    it('rejects an http callbackUrl on a public host', () => {
        assert.throws(() => new CMIPaymentGateway({ ...validConfig, callbackUrl: 'http://shop.example.ma/cb' }), /https/);
    });

    for (const local of ['http://localhost:3000/cb', 'http://127.0.0.1/cb', 'http://shop.localhost/cb']) {
        it(`allows plain http on a local host: ${local}`, () => {
            assert.doesNotThrow(() => new CMIPaymentGateway({ ...validConfig, callbackUrl: local }));
        });
    }

    for (const bad of ['-1', '600000.5', '6e5']) {
        it(`rejects the clientId ${bad}`, () => {
            assert.throws(() => new CMIPaymentGateway({ ...validConfig, clientId: bad }), /clientId/);
        });
    }
});

describe('Prototype keys are not treated as fields (L1)', () => {
    it('rejects a __proto__ own property in the payment request', () => {
        const gw = new CMIPaymentGateway(validConfig);
        const request = JSON.parse(JSON.stringify(validPaymentRequest).replace('{', '{"__proto__":{"okUrl":"https://evil.example"},'));
        assert.throws(() => gw.createPaymentParams(request), /__proto__/);
    });

    it('treats a custom "constructor" field as a plain custom field', () => {
        const gw = new CMIPaymentGateway(validConfig);
        const params = gw.createPaymentParams({ ...validPaymentRequest, constructor: 'x' } as any);
        assert.equal(params.constructor, 'x');
    });

    it('rejects "constructor" as a config key instead of mapping it', () => {
        assert.throws(() => new CMIPaymentGateway({ ...validConfig, constructor: 'x' } as any), /Unknown configuration field/);
    });
});

describe('Public API additions (L6, L8)', () => {
    it('generatePaymentInputs returns escaped hidden inputs', () => {
        const gw = new CMIPaymentGateway(validConfig);
        const inputs = gw.generatePaymentInputs({ a: '"><script>' });
        assert.deepEqual(inputs, ['<input type="hidden" name="a" value="&quot;&gt;&lt;script&gt;" />']);
    });

    it('createNextJsAppRouterHandler builds one handler for many requests', async () => {
        const gw = new CMIPaymentGateway(validConfig);
        const handler = createNextJsAppRouterHandler(gw);
        for (let i = 0; i < 2; i++) {
            const response = await handler(new Request('https://shop.example.ma/cb', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(signedCallback(gw)),
            }));
            assert.equal(await response.text(), 'APPROVED');
        }
    });
});

describe('Logger defaults and sink (L4)', () => {
    afterEach(() => { resetLogger(); configureLogger({ enabled: false }); });

    it('does not print info by default outside production', () => {
        resetLogger();
        const lines: unknown[] = [];
        configureLogger({ sink: { debug: (...a) => lines.push(a), info: (...a) => lines.push(a), warn() {}, error() {} } });
        logger.info('hidden');
        logger.debug('hidden');
        assert.equal(lines.length, 0);
    });

    it('sends one line per call to the configured sink', () => {
        const lines: unknown[][] = [];
        const record = (level: string) => (...a: unknown[]) => lines.push([level, ...a]);
        configureLogger({ enabled: true, level: 'debug', sink: { debug: record('debug'), info: record('info'), warn: record('warn'), error: record('error') } });
        logger.debug('d'); logger.info('i'); logger.warn('w'); logger.error('e');
        assert.equal(lines.length, 4);
        for (const [i, [level, ...args]] of lines.entries()) {
            assert.equal(args.length, 1, 'the sink receives a single string');
            const text = String(args[0]);
            assert.match(text, new RegExp(`^\\[CMI Gateway\\] \\[${String(level).toUpperCase()}\\] \\S+ ${'diwe'[i]}$`));
        }
    });

    it('a sink that keeps only its first argument (like pino) still gets the message and the error', () => {
        const kept: string[] = [];
        const firstOnly = (first: unknown) => { kept.push(String(first)); };
        configureLogger({ enabled: true, level: 'error', sink: { debug: firstOnly, info: firstOnly, warn: firstOnly, error: firstOnly } });
        logger.error('Callback handler error:', new Error('database is down'));
        assert.equal(kept.length, 1);
        assert.match(kept[0], /\[ERROR\] .* Callback handler error: Error: database is down/);
    });

    it('warns once when auto mode runs without validateOrder (M3)', async () => {
        const warnings: string[] = [];
        configureLogger({ enabled: true, level: 'warn', sink: { debug() {}, info() {}, warn: (...a) => warnings.push(String(a.at(-1))), error() {} } });
        const gw = new CMIPaymentGateway({ ...validConfig, confirmationMode: 'auto' });
        const handler = new CallbackHandler(gw);
        await handler.handle(signedCallback(gw));
        await handler.handle(signedCallback(gw));
        assert.equal(warnings.filter((w) => w.includes('validateOrder')).length, 1);
    });

    it('also warns once in manual mode without validateOrder, and not when it is given', async () => {
        const warnings: string[] = [];
        configureLogger({ enabled: true, level: 'warn', sink: { debug() {}, info() {}, warn: (...a) => warnings.push(String(a.at(-1))), error() {} } });
        const gw = new CMIPaymentGateway({ ...validConfig, confirmationMode: 'manual' });
        const handler = new CallbackHandler(gw);
        await handler.handle(signedCallback(gw));
        await handler.handle(signedCallback(gw));
        const found = warnings.filter((w) => w.includes('validateOrder'));
        assert.equal(found.length, 1);
        assert.match(found[0], /'manual'.*replayed callback/);

        warnings.length = 0;
        const checked = new CallbackHandler(gw, { validateOrder: () => true });
        await checked.handle(signedCallback(gw));
        assert.equal(warnings.filter((w) => w.includes('validateOrder')).length, 0);
    });
});
