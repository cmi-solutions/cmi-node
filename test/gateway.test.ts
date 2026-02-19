/**
 * CMI Payment Gateway - Comprehensive Test Suite
 * 
 * Tests cover:
 * - Gateway construction and validation
 * - Payment parameter building
 * - Hash roundtrip: create params → add callback fields → recompute hash → verify
 * - Callback verification (valid + invalid hash, missing fields)
 * - SecretString security wrapper
 * - HashUtil determinism and key ordering
 * - CallbackHandler middleware
 * - Form generation and XSS prevention
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

import { CMIPaymentGateway } from '../src/core/CMIPaymentGateway.js';
import { SecretString } from '../src/utils/secret-string.util.js';
import { HashUtil } from '../src/utils/hash.util.js';

const validConfig = {
    storeKey: 'test-store-key-12345',
    clientId: '600000123',
    gatewayUrl: 'https://testpayment.cmi.co.ma/fim/est3Dgate',
    shopUrl: 'https://example.com',
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

/**
 * Simulate a CMI callback: takes the params from createPaymentParams,
 * adds gateway-side fields (ProcReturnCode, TransId), and recomputes
 * the hash to match what the CMI server would send.
 */
function simulateCMICallback(
    paymentParams: Record<string, any>,
    storeKey: string,
    overrides: Record<string, any> = {}
): Record<string, any> {
    // Start with the payment params (minus hash and encoding, like CMI does)
    const callbackParams: Record<string, any> = { ...paymentParams };
    delete callbackParams.hash;
    delete callbackParams.HASH;
    delete callbackParams.encoding;

    // Add CMI gateway response fields
    callbackParams.ProcReturnCode = overrides.ProcReturnCode ?? '00';
    callbackParams.TransId = overrides.TransId ?? 'TXN_' + Date.now();

    // Apply any other overrides
    for (const [key, val] of Object.entries(overrides)) {
        callbackParams[key] = val;
    }

    // Recompute hash (this is what CMI's server does before sending the callback)
    callbackParams.HASH = HashUtil.generate(callbackParams, storeKey);

    return callbackParams;
}

// ==============================================================
// 1. Gateway Construction & Validation
// ==============================================================
describe('CMIPaymentGateway - Constructor', () => {
    it('should create gateway with valid config', () => {
        const gateway = new CMIPaymentGateway(validConfig);
        assert.ok(gateway, 'Gateway should be created');
    });

    it('should throw error when storeKey is missing', () => {
        assert.throws(() => new CMIPaymentGateway({ ...validConfig, storeKey: '' }), /storeKey/);
    });

    it('should throw error when clientId is missing', () => {
        assert.throws(() => new CMIPaymentGateway({ ...validConfig, clientId: '' }), /clientId/);
    });

    it('should throw error when gatewayUrl is missing', () => {
        assert.throws(() => new CMIPaymentGateway({ ...validConfig, gatewayUrl: '' }), /gatewayUrl/);
    });

    it('should return sanitized config without storeKey', () => {
        const gateway = new CMIPaymentGateway(validConfig);
        const config = gateway.getConfig();
        assert.ok(!('storeKey' in config), 'Config should not contain storeKey');
        assert.strictEqual(config.clientId, '600000123');
    });

    it('should return default confirmation mode as manual', () => {
        const gateway = new CMIPaymentGateway(validConfig);
        assert.strictEqual(gateway.getConfirmationMode(), 'manual');
    });

    it('should accept auto confirmation mode', () => {
        const gateway = new CMIPaymentGateway({ ...validConfig, confirmationMode: 'auto' });
        assert.strictEqual(gateway.getConfirmationMode(), 'auto');
    });
});

// ==============================================================
// 2. Payment Parameter Building
// ==============================================================
describe('CMIPaymentGateway - createPaymentParams', () => {
    let gateway: CMIPaymentGateway;

    beforeEach(() => {
        gateway = new CMIPaymentGateway(validConfig);
    });

    it('should create payment params with valid request', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);

        assert.ok(params.hash, 'Hash should be generated');
        assert.strictEqual(params.amount, '100.00');
        assert.strictEqual(params.currency, '504');
        assert.ok(params.oid, 'Should generate an order ID');
    });

    it('should throw error for zero amount', () => {
        assert.throws(() => {
            gateway.createPaymentParams({ ...validPaymentRequest, amount: 0 });
        }, /Amount/i);
    });

    it('should throw error for negative amount', () => {
        assert.throws(() => {
            gateway.createPaymentParams({ ...validPaymentRequest, amount: -50 });
        }, /Amount/i);
    });

    it('should format amount with two decimal places', () => {
        const params = gateway.createPaymentParams({ ...validPaymentRequest, amount: 99.9 });
        assert.strictEqual(params.amount, '99.90');
    });

    it('should generate unique order IDs', () => {
        const p1 = gateway.createPaymentParams(validPaymentRequest);
        const p2 = gateway.createPaymentParams(validPaymentRequest);
        assert.notStrictEqual(p1.oid, p2.oid);
    });

    it('should use provided order ID', () => {
        const params = gateway.createPaymentParams({ ...validPaymentRequest, oid: 'MY_ORDER_123' });
        assert.strictEqual(params.oid, 'MY_ORDER_123');
    });

    it('should include optional billing fields', () => {
        const params = gateway.createPaymentParams({
            ...validPaymentRequest,
            BillToCity: 'Casablanca',
            BillToCountry: 'MA',
        });
        assert.ok(params.BillToCity);
        assert.ok(params.BillToCountry);
    });

    it('should set default language to fr', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        assert.strictEqual(params.lang, 'fr');
    });

    it('should set hashAlgorithm to ver3', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        assert.strictEqual(params.hashAlgorithm, 'ver3');
    });
});

// ==============================================================
// 3. CRITICAL: Hash Roundtrip Test
// ==============================================================
describe('Hash Roundtrip Verification', () => {
    let gateway: CMIPaymentGateway;

    beforeEach(() => {
        gateway = new CMIPaymentGateway(validConfig);
    });

    it('should verify a callback with correctly computed hash (manual mode)', () => {
        // Step 1: Create payment params (generates HASH #1 — outgoing)
        const params = gateway.createPaymentParams(validPaymentRequest);

        // Step 2: Simulate CMI server callback (adds fields + recomputes hash)
        const callbackParams = simulateCMICallback(params, validConfig.storeKey, {
            ProcReturnCode: '00',
            TransId: 'TXN_ROUNDTRIP',
        });

        // Step 3: Verify callback (recalculates HASH #2 and compares)
        const result = gateway.verifyCallback(callbackParams);

        assert.strictEqual(result.success, true, `Should succeed: ${result.message}`);
        assert.strictEqual(result.status, 'APPROVED');
        assert.ok(result.orderData);
        assert.strictEqual(result.orderData!.amount, 100);
        assert.strictEqual(result.orderData!.currency, '504');
        assert.strictEqual(result.orderData!.transactionId, 'TXN_ROUNDTRIP');
    });

    it('should verify callback in auto mode (returns ACTION=POSTAUTH)', () => {
        const autoGateway = new CMIPaymentGateway({ ...validConfig, confirmationMode: 'auto' });
        const params = autoGateway.createPaymentParams(validPaymentRequest);

        const callbackParams = simulateCMICallback(params, validConfig.storeKey, {
            ProcReturnCode: '00',
        });

        const result = autoGateway.verifyCallback(callbackParams);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.status, 'ACTION=POSTAUTH');
    });

    it('should detect tampered amount', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        const callbackParams = simulateCMICallback(params, validConfig.storeKey);

        // Tamper with amount AFTER hash was computed
        callbackParams.amount = '1.00';

        const result = gateway.verifyCallback(callbackParams);
        assert.strictEqual(result.success, false, 'Tampered amount should fail');
    });

    it('should detect tampered order ID', () => {
        const params = gateway.createPaymentParams({ ...validPaymentRequest, oid: 'LEGIT_ORDER' });
        const callbackParams = simulateCMICallback(params, validConfig.storeKey);

        callbackParams.oid = 'FAKE_ORDER';

        const result = gateway.verifyCallback(callbackParams);
        assert.strictEqual(result.success, false, 'Tampered oid should fail');
    });

    it('should detect wrong store key', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);

        // Attacker uses a different key to forge the hash
        const callbackParams = simulateCMICallback(params, 'attacker-key-9999');

        const result = gateway.verifyCallback(callbackParams);
        assert.strictEqual(result.success, false, 'Wrong store key should fail');
    });

    it('should report failure for non-00 return code with valid hash', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        const callbackParams = simulateCMICallback(params, validConfig.storeKey, {
            ProcReturnCode: '05', // declined
        });

        const result = gateway.verifyCallback(callbackParams);
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.errorCode, '05');
    });
});

// ==============================================================
// 4. Callback Verification Edge Cases
// ==============================================================
describe('CMIPaymentGateway - verifyCallback', () => {
    let gateway: CMIPaymentGateway;

    beforeEach(() => {
        gateway = new CMIPaymentGateway(validConfig);
    });

    it('should return failure for missing hash', () => {
        const result = gateway.verifyCallback({ oid: 'ORDER123', amount: '100.00' });
        assert.strictEqual(result.success, false);
        assert.ok(result.message.includes('Hash'));
    });

    it('should return failure for invalid hash', () => {
        const result = gateway.verifyCallback({
            oid: 'ORDER123',
            amount: '100.00',
            HASH: 'totally-invalid-hash',
        });
        assert.strictEqual(result.success, false);
    });

    it('should return failure for empty callback', () => {
        const result = gateway.verifyCallback({});
        assert.strictEqual(result.success, false);
    });
});

// ==============================================================
// 5. SecretString
// ==============================================================
describe('SecretString', () => {
    it('should mask in toString', () => {
        const secret = new SecretString('my-secret-key');
        assert.strictEqual(secret.toString(), '********');
        assert.strictEqual(secret.getValue(), 'my-secret-key');
    });

    it('should mask in JSON', () => {
        const secret = new SecretString('api-key-123');
        const json = JSON.stringify({ key: secret });
        assert.ok(json.includes('********'));
        assert.ok(!json.includes('api-key-123'));
    });

    it('should report correct length', () => {
        assert.strictEqual(new SecretString('12345').length, 5);
    });

    it('should throw for empty string', () => {
        assert.throws(() => new SecretString(''), /non-empty/);
    });

    it('should perform timing-safe equality', () => {
        const secret = new SecretString('test-key');
        assert.strictEqual(secret.equals('test-key'), true);
        assert.strictEqual(secret.equals('wrong-key'), false);
    });

    it('should compare SecretString to SecretString', () => {
        const a = new SecretString('same');
        const b = new SecretString('same');
        const c = new SecretString('diff');
        assert.strictEqual(a.equals(b), true);
        assert.strictEqual(a.equals(c), false);
    });
});

// ==============================================================
// 6. HashUtil
// ==============================================================
describe('HashUtil', () => {
    it('should be deterministic', () => {
        const params = { amount: '100.00', clientid: '123', currency: '504' };
        const h1 = HashUtil.generate(params, 'test-key');
        const h2 = HashUtil.generate(params, 'test-key');
        assert.strictEqual(h1, h2);
    });

    it('should differ for different keys', () => {
        const params = { amount: '100.00', clientid: '123' };
        assert.notStrictEqual(
            HashUtil.generate(params, 'key-1'),
            HashUtil.generate(params, 'key-2')
        );
    });

    it('should differ for different params', () => {
        assert.notStrictEqual(
            HashUtil.generate({ amount: '100.00' }, 'key'),
            HashUtil.generate({ amount: '200.00' }, 'key')
        );
    });

    it('should be order-independent (case-insensitive sort)', () => {
        const h1 = HashUtil.generate({ A: '1', b: '2' }, 'key');
        const h2 = HashUtil.generate({ b: '2', A: '1' }, 'key');
        assert.strictEqual(h1, h2);
    });

    it('should work with SecretString', () => {
        const params = { amount: '100.00' };
        const plain = HashUtil.generate(params, 'my-store-key');
        const secret = HashUtil.generate(params, new SecretString('my-store-key'));
        assert.strictEqual(plain, secret);
    });

    it('should produce base64 output', () => {
        const hash = HashUtil.generate({ test: 'value' }, 'key');
        assert.ok(/^[A-Za-z0-9+/]+=*$/.test(hash), 'Should be valid base64');
    });
});

// ==============================================================
// 7. Form Generation
// ==============================================================
describe('CMIPaymentGateway - generatePaymentForm', () => {
    it('should generate HTML form with POST method', () => {
        const gateway = new CMIPaymentGateway(validConfig);
        const params = gateway.createPaymentParams(validPaymentRequest);
        const form = gateway.generatePaymentForm(params);

        assert.ok(form.includes('<form'));
        assert.ok(form.includes('method="post"') || form.includes("method='post'"));
        assert.ok(form.includes(validConfig.gatewayUrl));
    });

    it('should prevent XSS in form values', () => {
        const gateway = new CMIPaymentGateway(validConfig);
        const params = gateway.createPaymentParams({
            ...validPaymentRequest,
            BillToName: '<script>alert(1)</script>',
        });
        const form = gateway.generatePaymentForm(params);
        assert.ok(!form.includes('<script>'));
    });
});

// ==============================================================
// 8. CallbackHandler
// ==============================================================
describe('CallbackHandler', () => {
    let gateway: CMIPaymentGateway;

    beforeEach(() => {
        gateway = new CMIPaymentGateway(validConfig);
    });

    it('should create a callback handler', () => {
        const handler = gateway.createCallbackHandler();
        assert.ok(handler);
        assert.ok(typeof handler.handle === 'function');
        assert.ok(typeof handler.middleware === 'function');
    });

    it('should process valid callback via handle()', async () => {
        const handler = gateway.createCallbackHandler();
        const params = gateway.createPaymentParams(validPaymentRequest);
        const callbackParams = simulateCMICallback(params, validConfig.storeKey);

        const result = await handler.handle(callbackParams);
        assert.strictEqual(result.success, true, `Should succeed: ${result.message}`);
    });

    it('should invoke onSuccess for successful payment', async () => {
        let successCalled = false;

        const handler = gateway.createCallbackHandler({
            onSuccess: () => { successCalled = true; },
        });

        const params = gateway.createPaymentParams(validPaymentRequest);
        const callbackParams = simulateCMICallback(params, validConfig.storeKey);

        await handler.handle(callbackParams);
        assert.strictEqual(successCalled, true, 'onSuccess should be called');
    });

    it('should invoke onFailure for invalid hash', async () => {
        let failureCalled = false;

        const handler = gateway.createCallbackHandler({
            onFailure: () => { failureCalled = true; },
        });

        await handler.handle({ HASH: 'bad-hash', amount: '100', oid: 'TEST' });
        assert.strictEqual(failureCalled, true, 'onFailure should be called');
    });

    it('should return correct response string for auto mode', () => {
        const autoGateway = new CMIPaymentGateway({ ...validConfig, confirmationMode: 'auto' });
        const handler = autoGateway.createCallbackHandler();

        const successResult = {
            success: true,
            status: 'ACTION=POSTAUTH' as const,
            message: 'Payment successful',
            orderData: { orderId: 'T', amount: 100, currency: '504', transactionId: 'TX' },
        };
        const response = handler.getResponse(successResult);
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body, 'ACTION=POSTAUTH');
    });
});
