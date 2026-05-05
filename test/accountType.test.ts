import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { CMIPaymentGateway } from '../src/core/CMIPaymentGateway';

describe('Account Type Feature (Inshore/Offshore)', () => {
    const baseConfig = {
        storeKey: '123456',
        clientId: '600001',
        gatewayUrl: 'https://test.cmi.co.ma/fim/est3Dgate',
        storetype: '3D_PAY_HOSTING',
        trantype: 'PreAuth',
    };

    const validRequest = {
        amount: 100,
        email: 'test@example.com',
        BillToName: 'John Doe',
        okUrl: 'http://ok.com',
        failUrl: 'http://fail.com',
        shopUrl: 'http://shop.com',
        currency: 'MAD',
    };

    it('should default to inshore account', () => {
        const gw = new CMIPaymentGateway(baseConfig as any);
        assert.strictEqual((gw as any).config.accountType, 'inshore');
    });

    it('should accept offshore account config', () => {
        const gw = new CMIPaymentGateway({ ...baseConfig, accountType: 'offshore' } as any);
        assert.strictEqual((gw as any).config.accountType, 'offshore');
    });

    it('inshore should reject non-MAD currency', () => {
        const gw = new CMIPaymentGateway(baseConfig as any);
        assert.throws(
            () => gw.createPaymentParams({ ...validRequest, currency: 'USD' }),
            /Inshore accounts only accept MAD/
        );
    });

    it('offshore should accept non-MAD currency', () => {
        const gw = new CMIPaymentGateway({ ...baseConfig, accountType: 'offshore' } as any);
        const params = gw.createPaymentParams({ ...validRequest, currency: 'USD' });
        assert.strictEqual(params.currency, '840'); // USD numeric code
    });

    it('offshore should reject amountCur/symbolCur', () => {
        const gw = new CMIPaymentGateway({ ...baseConfig, accountType: 'offshore' } as any);
        assert.throws(
            () => gw.createPaymentParams({
                ...validRequest,
                currency: 'USD',
                amountCur: 100,
                symbolCur: 'EUR'
            }),
            /Offshore accounts cannot use amountCur or symbolCur/
        );
    });

    it('inshore should accept amountCur/symbolCur with MAD', () => {
        const gw = new CMIPaymentGateway(baseConfig as any);
        const params = gw.createPaymentParams({
            ...validRequest,
            currency: 'MAD',
            amountCur: 10,
            symbolCur: 'USD'
        });
        assert.strictEqual(params.amountCur, '10.00');
        assert.strictEqual(params.symbolCur, 'USD');
    });
});
