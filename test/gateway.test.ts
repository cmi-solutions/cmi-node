/**
 * CMI Payment Gateway - Basic Tests
 * 
 * Note: This is a minimal test file to allow npm publish.
 * Comprehensive tests should be added before production use.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Import the main class
import { CMIPaymentGateway } from '../src/core/CMIPaymentGateway.js';

describe('CMIPaymentGateway', () => {
    const validConfig = {
        storeKey: 'test-store-key-12345',
        clientId: '600000123',
        gatewayUrl: 'https://testpayment.cmi.co.ma/fim/est3Dgate',
        shopUrl: 'https://example.com',
        storetype: '3d_pay_hosting',
        trantype: 'PreAuth',
    };

    describe('constructor', () => {
        it('should create gateway with valid config', () => {
            const gateway = new CMIPaymentGateway(validConfig);
            assert.ok(gateway, 'Gateway should be created');
        });

        it('should throw error when storeKey is missing', () => {
            const invalidConfig = { ...validConfig, storeKey: '' };
            assert.throws(() => {
                new CMIPaymentGateway(invalidConfig);
            }, /storeKey/);
        });

        it('should throw error when clientId is missing', () => {
            const invalidConfig = { ...validConfig, clientId: '' };
            assert.throws(() => {
                new CMIPaymentGateway(invalidConfig);
            }, /clientId/);
        });
    });

    describe('createPaymentParams', () => {
        it('should create payment params with valid request', () => {
            const gateway = new CMIPaymentGateway(validConfig);
            const params = gateway.createPaymentParams({
                amount: 100,
                email: 'test@example.com',
                BillToName: 'Test User',
                okUrl: 'https://example.com/success',
                failUrl: 'https://example.com/failure',
                currency: '504',
            });

            assert.ok(params.hash, 'Hash should be generated');
            assert.strictEqual(params.amount, '100.00');
            assert.strictEqual(params.currency, '504');
        });

        it('should throw error for invalid amount', () => {
            const gateway = new CMIPaymentGateway(validConfig);
            assert.throws(() => {
                gateway.createPaymentParams({
                    amount: 0,
                    email: 'test@example.com',
                    BillToName: 'Test User',
                    okUrl: 'https://example.com/success',
                    failUrl: 'https://example.com/failure',
                    currency: '504',
                });
            }, /Amount/i);
        });
    });

    describe('getConfirmationMode', () => {
        it('should return default confirmation mode', () => {
            const gateway = new CMIPaymentGateway(validConfig);
            const mode = gateway.getConfirmationMode();
            assert.ok(['auto', 'manual'].includes(mode), 'Should be valid mode');
        });
    });

    describe('verifyCallback', () => {
        it('should return failure for missing hash', () => {
            const gateway = new CMIPaymentGateway(validConfig);
            const result = gateway.verifyCallback({
                oid: 'ORDER123',
                amount: '100.00',
            });

            assert.strictEqual(result.success, false);
            assert.ok(result.message.includes('Hash'), 'Should indicate hash issue');
        });
    });
});

describe('SecretString', () => {
    // Dynamic import to avoid TypeScript path issues in test
    it('should mask secret in toString', async () => {
        const { SecretString } = await import('../src/utils/secret-string.util.js');
        const secret = new SecretString('my-secret-key');

        assert.strictEqual(secret.toString(), '********');
        assert.strictEqual(secret.getValue(), 'my-secret-key');
    });

    it('should mask secret in JSON', async () => {
        const { SecretString } = await import('../src/utils/secret-string.util.js');
        const secret = new SecretString('api-key-123');
        const json = JSON.stringify({ key: secret });

        assert.ok(json.includes('********'), 'JSON should contain mask');
        assert.ok(!json.includes('api-key-123'), 'JSON should NOT contain actual secret');
    });
});
