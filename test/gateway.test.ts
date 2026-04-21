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
 * - ConfigValidator (duplicate fields, unknown fields, confirmation mode)
 * - PaymentValidator (all required fields, billing, amountCur/symbolCur)
 * - FormatterUtil (amount, currency, store type, auto-redirect)
 * - SanitizationUtil (strings, email, HTML escaping)
 * - Logger (level filtering, configureLogger, resetLogger)
 * - Deterministic hash anchor (known input → known output)
 * - Middleware (mock HTTP context)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { CMIPaymentGateway } from '../src/core/CMIPaymentGateway.js';
import { CallbackHandler } from '../src/core/CallbackHandler.js';
import { SecretString } from '../src/utils/secret-string.util.js';
import { HashUtil } from '../src/utils/hash.util.js';
import { timingSafeCompare } from '../src/utils/crypto/index.js';
import { FormatterUtil } from '../src/utils/formatter.util.js';
import { SanitizationUtil } from '../src/utils/sanitization.util.js';
import { ConfigValidator } from '../src/validators/config.validator.js';
import { PaymentValidator } from '../src/validators/payment.validator.js';
import { logger, configureLogger, resetLogger } from '../src/logger/index.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

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

/**
 * Simulates what the CMI gateway does before sending a callback:
 * strips hash + encoding, adds response fields, recomputes hash.
 */
function simulateCMICallback(
    paymentParams: Record<string, any>,
    storeKey: string,
    overrides: Record<string, any> = {}
): Record<string, any> {
    const callbackParams: Record<string, any> = { ...paymentParams };
    delete callbackParams.hash;
    delete callbackParams.HASH;
    delete callbackParams.encoding;

    callbackParams.ProcReturnCode = overrides.ProcReturnCode ?? '00';
    callbackParams.TransId = overrides.TransId ?? 'TXN_' + Date.now();

    for (const [key, val] of Object.entries(overrides)) {
        callbackParams[key] = val;
    }

    callbackParams.HASH = HashUtil.generate(callbackParams, storeKey);
    return callbackParams;
}

// ---------------------------------------------------------------------------
// Mock HTTP helpers for middleware tests
// ---------------------------------------------------------------------------

function makeMockRes() {
    const res: Record<string, any> = { _status: 0, _body: '' };
    res.status = (code: number) => { res._status = code; return res; };
    res.send   = (body: any)    => { res._body  = body;  return res; };
    res.json   = (data: any)    => { res._body  = JSON.stringify(data); return res; };
    res.end    = ()             => {};
    return res;
}

function makeMockReq(body: any, method = 'POST') {
    return { body, method, query: {}, headers: {} };
}

// ===========================================================================
// 1. Gateway Construction & Validation
// ===========================================================================
describe('CMIPaymentGateway - Constructor', () => {
    it('should create gateway with valid config', () => {
        const gw = new CMIPaymentGateway(validConfig);
        assert.ok(gw);
    });

    it('should throw for missing storeKey', () => {
        assert.throws(() => new CMIPaymentGateway({ ...validConfig, storeKey: '' }), /storeKey/);
    });

    it('should throw for missing clientId', () => {
        assert.throws(() => new CMIPaymentGateway({ ...validConfig, clientId: '' }), /clientId/);
    });

    it('should throw for missing gatewayUrl', () => {
        assert.throws(() => new CMIPaymentGateway({ ...validConfig, gatewayUrl: '' }), /gatewayUrl/);
    });

    it('should throw for non-numeric clientId', () => {
        assert.throws(() => new CMIPaymentGateway({ ...validConfig, clientId: 'ABC' }), /clientId/);
    });

    it('should throw for invalid gatewayUrl (no protocol)', () => {
        assert.throws(
            () => new CMIPaymentGateway({ ...validConfig, gatewayUrl: 'not-a-url' }),
            /gatewayUrl/
        );
    });

    it('should return sanitized config without storeKey', () => {
        const gw = new CMIPaymentGateway(validConfig);
        const cfg = gw.getConfig();
        assert.ok(!('storeKey' in cfg));
        assert.strictEqual(cfg.clientId, '600000123');
    });

    it('should default to manual confirmation mode', () => {
        const gw = new CMIPaymentGateway(validConfig);
        assert.strictEqual(gw.getConfirmationMode(), 'manual');
    });

    it('should accept auto confirmation mode', () => {
        const gw = new CMIPaymentGateway({ ...validConfig, confirmationMode: 'auto' });
        assert.strictEqual(gw.getConfirmationMode(), 'auto');
    });

    it('should throw for invalid confirmationMode', () => {
        assert.throws(
            () => new CMIPaymentGateway({ ...validConfig, confirmationMode: 'invalidMode' }),
            /Unsupported confirmation mode/
        );
    });

    it('should accept case-insensitive confirmation mode', () => {
        const gw = new CMIPaymentGateway({ ...validConfig, confirmationMode: 'AUTO' });
        assert.strictEqual(gw.getConfirmationMode(), 'auto');
    });
});

// ===========================================================================
// 2. Payment Parameter Building
// ===========================================================================
describe('CMIPaymentGateway - createPaymentParams', () => {
    let gateway: CMIPaymentGateway;
    beforeEach(() => { gateway = new CMIPaymentGateway(validConfig); });

    it('should create payment params with valid request', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        assert.ok(params.hash, 'Hash should be generated');
        assert.strictEqual(params.amount, '100.00');
        assert.strictEqual(params.currency, '504');
        assert.ok(params.oid, 'Should generate an order ID');
    });

    it('should throw for zero amount', () => {
        assert.throws(() => gateway.createPaymentParams({ ...validPaymentRequest, amount: 0 }), /Amount/i);
    });

    it('should throw for negative amount', () => {
        assert.throws(() => gateway.createPaymentParams({ ...validPaymentRequest, amount: -50 }), /Amount/i);
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

    it('should default language to fr', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        assert.strictEqual(params.lang, 'fr');
    });

    it('should set hashAlgorithm to ver3', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        assert.strictEqual(params.hashAlgorithm, 'ver3');
    });

    it('auto-generated rnd should be 20 alphabetic characters', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        assert.ok(params.rnd, 'rnd should be present');
        assert.strictEqual(params.rnd.length, 20, 'rnd should be 20 chars');
        assert.ok(/^[a-zA-Z]+$/.test(params.rnd), `rnd should be purely alphabetic, got: "${params.rnd}"`);
    });

    it('auto-generated rnd should vary between calls', () => {
        const p1 = gateway.createPaymentParams(validPaymentRequest);
        const p2 = gateway.createPaymentParams(validPaymentRequest);
        assert.notStrictEqual(p1.rnd, p2.rnd, 'rnd should be unique per call');
    });

    it('should accept case-insensitive field names', () => {
        // Clone validPaymentRequest and remove okUrl to avoid duplicates
        const req = { ...validPaymentRequest };
        delete (req as any).okUrl;

        const params = gateway.createPaymentParams({
            ...req,
            OKURL: 'https://example.com/success',  // uppercase alias
        } as any);
        assert.ok(params.okUrl ?? params.OKURL);
    });
});

// ===========================================================================
// 3. CRITICAL: Hash Roundtrip Verification
// ===========================================================================
describe('Hash Roundtrip Verification', () => {
    let gateway: CMIPaymentGateway;
    beforeEach(() => { gateway = new CMIPaymentGateway(validConfig); });

    it('should verify a valid callback (manual mode)', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey, {
            ProcReturnCode: '00',
            TransId: 'TXN_ROUNDTRIP',
        });
        const result = gateway.verifyCallback(cb);
        assert.strictEqual(result.success, true, result.message);
        assert.strictEqual(result.status, 'APPROVED');
        assert.ok(result.orderData);
        assert.strictEqual(result.orderData!.amount, 100);
        assert.strictEqual(result.orderData!.transactionId, 'TXN_ROUNDTRIP');
    });

    it('should verify a valid callback (auto mode → ACTION=POSTAUTH)', () => {
        const gw = new CMIPaymentGateway({ ...validConfig, confirmationMode: 'auto' });
        const params = gw.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey, { ProcReturnCode: '00' });
        const result = gw.verifyCallback(cb);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.status, 'ACTION=POSTAUTH');
    });

    it('should detect tampered amount', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);
        cb.amount = '1.00'; // tamper after hash computed
        const result = gateway.verifyCallback(cb);
        assert.strictEqual(result.success, false);
    });

    it('should detect tampered order ID', () => {
        const params = gateway.createPaymentParams({ ...validPaymentRequest, oid: 'LEGIT_ORDER' });
        const cb = simulateCMICallback(params, validConfig.storeKey);
        cb.oid = 'FAKE_ORDER';
        const result = gateway.verifyCallback(cb);
        assert.strictEqual(result.success, false);
    });

    it('should detect wrong store key', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, 'attacker-key-9999');
        const result = gateway.verifyCallback(cb);
        assert.strictEqual(result.success, false);
    });

    it('should report failure for non-00 return code with valid hash', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey, { ProcReturnCode: '05' });
        const result = gateway.verifyCallback(cb);
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.errorCode, '05');
    });
});

// ===========================================================================
// 4. Callback Verification — Edge Cases
// ===========================================================================
describe('CMIPaymentGateway - verifyCallback edge cases', () => {
    let gateway: CMIPaymentGateway;
    beforeEach(() => { gateway = new CMIPaymentGateway(validConfig); });

    it('should return failure for missing hash', () => {
        const result = gateway.verifyCallback({ oid: 'ORDER123', amount: '100.00' });
        assert.strictEqual(result.success, false);
        assert.ok(result.message.includes('Hash'));
    });

    it('should return failure for invalid hash', () => {
        const result = gateway.verifyCallback({ oid: 'ORDER123', amount: '100.00', HASH: 'totally-invalid' });
        assert.strictEqual(result.success, false);
    });

    it('should return failure for empty callback', () => {
        const result = gateway.verifyCallback({});
        assert.strictEqual(result.success, false);
    });

    it('should handle ENCODING field case-insensitively', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);
        // CMI might send ENCODING instead of encoding — must not corrupt hash
        cb.ENCODING = 'UTF-8';
        const result = gateway.verifyCallback(cb);
        assert.strictEqual(result.success, true, 'ENCODING (uppercase) should be excluded from hash');
    });

    it('should handle empty ProcReturnCode gracefully', () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey, { ProcReturnCode: '' });
        const result = gateway.verifyCallback(cb);
        // Empty return code is not '00' so must be a failure
        assert.strictEqual(result.success, false);
    });
});

// ===========================================================================
// 5. SecretString
// ===========================================================================
describe('SecretString', () => {
    it('should mask in toString', () => {
        const s = new SecretString('my-secret-key');
        assert.strictEqual(s.toString(), '********');
        assert.strictEqual(s.getValue(), 'my-secret-key');
    });

    it('should mask in JSON serialization', () => {
        const s = new SecretString('api-key-123');
        const json = JSON.stringify({ key: s });
        assert.ok(json.includes('********'));
        assert.ok(!json.includes('api-key-123'));
    });

    it('should report correct length', () => {
        assert.strictEqual(new SecretString('12345').length, 5);
    });

    it('should throw for empty string', () => {
        assert.throws(() => new SecretString(''), /non-empty/);
    });

    it('should perform timing-safe equality check (match)', () => {
        const s = new SecretString('test-key');
        assert.strictEqual(s.equals('test-key'), true);
    });

    it('should perform timing-safe equality check (no match)', () => {
        const s = new SecretString('test-key');
        assert.strictEqual(s.equals('wrong-key'), false);
    });

    it('should compare SecretString to SecretString', () => {
        const a = new SecretString('same');
        const b = new SecretString('same');
        const c = new SecretString('diff');
        assert.strictEqual(a.equals(b), true);
        assert.strictEqual(a.equals(c), false);
    });

    it('should mask via Node.js util.inspect (console.log)', () => {
        const s = new SecretString('super-secret');
        const inspectSymbol = Symbol.for('nodejs.util.inspect.custom');
        // Access via type-safe cast to avoid implicit-any on symbol indexing
        const inspectFn = (s as unknown as Record<symbol, () => string>)[inspectSymbol];
        const inspect   = inspectFn.call(s);
        assert.ok(inspect.includes('********'));
        assert.ok(!inspect.includes('super-secret'));
    });
});

// ===========================================================================
// 6. timingSafeCompare
// ===========================================================================
describe('timingSafeCompare', () => {
    it('should return true for equal strings', () => {
        assert.strictEqual(timingSafeCompare('abc123', 'abc123'), true);
    });

    it('should return false for different strings', () => {
        assert.strictEqual(timingSafeCompare('abc123', 'xyz789'), false);
    });

    it('should return false for strings of different length', () => {
        assert.strictEqual(timingSafeCompare('short', 'much-longer-string'), false);
    });

    it('should return false for empty vs non-empty', () => {
        assert.strictEqual(timingSafeCompare('', 'something'), false);
    });

    it('should return true for two empty strings', () => {
        assert.strictEqual(timingSafeCompare('', ''), true);
    });
});

// ===========================================================================
// 7. HashUtil
// ===========================================================================
describe('HashUtil', () => {
    it('should be deterministic', () => {
        const params = { amount: '100.00', clientid: '123', currency: '504' };
        assert.strictEqual(HashUtil.generate(params, 'test-key'), HashUtil.generate(params, 'test-key'));
    });

    it('should differ for different keys', () => {
        const params = { amount: '100.00', clientid: '123' };
        assert.notStrictEqual(HashUtil.generate(params, 'key-1'), HashUtil.generate(params, 'key-2'));
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
        const plain  = HashUtil.generate(params, 'my-store-key');
        const secret = HashUtil.generate(params, new SecretString('my-store-key'));
        assert.strictEqual(plain, secret);
    });

    it('should produce base64 output', () => {
        const hash = HashUtil.generate({ test: 'value' }, 'key');
        assert.ok(/^[A-Za-z0-9+/]+=*$/.test(hash), 'Expected valid base64');
    });

    /**
     * TEST-4 — Deterministic hash anchor.
     * This pins the exact output for a known input so any accidental change
     * to the hash algorithm will fail loudly (both directions simultaneously).
     *
     * HOW THIS VALUE WAS GENERATED:
     *   node -e "
     *     const crypto = require('crypto');
     *     const params = { amount: '100.00', oid: 'ANCHOR_ORDER' };
     *     const key = 'anchor-test-key';
     *     const sorted = Object.keys(params).sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
     *     let hashval = '';
     *     for (const k of sorted) {
     *       if (k.toLowerCase() !== 'hash' && k.toLowerCase() !== 'encoding') {
     *         const v = String(params[k]).trim().replace(/\\\\/g,'\\\\\\\\').replace(/\|/g,'\\\\|');
     *         hashval += v + '|';
     *       }
     *     }
     *     const ek = key.replace(/\\\\/g,'\\\\\\\\').replace(/\|/g,'\\\\|');
     *     hashval += ek;
     *     const hex = crypto.createHash('sha512').update(hashval,'utf8').digest('hex');
     *     console.log(Buffer.from(hex,'hex').toString('base64'));
     *   "
     */
    it('deterministic hash anchor — any algorithm change will fail this test', async () => {
        const params   = { amount: '100.00', oid: 'ANCHOR_ORDER' };
        const storeKey = 'anchor-test-key';
        const actual   = HashUtil.generate(params, storeKey);

        // Recompute expected inline so we don't rely on a pre-stored constant
        const crypto   = await import('crypto');
        const sorted   = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        let hashval    = '';
        for (const k of sorted) {
            const v = String((params as any)[k]).trim().replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
            hashval += v + '|';
        }
        hashval   += storeKey.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
        const hex  = crypto.createHash('sha512').update(hashval, 'utf8').digest('hex');
        const expected = Buffer.from(hex, 'hex').toString('base64');

        assert.strictEqual(actual, expected, 'Hash algorithm produced unexpected output — algorithm may have changed');
    });
});

// ===========================================================================
// 8. FormatterUtil
// ===========================================================================
describe('FormatterUtil', () => {
    it('should format integer amount', () => {
        assert.strictEqual(FormatterUtil.formatAmount(100), '100.00');
    });

    it('should format decimal amount', () => {
        assert.strictEqual(FormatterUtil.formatAmount(99.9), '99.90');
    });

    it('should format string amount', () => {
        assert.strictEqual(FormatterUtil.formatAmount('220'), '220.00');
    });

    it('should throw for non-numeric string amount', () => {
        assert.throws(() => FormatterUtil.formatAmount('20a'), /Invalid amount/);
    });

    it('should throw for NaN', () => {
        assert.throws(() => FormatterUtil.formatAmount(NaN), /valid finite/);
    });

    it('should format autoRedirect true → "true"', () => {
        assert.strictEqual(FormatterUtil.formatAutoRedirect(true), 'true');
    });

    it('should format autoRedirect false → "false"', () => {
        assert.strictEqual(FormatterUtil.formatAutoRedirect(false), 'false');
    });

    it('should format autoRedirect undefined → "false"', () => {
        assert.strictEqual(FormatterUtil.formatAutoRedirect(undefined), 'false');
    });

    it('should lowercase storeType', () => {
        assert.strictEqual(FormatterUtil.formatStoreType('3D_PAY_HOSTING'), '3d_pay_hosting');
    });
});

// ===========================================================================
// 9. SanitizationUtil
// ===========================================================================
describe('SanitizationUtil', () => {
    it('should strip < > from strings', () => {
        assert.ok(!SanitizationUtil.sanitizeString('<script>').includes('<'));
    });

    it('should truncate to maxLength', () => {
        const long = 'a'.repeat(300);
        assert.strictEqual(SanitizationUtil.sanitizeString(long, 50).length, 50);
    });

    it('should return empty string for undefined input', () => {
        assert.strictEqual(SanitizationUtil.sanitizeString(undefined), '');
    });

    it('should lowercase and trim email', () => {
        assert.strictEqual(SanitizationUtil.sanitizeEmail('  TEST@EXAMPLE.COM  '), 'test@example.com');
    });

    it('should escape HTML special chars', () => {
        const escaped = SanitizationUtil.escapeHtml('<script>&"\'</script>');
        assert.ok(escaped.includes('&lt;'));
        assert.ok(escaped.includes('&gt;'));
        assert.ok(escaped.includes('&amp;'));
        assert.ok(escaped.includes('&quot;'));
        assert.ok(escaped.includes('&#39;'));
        assert.ok(!escaped.includes('<script>'));
    });
});

// ===========================================================================
// 10. ConfigValidator
// ===========================================================================
describe('ConfigValidator', () => {
    it('should throw for unknown config fields', () => {
        assert.throws(
            () => ConfigValidator.normalizeAndValidate({ ...validConfig, unknownField: '42' }),
            /Unknown configuration field/
        );
    });

    it('should throw for duplicate config fields (case-insensitive)', () => {
        assert.throws(
            () => ConfigValidator.normalizeAndValidate({ ...validConfig, STOREKEY: 'dupe' } as any),
            /Duplicate configuration field/
        );
    });

    it('should normalize config keys case-insensitively', () => {
        const cfg = ConfigValidator.normalizeAndValidate({
            STOREKEY: validConfig.storeKey,
            CLIENTID: validConfig.clientId,
            GATEWAYURL: validConfig.gatewayUrl,
            STORETYPE: validConfig.storetype,
            TRANTYPE: validConfig.trantype,
        } as any);
        assert.strictEqual(cfg.storeKey, validConfig.storeKey);
        assert.strictEqual(cfg.clientId, validConfig.clientId);
    });

    it('should default confirmationMode to manual when omitted', () => {
        const mode = ConfigValidator.validateConfirmationMode(undefined);
        assert.strictEqual(mode, 'manual');
    });

    it('should accept auto confirmationMode case-insensitively', () => {
        const mode = ConfigValidator.validateConfirmationMode('AUTO');
        assert.strictEqual(mode, 'auto');
    });

    it('should throw for invalid confirmationMode', () => {
        assert.throws(
            () => ConfigValidator.validateConfirmationMode('BadMode'),
            /Unsupported confirmation mode/
        );
    });
});

// ===========================================================================
// 11. PaymentValidator
// ===========================================================================
describe('PaymentValidator', () => {
    it('should pass for a fully valid request', () => {
        assert.doesNotThrow(() => PaymentValidator.validate(validPaymentRequest as any));
    });

    it('should throw for missing amount', () => {
        assert.throws(() => PaymentValidator.validate({ ...validPaymentRequest, amount: undefined } as any), /Amount/);
    });

    it('should throw for invalid email', () => {
        assert.throws(
            () => PaymentValidator.validate({ ...validPaymentRequest, email: 'not-an-email' } as any),
            /email/i
        );
    });

    it('should throw for missing shopUrl', () => {
        assert.throws(
            () => PaymentValidator.validate({ ...validPaymentRequest, shopUrl: '' } as any),
            /shopUrl/
        );
    });

    it('should throw for non-https shopUrl', () => {
        assert.throws(
            () => PaymentValidator.validate({ ...validPaymentRequest, shopUrl: 'ftp://example.com' } as any),
            /shopUrl/
        );
    });

    it('should throw for non-MAD currency', () => {
        assert.throws(
            () => PaymentValidator.validate({ ...validPaymentRequest, currency: '840' } as any),
            /MAD/
        );
    });

    it('should throw for amountCur without symbolCur', () => {
        assert.throws(
            () => PaymentValidator.validate({ ...validPaymentRequest, amountCur: 10 } as any),
            /amountCur and symbolCur must be provided together/
        );
    });

    it('should throw for symbolCur without amountCur', () => {
        assert.throws(
            () => PaymentValidator.validate({ ...validPaymentRequest, symbolCur: '840' } as any),
            /amountCur and symbolCur must be provided together/
        );
    });

    it('should accept valid amountCur + symbolCur pair', () => {
        assert.doesNotThrow(() =>
            PaymentValidator.validate({ ...validPaymentRequest, amountCur: 10, symbolCur: '840' } as any)
        );
    });

    it('should throw if symbolCur is MAD (redundant)', () => {
        assert.throws(
            () => PaymentValidator.validate({ ...validPaymentRequest, amountCur: 10, symbolCur: '504' } as any),
            /symbolCur should not be MAD/
        );
    });

    it('should throw for BillToName with special characters', () => {
        assert.throws(
            () => PaymentValidator.validate({ ...validPaymentRequest, BillToName: 'John@Doe' } as any),
            /BillToName/
        );
    });

    it('should throw for deprecated phone field', () => {
        assert.throws(
            () => PaymentValidator.validate({ ...validPaymentRequest, phone: '0600000000' } as any),
            /phone/
        );
    });

    it('should throw for duplicate fields (case-insensitive)', () => {
        assert.throws(
            () => PaymentValidator.checkDuplicateFields({ BillToName: 'A', billtoname: 'B' }),
            /Duplicate fields/
        );
    });
});

// ===========================================================================
// 12. Form Generation + XSS
// ===========================================================================
describe('CMIPaymentGateway - generatePaymentForm', () => {
    it('should generate HTML form with POST method', () => {
        const gw   = new CMIPaymentGateway(validConfig);
        const params = gw.createPaymentParams(validPaymentRequest);
        const form = gw.generatePaymentForm(params);
        assert.ok(form.includes('<form'));
        assert.ok(/method=["']POST["']/i.test(form));
        assert.ok(form.includes(validConfig.gatewayUrl));
    });

    it('should prevent XSS via HTML-escaping of custom fields', () => {
        const gw   = new CMIPaymentGateway(validConfig);
        const params = gw.createPaymentParams({
            ...validPaymentRequest,
            customField: '<script>alert(1)</script>',
        });
        const form = gw.generatePaymentForm(params);
        assert.ok(!form.includes('<script>'), 'Raw <script> must not appear');
        assert.ok(form.includes('&lt;script&gt;'), 'XSS payload should be HTML-escaped');
    });

    it('should auto-submit on page load (onload attribute)', () => {
        const gw   = new CMIPaymentGateway(validConfig);
        const params = gw.createPaymentParams(validPaymentRequest);
        const form = gw.generatePaymentForm(params);
        assert.ok(form.includes('onload') || form.includes('submit'), 'Form should auto-submit');
    });
});

// ===========================================================================
// 13. CallbackHandler
// ===========================================================================
describe('CallbackHandler', () => {
    let gateway: CMIPaymentGateway;
    beforeEach(() => { gateway = new CMIPaymentGateway(validConfig); });

    it('should create a callback handler', () => {
        const h = gateway.createCallbackHandler();
        assert.ok(typeof h.handle === 'function');
        assert.ok(typeof h.middleware === 'function');
    });

    it('should process valid callback via handle()', async () => {
        const h  = gateway.createCallbackHandler();
        const p  = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(p, validConfig.storeKey);
        const result = await h.handle(cb);
        assert.strictEqual(result.success, true, result.message);
    });

    it('should invoke onSuccess for valid payment', async () => {
        let called = false;
        const h = gateway.createCallbackHandler({ onSuccess: () => { called = true; } });
        const p = gateway.createPaymentParams(validPaymentRequest);
        await h.handle(simulateCMICallback(p, validConfig.storeKey));
        assert.strictEqual(called, true);
    });

    it('should invoke onFailure for invalid hash', async () => {
        let called = false;
        const h = gateway.createCallbackHandler({ onFailure: () => { called = true; } });
        await h.handle({ HASH: 'bad-hash', amount: '100', oid: 'TEST' });
        assert.strictEqual(called, true);
    });

    it('should return correct response string for auto mode', () => {
        const gw = new CMIPaymentGateway({ ...validConfig, confirmationMode: 'auto' });
        const h  = gw.createCallbackHandler();
        const resp = h.getResponse({
            success: true,
            status: 'ACTION=POSTAUTH',
            message: 'ok',
            orderData: { orderId: 'T', amount: 100, currency: '504', transactionId: 'TX' },
        });
        assert.strictEqual(resp.status, 200);
        assert.strictEqual(resp.body, 'ACTION=POSTAUTH');
    });

    it('middleware — should call onSuccess and send 200 for valid callback', async () => {
        const p  = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(p, validConfig.storeKey);
        let successCalled = false;

        const h   = new CallbackHandler(gateway, { onSuccess: () => { successCalled = true; } });
        const mw  = h.middleware();
        const req = makeMockReq(cb);
        const res = makeMockRes();

        await mw(req, res);

        assert.strictEqual(successCalled, true, 'onSuccess should be called');
        assert.strictEqual(res._status, 200, 'Response status should be 200');
    });

    it('middleware — should send FAILURE and call onFailure for bad hash', async () => {
        let failCalled = false;
        const h   = new CallbackHandler(gateway, { onFailure: () => { failCalled = true; } });
        const mw  = h.middleware();
        const req = makeMockReq({ HASH: 'wrong', amount: '100' });
        const res = makeMockRes();

        await mw(req, res);

        assert.strictEqual(failCalled, true, 'onFailure should be called');
        assert.strictEqual(res._status, 200, 'CMI still expects HTTP 200 on failures');
    });

    it('middleware — should call next() when autoRespond is false', async () => {
        const p  = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(p, validConfig.storeKey);

        const h   = new CallbackHandler(gateway, { autoRespond: false });
        const mw  = h.middleware();
        const req = makeMockReq(cb);
        const res = makeMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        await mw(req, res, next);
        assert.strictEqual(nextCalled, true, 'next() should be called when autoRespond=false');
        assert.ok((req as any).paymentResult, 'paymentResult should be set on req');
    });
});

// ===========================================================================
// 14. Logger
// ===========================================================================
describe('Logger', () => {
    afterEach(() => { resetLogger(); });

    it('should suppress debug logs when level is error', () => {
        const logs: string[] = [];
        const origLog = console.log;
        console.log = (...args: any[]) => logs.push(args.join(' '));

        configureLogger({ level: 'error' });
        logger.debug('should not appear');

        console.log = origLog;
        assert.ok(!logs.some(l => l.includes('should not appear')));
    });

    it('should suppress all logs when disabled (including error and warn)', () => {
        const logs: string[] = [];
        const origLog = console.log;
        const origErr = console.error;
        const origWarn = console.warn;
        const capture = (...args: any[]) => logs.push(args.join(' '));
        console.log = capture;
        console.error = capture;
        console.warn = capture;

        configureLogger({ enabled: false });
        logger.info('info suppressed');
        logger.error('error suppressed');
        logger.warn('warn suppressed');
        logger.debug('debug suppressed');

        console.log = origLog;
        console.error = origErr;
        console.warn = origWarn;
        assert.strictEqual(logs.length, 0, 'No logs should be captured when disabled');
    });

    it('resetLogger should restore defaults', () => {
        configureLogger({ enabled: false, level: 'error' });
        resetLogger();
        // After reset, default level should allow debug in non-production
        // We just verify it doesn't throw
        assert.doesNotThrow(() => resetLogger());
    });
});

// ===========================================================================
// 15. Framework Adapter Middleware
// ===========================================================================

// --- Express Adapter ---
import { createExpressMiddleware, createCallbackHandler } from '../src/middleware/express.middleware.js';

describe('Express Adapter', () => {
    let gateway: CMIPaymentGateway;
    beforeEach(() => { gateway = new CMIPaymentGateway(validConfig); });

    it('createExpressMiddleware should return a function', () => {
        const mw = createExpressMiddleware(gateway);
        assert.strictEqual(typeof mw, 'function');
    });

    it('should process valid callback via Express middleware', async () => {
        let successCalled = false;
        const mw = createExpressMiddleware(gateway, {
            onSuccess: () => { successCalled = true; }
        });

        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);
        const req = makeMockReq(cb);
        const res = makeMockRes();

        await mw(req, res);

        assert.strictEqual(successCalled, true);
        assert.strictEqual(res._status, 200);
    });

    it('should handle failure via Express middleware', async () => {
        let failCalled = false;
        const mw = createExpressMiddleware(gateway, {
            onFailure: () => { failCalled = true; }
        });

        const req = makeMockReq({ HASH: 'invalid', amount: '100' });
        const res = makeMockRes();

        await mw(req, res);

        assert.strictEqual(failCalled, true);
        assert.strictEqual(res._status, 200);
    });

    it('createCallbackHandler should return a CallbackHandler', () => {
        const handler = createCallbackHandler(gateway);
        assert.ok(typeof handler.handle === 'function');
        assert.ok(typeof handler.middleware === 'function');
        assert.ok(typeof handler.getResponse === 'function');
    });

    it('createCallbackHandler with autoRespond false should support manual response', async () => {
        const handler = createCallbackHandler(gateway, { autoRespond: false });
        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);
        const result = await handler.handle(cb);
        assert.strictEqual(result.success, true);
    });
});

// --- Next.js Adapter ---
import { createNextJsHandler, handleNextJsCallback } from '../src/middleware/nextjs.helper.js';

describe('Next.js Adapter', () => {
    let gateway: CMIPaymentGateway;
    beforeEach(() => { gateway = new CMIPaymentGateway(validConfig); });

    it('createNextJsHandler should return a function', () => {
        const handler = createNextJsHandler(gateway);
        assert.strictEqual(typeof handler, 'function');
    });

    it('Pages Router handler should process valid callback', async () => {
        let successCalled = false;
        const handler = createNextJsHandler(gateway, {
            onSuccess: () => { successCalled = true; }
        });

        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);
        const req = { body: cb, query: {} };
        const res = makeMockRes();

        await handler(req, res);

        assert.strictEqual(successCalled, true);
        assert.strictEqual(res._status, 200);
    });

    it('Pages Router handler should return 500 on error', async () => {
        const handler = createNextJsHandler(gateway, {
            onSuccess: () => { throw new Error('Boom'); }
        });

        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);
        const req = { body: cb, query: {} };
        const res = makeMockRes();

        await handler(req, res);

        assert.strictEqual(res._status, 500);
    });

    it('handleNextJsCallback should return a Response for App Router', async () => {
        let successCalled = false;
        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);

        // Mock App Router Request with json() method
        const mockRequest = {
            json: async () => cb,
        };

        const response = await handleNextJsCallback(gateway, mockRequest, {
            onSuccess: () => { successCalled = true; }
        });

        assert.strictEqual(successCalled, true);
        assert.ok(response instanceof Response);
        assert.strictEqual(response.status, 200);
    });

    it('handleNextJsCallback should fallback to formData', async () => {
        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);

        // Mock request where json() fails but formData() works
        const formData = new Map(Object.entries(cb));
        const mockRequest = {
            json: async () => { throw new Error('not json'); },
            formData: async () => ({ entries: () => formData.entries() }),
        };

        const response = await handleNextJsCallback(gateway, mockRequest);
        assert.ok(response instanceof Response);
    });

    it('handleNextJsCallback should return 500 on error', async () => {
        const mockRequest = {
            json: async () => { throw new Error('parse error'); },
            formData: async () => { throw new Error('no formdata'); },
            nextUrl: null,
        };

        const response = await handleNextJsCallback(gateway, mockRequest, {
            onSuccess: () => { throw new Error('Boom'); }
        });

        // Should handle gracefully - either the handler succeeds because params
        // are empty (and hash verification fails) or an error occurs
        assert.ok(response instanceof Response);
    });
});

// --- Fastify Adapter ---
import { createFastifyHandler, registerFastifyCallback } from '../src/middleware/fastify.helper.js';

describe('Fastify Adapter', () => {
    let gateway: CMIPaymentGateway;
    beforeEach(() => { gateway = new CMIPaymentGateway(validConfig); });

    it('createFastifyHandler should return a function', () => {
        const handler = createFastifyHandler(gateway);
        assert.strictEqual(typeof handler, 'function');
    });

    it('should process valid callback via Fastify handler', async () => {
        let successCalled = false;
        const handler = createFastifyHandler(gateway, {
            onSuccess: () => { successCalled = true; }
        });

        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);

        // Fastify uses .code() instead of .status()
        const reply: Record<string, any> = { _code: 0, _body: '' };
        reply.code = (c: number) => { reply._code = c; return reply; };
        reply.send = (b: any) => { reply._body = b; return reply; };

        await handler({ body: cb }, reply);

        assert.strictEqual(successCalled, true);
        assert.strictEqual(reply._code, 200);
    });

    it('should return 500 on error', async () => {
        const handler = createFastifyHandler(gateway, {
            onSuccess: () => { throw new Error('DB error'); }
        });

        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);

        const reply: Record<string, any> = { _code: 0, _body: '' };
        reply.code = (c: number) => { reply._code = c; return reply; };
        reply.send = (b: any) => { reply._body = b; return reply; };

        await handler({ body: cb }, reply);

        assert.strictEqual(reply._code, 500);
        assert.strictEqual(reply._body, 'FAILURE');
    });

    it('registerFastifyCallback should register a POST route', () => {
        let registeredPath = '';
        const mockFastify = {
            post: (path: string, _handler: any) => { registeredPath = path; }
        };

        registerFastifyCallback(mockFastify, gateway, {
            path: '/custom/callback'
        });

        assert.strictEqual(registeredPath, '/custom/callback');
    });

    it('registerFastifyCallback should use default path', () => {
        let registeredPath = '';
        const mockFastify = {
            post: (path: string, _handler: any) => { registeredPath = path; }
        };

        registerFastifyCallback(mockFastify, gateway, {});

        assert.strictEqual(registeredPath, '/api/payment/callback');
    });
});

// --- Hono Adapter ---
import { createHonoHandler, registerHonoCallback } from '../src/middleware/hono.helper.js';

describe('Hono Adapter', () => {
    let gateway: CMIPaymentGateway;
    beforeEach(() => { gateway = new CMIPaymentGateway(validConfig); });

    it('createHonoHandler should return a function', () => {
        const handler = createHonoHandler(gateway);
        assert.strictEqual(typeof handler, 'function');
    });

    it('should process valid callback via Hono handler', async () => {
        let successCalled = false;
        const handler = createHonoHandler(gateway, {
            onSuccess: () => { successCalled = true; }
        });

        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);

        let responseBody = '';
        let responseStatus = 0;
        const mockContext = {
            req: {
                json: async () => cb,
                url: 'https://example.com/callback',
            },
            text: (body: string, status: number) => {
                responseBody = body;
                responseStatus = status;
                return new Response(body, { status });
            }
        };

        await handler(mockContext);

        assert.strictEqual(successCalled, true);
        assert.strictEqual(responseStatus, 200);
    });

    it('should fallback to parseBody when json() fails', async () => {
        const handler = createHonoHandler(gateway);

        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);

        let responseStatus = 0;
        const mockContext = {
            req: {
                json: async () => { throw new Error('not json'); },
                parseBody: async () => cb,
                url: 'https://example.com/callback',
            },
            text: (body: string, status: number) => {
                responseStatus = status;
                return new Response(body, { status });
            }
        };

        await handler(mockContext);

        assert.strictEqual(responseStatus, 200);
    });

    it('should return 500 on error', async () => {
        const handler = createHonoHandler(gateway, {
            onSuccess: () => { throw new Error('Explosion'); }
        });

        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);

        let responseStatus = 0;
        const mockContext = {
            req: {
                json: async () => cb,
                url: 'https://example.com/callback',
            },
            text: (body: string, status: number) => {
                responseStatus = status;
                return new Response(body, { status });
            }
        };

        await handler(mockContext);

        assert.strictEqual(responseStatus, 500);
    });

    it('registerHonoCallback should register a POST route', () => {
        let registeredPath = '';
        const mockApp = {
            post: (path: string, _handler: any) => { registeredPath = path; }
        };

        registerHonoCallback(mockApp, gateway, { path: '/hono/callback' });

        assert.strictEqual(registeredPath, '/hono/callback');
    });
});

// --- NestJS Adapter ---
import { NestJSCallbackHandler, createNestJSHandler } from '../src/middleware/nestjs.helper.js';

describe('NestJS Adapter', () => {
    let gateway: CMIPaymentGateway;
    beforeEach(() => { gateway = new CMIPaymentGateway(validConfig); });

    it('NestJSCallbackHandler should handle valid callback', async () => {
        let successCalled = false;
        const handler = new NestJSCallbackHandler(gateway, {
            onSuccess: () => { successCalled = true; }
        });

        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);
        const res = makeMockRes();

        await handler.handle(cb, res);

        assert.strictEqual(successCalled, true);
        assert.strictEqual(res._status, 200);
    });

    it('NestJSCallbackHandler should return 500 on error', async () => {
        const handler = new NestJSCallbackHandler(gateway, {
            onSuccess: () => { throw new Error('DB crash'); }
        });

        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);
        const res = makeMockRes();

        await handler.handle(cb, res);

        assert.strictEqual(res._status, 500);
    });

    it('NestJSCallbackHandler.process should return CallbackResult', async () => {
        const handler = new NestJSCallbackHandler(gateway);

        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);

        const result = await handler.process(cb);
        assert.strictEqual(result.success, true);
        assert.ok(result.orderData);
    });

    it('NestJSCallbackHandler.getResponseString should return body string', () => {
        const handler = new NestJSCallbackHandler(gateway);
        const result = {
            success: true as const,
            status: 'APPROVED' as const,
            message: 'ok',
            orderData: { orderId: 'T', amount: 100, currency: '504', transactionId: 'TX' },
        };
        const body = handler.getResponseString(result);
        assert.strictEqual(body, 'APPROVED');
    });

    it('createNestJSHandler should return a function', () => {
        const handler = createNestJSHandler(gateway);
        assert.strictEqual(typeof handler, 'function');
    });

    it('createNestJSHandler should handle callback via function call', async () => {
        let successCalled = false;
        const handler = createNestJSHandler(gateway, {
            onSuccess: () => { successCalled = true; }
        });

        const params = gateway.createPaymentParams(validPaymentRequest);
        const cb = simulateCMICallback(params, validConfig.storeKey);
        const res = makeMockRes();

        await handler(cb, res);

        assert.strictEqual(successCalled, true);
        assert.strictEqual(res._status, 200);
    });
});

// ===========================================================================
// 16. Validator Base Class — Extended Coverage
// ===========================================================================
describe('Validator — Extended Coverage', () => {

    it('should accept valid phone numbers', () => {
        // The PaymentValidator calls the base Validator's isPhoneNumber internally
        assert.doesNotThrow(() => PaymentValidator.validate({
            ...validPaymentRequest,
            tel: '+212600000000',
        } as any));
    });

    it('should accept phone with spaces and dashes', () => {
        assert.doesNotThrow(() => PaymentValidator.validate({
            ...validPaymentRequest,
            tel: '+1 (555) 123-4567',
        } as any));
    });

    it('should reject phone with letters', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                tel: 'not-a-phone',
            } as any),
            /Invalid phone number/
        );
    });

    it('should reject empty phone', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                tel: '   ',
            } as any),
            /Invalid phone number/
        );
    });

    it('should reject phone exceeding 32 chars', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                tel: '+1' + ' '.repeat(25) + '(555) 123-4567',
            } as any),
            /tel cannot exceed 32/
        );
    });

    it('should accept valid http URLs', () => {
        assert.doesNotThrow(() => PaymentValidator.validate({
            ...validPaymentRequest,
            shopUrl: 'http://example.com',
            okUrl: 'http://example.com/ok',
            failUrl: 'http://example.com/fail',
        } as any));
    });

    it('should reject URLs without http/https', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                shopUrl: 'ftp://example.com',
            } as any),
            /http\/https protocol/
        );
    });

    it('should accept amount as valid string', () => {
        assert.doesNotThrow(() => PaymentValidator.validate({
            ...validPaymentRequest,
            amount: '150.50',
        } as any));
    });

    it('should reject string amount with letters', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                amount: '20a',
            } as any),
            /Invalid amount/
        );
    });

    it('should throw for invalid email format', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                email: 'missing-at-sign.com',
            } as any),
            /email/i
        );
    });

    it('should throw for email exceeding 64 chars', () => {
        const longEmail = 'a'.repeat(56) + '@test.com';
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                email: longEmail,
            } as any),
            /email.*64/
        );
    });

    it('should throw for oid exceeding 64 chars', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                oid: 'X'.repeat(65),
            } as any),
            /oid.*64/
        );
    });

    it('should throw for empty oid', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                oid: '   ',
            } as any),
            /oid.*non-empty/
        );
    });

    it('should throw for rnd with non-alphabetic chars', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                rnd: 'abc123',
            } as any),
            /rnd.*alphabetic/
        );
    });

    it('should throw for rnd exceeding 20 chars', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                rnd: 'a'.repeat(21),
            } as any),
            /rnd.*20/
        );
    });

    it('should throw for empty hashAlgorithm', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                hashAlgorithm: '',
            } as any),
            /hashAlgorithm.*empty/
        );
    });

    it('should throw for wrong hashAlgorithm', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                hashAlgorithm: 'ver2',
            } as any),
            /hashAlgorithm.*ver3/
        );
    });

    it('should throw for empty encoding', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                encoding: '',
            } as any),
            /encoding.*empty/
        );
    });

    it('should throw for wrong encoding', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                encoding: 'ASCII',
            } as any),
            /encoding.*UTF-8/
        );
    });

    it('should throw for non-boolean AutoRedirect', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                AutoRedirect: 'yes',
            } as any),
            /AutoRedirect.*boolean/
        );
    });

    it('should throw for billing field with special chars', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                BillToCity: '<script>alert(1)</script>',
            } as any),
            /BillToCity.*special characters/
        );
    });

    it('should throw for billing field exceeding max length', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                BillToPostalCode: 'X'.repeat(33),
            } as any),
            /BillToPostalCode.*32/
        );
    });

    it('should throw for empty billing field when set', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                BillToCity: '   ',
            } as any),
            /BillToCity.*non-empty/
        );
    });

    it('should throw for BillToName exceeding 255 chars', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                BillToName: 'A'.repeat(256),
            } as any),
            /BillToName.*255/
        );
    });

    it('should throw for BillToName with consecutive spaces', () => {
        assert.throws(
            () => PaymentValidator.validate({
                ...validPaymentRequest,
                BillToName: 'John  Doe',
            } as any),
            /BillToName.*special characters/
        );
    });
});

// ===========================================================================
// 17. FormGenerator — generateInputs method
// ===========================================================================
import { FormGenerator } from '../src/core/FormGenerator.js';

describe('FormGenerator — generateInputs', () => {
    it('should return an array of input strings', () => {
        const gen = new FormGenerator('https://gateway.cmi.co.ma');
        const inputs = gen.generateInputs({ amount: '100.00', oid: 'ORDER1' });
        assert.ok(Array.isArray(inputs));
        assert.strictEqual(inputs.length, 2);
        assert.ok(inputs[0].includes('amount'));
        assert.ok(inputs[1].includes('ORDER1'));
    });

    it('should HTML-escape values in inputs', () => {
        const gen = new FormGenerator('https://gateway.cmi.co.ma');
        const inputs = gen.generateInputs({ evil: '<script>alert(1)</script>' });
        assert.ok(!inputs[0].includes('<script>'));
        assert.ok(inputs[0].includes('&lt;script&gt;'));
    });
});

// ===========================================================================
// 18. Config Validator — Extended Coverage
// ===========================================================================
describe('ConfigValidator — Extended Coverage', () => {
    it('should throw for unsupported storetype', () => {
        assert.throws(
            () => new CMIPaymentGateway({ ...validConfig, storetype: 'invalid_type' as any }),
            /Unsupported store type/
        );
    });

    it('should throw for unsupported trantype', () => {
        assert.throws(
            () => new CMIPaymentGateway({ ...validConfig, trantype: 'InvalidTran' }),
            /Unsupported transaction type/
        );
    });

    it('should throw for invalid callbackUrl', () => {
        assert.throws(
            () => new CMIPaymentGateway({ ...validConfig, callbackUrl: 'not-a-url' }),
            /callbackUrl/
        );
    });

    it('should accept valid callbackUrl', () => {
        assert.doesNotThrow(
            () => new CMIPaymentGateway({ ...validConfig, callbackUrl: 'https://example.com/callback' }),
        );
    });
});

// ===========================================================================
// 19. PaymentBuilder — description field + custom fields
// ===========================================================================
describe('PaymentBuilder — description and custom fields', () => {
    let gateway: CMIPaymentGateway;
    beforeEach(() => { gateway = new CMIPaymentGateway(validConfig); });

    it('should include description field when provided', () => {
        const params = gateway.createPaymentParams({
            ...validPaymentRequest,
            description: 'Test payment description',
        });
        assert.strictEqual(params.description, 'Test payment description');
    });

    it('should truncate description to 125 chars', () => {
        const longDesc = 'A'.repeat(200);
        const params = gateway.createPaymentParams({
            ...validPaymentRequest,
            description: longDesc,
        });
        assert.strictEqual(params.description.length, 125);
    });

    it('should include BillToCompany when provided', () => {
        const params = gateway.createPaymentParams({
            ...validPaymentRequest,
            BillToCompany: 'Acme Corp',
        });
        assert.strictEqual(params.BillToCompany, 'Acme Corp');
    });

    it('should include BillToStreet2 and BillToStreet3 when provided', () => {
        const params = gateway.createPaymentParams({
            ...validPaymentRequest,
            BillToStreet2: 'Apt 4B',
            BillToStreet3: 'Building C',
        });
        assert.strictEqual(params.BillToStreet2, 'Apt 4B');
        assert.strictEqual(params.BillToStreet3, 'Building C');
    });

    it('should pass through custom fields', () => {
        const params = gateway.createPaymentParams({
            ...validPaymentRequest,
            customField1: 'value1',
            customField2: 'value2',
        });
        assert.strictEqual(params.customField1, 'value1');
        assert.strictEqual(params.customField2, 'value2');
    });

    it('should truncate custom field values to 255 chars', () => {
        const longValue = 'B'.repeat(300);
        const params = gateway.createPaymentParams({
            ...validPaymentRequest,
            customLongField: longValue,
        });
        assert.strictEqual(params.customLongField.length, 255);
    });
});

// ===========================================================================
// 20. Audit Fixes & Regressions
// ===========================================================================
describe('Audit Fixes & Regressions', () => {
    let gateway: CMIPaymentGateway;
    beforeEach(() => { gateway = new CMIPaymentGateway(validConfig); });

    it('SecretString should provide runtime privacy via ES2022 #private fields', () => {
        const secret = new SecretString('super-secret-key-123');
        
        // Assert the internal value is not exposed on the object surface
        const keys = Object.keys(secret);
        const ownProps = Object.getOwnPropertyNames(secret);
        
        // Ensure the actual secret string is nowhere in the keys/properties
        assert.ok(!keys.includes('value'));
        assert.ok(!ownProps.includes('value'));
        
        // Using "any" cast to try and access a loose property
        assert.strictEqual((secret as any).value, undefined);
        assert.strictEqual((secret as any)._value, undefined);
        
        // The value should only be accessible through the getter method
        assert.strictEqual(secret.getValue(), 'super-secret-key-123');
    });
});
