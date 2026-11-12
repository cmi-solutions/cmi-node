/**
 * Pre-release review tests: runtime privacy of the storeKey, the server-only guard,
 * the weak-key warning, and callback edge cases (missing fields, replay).
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { CMIPaymentGateway } from '../src/core/CMIPaymentGateway.js';
import { CallbackHandler } from '../src/core/CallbackHandler.js';
import { HashUtil } from '../src/utils/hash.util.js';
import { SecretString } from '../src/utils/secret-string.util.js';
import { MIN_STORE_KEY_LENGTH, SERVER_ONLY_MESSAGE } from '../src/utils/runtime-guard.util.js';
import { configureLogger, resetLogger } from '../src/logger/index.js';

configureLogger({ enabled: false });

const CANARY = 'TEST_STOREKEY_CANARY_123';
const config = {
    storeKey: CANARY,
    clientId: '600000123',
    gatewayUrl: 'https://testpayment.cmi.co.ma/fim/est3Dgate',
    storetype: '3d_pay_hosting' as const,
    trantype: 'PreAuth',
};
const request = {
    amount: '100', currency: '504', email: 'test@example.com', BillToName: 'Test User',
    okUrl: 'https://shop.example.ma/ok', failUrl: 'https://shop.example.ma/fail', shopUrl: 'https://shop.example.ma',
};

function callbackFor(gateway: CMIPaymentGateway, extra: Record<string, string> = {}, drop: string[] = []) {
    const params: Record<string, string> = { ...gateway.createPaymentParams(request) };
    delete params.hash;
    delete params.encoding;
    Object.assign(params, { ProcReturnCode: '00', Response: 'Approved', TransId: 'T1', ...extra });
    for (const key of drop) delete params[key];
    params.HASH = HashUtil.generate(params, CANARY);
    return params;
}

describe('storeKey is unreachable at runtime', () => {
    it('no SecretString and no canary string is reachable from the gateway object graph', () => {
        const gateway = new CMIPaymentGateway(config);
        const seen = new Set<unknown>();
        const found: string[] = [];
        const walk = (value: unknown, path: string) => {
            if (value === null || typeof value !== 'object' && typeof value !== 'function') {
                if (typeof value === 'string' && value.includes(CANARY)) found.push(path);
                return;
            }
            if (seen.has(value)) return;
            seen.add(value);
            if (value instanceof SecretString) found.push(`${path} (SecretString)`);
            for (const key of Reflect.ownKeys(value as object)) {
                const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
                if (descriptor && 'value' in descriptor) walk(descriptor.value, `${path}.${String(key)}`);
            }
        };
        walk(gateway, 'gateway');
        assert.deepEqual(found, []);
    });

    it('the old TypeScript-private property no longer exists', () => {
        const gateway = new CMIPaymentGateway(config) as unknown as Record<string, unknown>;
        assert.equal(gateway.secureStoreKey, undefined);
    });
});

describe('server-only guard', () => {
    const g = globalThis as Record<string, unknown>;
    afterEach(() => { delete g.window; delete g.document; });

    it('throws when constructed in a browser (window + document)', () => {
        g.window = {};
        g.document = {};
        assert.throws(() => new CMIPaymentGateway(config), (e: Error) => e.message === SERVER_ONLY_MESSAGE && !e.message.includes(CANARY));
    });

    it('still works when only `window` exists (some server runtimes define it)', () => {
        g.window = {};
        assert.doesNotThrow(() => new CMIPaymentGateway(config));
    });

    it('the browser entry throws at import time', async () => {
        await assert.rejects(import('../src/browser.js'), { message: SERVER_ONLY_MESSAGE });
    });
});

describe('weak storeKey warning', () => {
    afterEach(() => { resetLogger(); configureLogger({ enabled: false }); });

    it(`warns once for a key shorter than ${MIN_STORE_KEY_LENGTH} characters, without printing it`, async () => {
        // A fresh module instance so the once-per-process flag starts clean
        const guard = await import(`../src/utils/runtime-guard.util.js?fresh=${Date.now()}`);
        const lines: string[] = [];
        configureLogger({ enabled: true, level: 'warn', sink: { debug() {}, info() {}, warn: (...a: unknown[]) => lines.push(a.join(' ')), error() {} } });
        guard.warnIfWeakStoreKey(new SecretString('short-key'));
        guard.warnIfWeakStoreKey(new SecretString('short-key'));
        assert.equal(lines.length, 1);
        assert.equal(lines[0].includes('short-key'), false);
    });

    it('does not warn for a long key', async () => {
        const guard = await import(`../src/utils/runtime-guard.util.js?fresh=long${Date.now()}`);
        const lines: string[] = [];
        configureLogger({ enabled: true, level: 'warn', sink: { debug() {}, info() {}, warn: (...a: unknown[]) => lines.push(a.join(' ')), error() {} } });
        guard.warnIfWeakStoreKey(new SecretString(CANARY));
        assert.equal(lines.length, 0);
    });
});

describe('callback edge cases', () => {
    const gateway = new CMIPaymentGateway({ ...config, confirmationMode: 'auto' });

    it('a signed callback without ProcReturnCode is an authentic decline, not a payment', () => {
        const result = gateway.verifyCallback(callbackFor(gateway, {}, ['ProcReturnCode']));
        assert.equal(result.verified, true);
        assert.equal(result.success, false);
        assert.equal(result.status, 'DECLINED');
    });

    it('a callback with no HASH is rejected', () => {
        const { HASH: _h, ...unsigned } = callbackFor(gateway);
        assert.equal(gateway.verifyCallback(unsigned).status, 'FAILURE');
    });

    it('a callback signed with another store key is rejected', () => {
        const params = callbackFor(gateway);
        params.HASH = HashUtil.generate({ ...params, HASH: undefined }, 'another-store-key-0000');
        assert.equal(gateway.verifyCallback(params).verified, false);
    });

    it('an extra field added after signing is rejected', () => {
        assert.equal(gateway.verifyCallback({ ...callbackFor(gateway), injected: 'x' }).verified, false);
    });

    it('an empty or non-object body is rejected without throwing', () => {
        for (const body of [{}, null, undefined, 'text', 42]) {
            assert.equal(gateway.verifyCallback(body as any).success, false);
        }
    });

    it('replay: the SDK accepts a valid callback twice, so validateOrder must be idempotent', async () => {
        const paid = new Set<string>();
        const handler = new CallbackHandler(gateway, {
            validateOrder: (result) => {
                const id = String(result.orderData?.orderId);
                if (paid.has(id)) return false; // already processed: refuse the replay
                paid.add(id);
                return true;
            },
        });
        const callback = callbackFor(gateway);
        const first = handler.getResponse(await handler.handle(callback));
        const replay = handler.getResponse(await handler.handle(callback));
        assert.equal(first.body, 'ACTION=POSTAUTH');
        assert.equal(replay.body, 'FAILURE');
    });
});
