/**
 * API kit: the order status table, and CMIApiClient
 * against a fake CMI (an injected fetch, and a real local HTTP server for transport).
 * The sample answers are the ones in CMI's "API payment integration" guide V2.0.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { inspect } from 'node:util';
import { CMIApiClient, CMIApiError } from '../../src/index.js';
import {
  describeStatus,
  parseOrderStatusText,
  parseHistoryLine,
  historyLines,
  centsToAmount,
} from '../../src/kits/api/order-status.js';
import { configureLogger, resetLogger } from '../../src/shared/logger/index.js';

configureLogger({ enabled: false });

const PASSWORD = 'S3cret-API-Passw0rd!';
const config = {
  apiUrl: 'https://testpayment.cmi.co.ma/fim/api',
  clientId: '600000123',
  username: 'api_user',
  password: PASSWORD,
};

// ---------------------------------------------------------------- CMI samples (guide V2.0)

const POSTAUTH_APPROVED = `<CC5Response>
    <OrderId>ORDER12345</OrderId>
    <GroupId>ORDER12345</GroupId>
    <Response>Approved</Response>
    <AuthCode>332816</AuthCode>
    <HostRefNum>720114004948</HostRefNum>
    <ProcReturnCode>00</ProcReturnCode>
    <TransId>17201OSAE17750</TransId>
    <ErrMsg/>
    <Extra>
    <SETTLEID>1</SETTLEID>
    <TRXDATE>20170520 14:18:00</TRXDATE>
    <ERRORCODE/>
    <CARDBRAND>VISA</CARDBRAND>
    <CARDISSUER>CDM</CARDISSUER>
    <NUMCODE>00</NUMCODE>
    </Extra>
</CC5Response>`;

const ORDER_STATUS = `<CC5Response>
      <ErrMsg>Record(s) found for ORDER-17201OMPE17203</ErrMsg>
      <ProcReturnCode>00</ProcReturnCode>
      <Response>Approved</Response>
      <OrderId>ORDER12345</OrderId>
      <TransId>17201OSAE17750</TransId>
      <Extra>
      <AUTH_CODE>332816</AUTH_CODE>
      <HOST_REF_NUM>720114004948</HOST_REF_NUM>
      <CAVV_3D/>
      <AUTH_DTTM>2017-05-20 14:18:00.427</AUTH_DTTM>
      <MDSTATUS/>
      <ORD_ID>ORDER-17201OMPE17203</ORD_ID>
      <TRANS_ID>17201OSAE17750</TRANS_ID>
      <CHARGE_TYPE_CD>S</CHARGE_TYPE_CD>
      <SETTLEID/>
      <TRANS_STAT>C</TRANS_STAT>
      <CAPTURE_DTTM>2017-05-20 14:18:00.427</CAPTURE_DTTM>
      <ORIG_TRANS_AMT>10000</ORIG_TRANS_AMT>
      <CAPTURE_AMT>10000</CAPTURE_AMT>
      <XID_3D/>
      <HOSTDATE>0520-141800</HOSTDATE>
      <PROC_RET_CD>00</PROC_RET_CD>
      <ECI_3D/>
      <ORDERSTATUS>
     ORD_ID:ORDER-17201OMPE17203 CHARGE_TYPE_CD:S ORIG_TRANS_AMT:10000
     CAPTURE_AMT:10000 TRANS_STAT:C AUTH_DTTM:2017-05-20 14:18:00.427
     CAPTURE_DTTM:2017-05-20 14:18:00.427 AUTH_CODE:332816
     TRANS_ID:17201OSAE17750
     </ORDERSTATUS>
     <PAN>4000 00** **** 0010</PAN>
     <NUMCODE>0</NUMCODE>
     </Extra>
</CC5Response>`;

const ORDER_HISTORY = `<CC5Response>
    <ErrMsg/>
    <ProcReturnCode>00</ProcReturnCode>
    <Response>Approved</Response>
    <OrderId>ORDER-17201OMPE17203</OrderId>
    <Extra>
    <TRX1>
     C V 10000 10000 2017-05-20 14:20:15.118 2017-05-20 14:20:15.118 2017-05-20
     14:22:21.238 720114004948 217255 00 17201OUPB17934
    </TRX1>
    <TRXCOUNT>2</TRXCOUNT>
    <NUMCODE>0</NUMCODE>
    <TRX2>
     S C 10000 10000 2017-05-20 14:18:00.427 2017-05-20 14:18:00.427
     720114004948 332816 00 17201OSAE17750
     </TRX2>
     </Extra>
</CC5Response>`;

const DECLINED = `<?xml version="1.0" encoding="UTF-8"?>
<CC5Response><OrderId>ORDER12345</OrderId><Response>Error</Response>
<ProcReturnCode>99</ProcReturnCode><ErrMsg>Montant du remboursement depasse le montant capture</ErrMsg>
<Extra><ERRORCODE>CORE-2509</ERRORCODE><NUMCODE>992509</NUMCODE></Extra></CC5Response>`;

const NOT_FOUND = `<CC5Response><ErrMsg>No record found for ORDER-X</ErrMsg><ProcReturnCode>99</ProcReturnCode>
<Response>Error</Response><Extra><NUMCODE>99</NUMCODE></Extra></CC5Response>`;

// ---------------------------------------------------------------- fake fetch

interface Sent {
  url: string;
  init: RequestInit;
  xml: string;
}

function fakeFetch(answer: string | (() => Response | Promise<Response>), sent: Sent[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const body = String(init?.body ?? '');
    sent.push({ url: String(url), init: init ?? {}, xml: new URLSearchParams(body).get('DATA') ?? '' });
    if (typeof answer === 'function') return answer();
    return new Response(answer, { status: 200, headers: { 'Content-Type': 'text/xml; charset=UTF-8' } });
  }) as typeof fetch;
}

function client(answer: string | (() => Response | Promise<Response>), sent: Sent[] = [], extra = {}) {
  return new CMIApiClient({ ...config, fetch: fakeFetch(answer, sent), ...extra });
}

/** Text of one element of the request XML. */
function tag(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];
}

// ================================================================ statuses

describe('order statuses', () => {
  it('follows CMI\'s status table', () => {
    const cases: Array<[string, string, string, boolean, boolean]> = [
      ['D', 'S', 'declined', false, false],
      ['A', 'S', 'preauthorized', false, false],
      ['C', 'S', 'captured', true, false],
      ['S', 'S', 'settled', true, false],
      ['C', 'C', 'refunded', false, false],
      ['S', 'C', 'refunded', false, false],
      ['V', 'S', 'voided', false, false],
      ['PN', 'S', 'pending', false, true],
      ['R', 'S', 'reversal_required', false, true],
      ['NW', 'C', 'processing', false, true],
      ['ERR', 'S', 'error', false, false],
      ['CNCL', 'S', 'cancelled', false, false],
      ['ZZ', 'S', 'unknown', false, false],
    ];
    for (const [code, charge, status, ship, transient] of cases) {
      assert.deepEqual(describeStatus(code, charge), { status, shipmentPossible: ship, transient }, `${code}/${charge}`);
    }
  });

  it('converts amounts from cents', () => {
    assert.equal(centsToAmount('9196'), 91.96);
    assert.equal(centsToAmount(' 10000 '), 100);
    assert.equal(centsToAmount(''), undefined);
    assert.equal(centsToAmount('12.5'), undefined);
  });

  it('reads ORDERSTATUS name:value text, dates included', () => {
    const pairs = parseOrderStatusText(
      'ORD_ID:ORDER-1\tCHARGE_TYPE_CD:S AUTH_DTTM:2017-05-20 14:18:00.427 AUTH_CODE:332816 SETTLEID:',
    );
    assert.equal(pairs.ORD_ID, 'ORDER-1');
    assert.equal(pairs.AUTH_DTTM, '2017-05-20 14:18:00.427');
    assert.equal(pairs.AUTH_CODE, '332816');
    assert.equal(pairs.SETTLEID, '');
  });

  it('reads a 1 MB ORDERSTATUS text quickly', () => {
    const started = performance.now();
    parseOrderStatusText('ORD_ID:x' + ' '.repeat(512 * 1024) + 'y TRANS_STAT:C ' + 'A'.repeat(512 * 1024));
    assert.ok(performance.now() - started < 2000);
  });

  it('reads a tab-separated history line, empty columns included', () => {
    const line = ['S', 'C', '10000', '5000', '2017-05-20 14:18:00.4', '2017-05-20 14:19:00.4', '', '7201', '332816', '00', 'T1', '1'].join('\t');
    const entry = parseHistoryLine(line);
    assert.equal(entry.status, 'captured');
    assert.equal(entry.originalAmount, 100);
    assert.equal(entry.capturedAmount, 50);
    assert.equal(entry.capturedAt, '2017-05-20 14:19:00.4');
    assert.equal(entry.voidedAt, undefined);
    assert.equal(entry.hostRefNum, '7201');
    assert.equal(entry.transId, 'T1');
    assert.equal(entry.settleId, '1');
  });

  it('reads history lines whose tabs became spaces (as in the guide)', () => {
    const three = parseHistoryLine(
      'C V 10000 10000 2017-05-20 14:20:15.118 2017-05-20 14:20:15.118 2017-05-20\n 14:22:21.238 720114004948 217255 00 17201OUPB17934',
    );
    assert.equal(three.status, 'voided');
    assert.equal(three.voidedAt, '2017-05-20 14:22:21.238');
    assert.equal(three.hostRefNum, '720114004948');
    assert.equal(three.transId, '17201OUPB17934');

    const two = parseHistoryLine('S C 200000 200000 2017-07-19 14:37:46.75 2017-07-19 14:37:46.75 720014004885 939164 00 17200OluB17066');
    assert.equal(two.status, 'captured');
    assert.equal(two.originalAmount, 2000);
    assert.equal(two.voidedAt, undefined);
    assert.equal(two.authCode, '939164');
    assert.equal(two.hostReturnCode, '00');
  });

  it('orders TRXn lines by number', () => {
    assert.deepEqual(historyLines({ TRX10: 'j', TRX2: 'b', TRXCOUNT: '3', TRX1: 'a', TRX3: '' }), ['a', 'b', 'j']);
  });
});

// ================================================================ client: requests and results

describe('CMIApiClient operations', () => {
  it('posts DATA=<CC5Request> with the credentials, form-encoded, refusing redirects', async () => {
    const sent: Sent[] = [];
    await client(POSTAUTH_APPROVED, sent).postAuth({ orderId: 'ORDER12345' });
    const [{ url, init, xml }] = sent;
    assert.equal(url, config.apiUrl);
    assert.equal(init.method, 'POST');
    assert.equal((init.headers as Record<string, string>)['Content-Type'], 'application/x-www-form-urlencoded; charset=UTF-8');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><CC5Request><Name>api_user</Name>'));
    assert.equal(tag(xml, 'Password'), PASSWORD);
    assert.equal(tag(xml, 'ClientId'), '600000123');
    assert.equal(tag(xml, 'Type'), 'PostAuth');
    assert.equal(tag(xml, 'OrderId'), 'ORDER12345');
    assert.equal(tag(xml, 'Total'), undefined, 'a full capture sends no Total');
  });

  it('returns an approved capture with its details', async () => {
    const result = await client(POSTAUTH_APPROVED).postAuth({ orderId: 'ORDER12345' });
    assert.equal(result.approved, true);
    assert.equal(result.response, 'Approved');
    assert.equal(result.procReturnCode, '00');
    assert.equal(result.message, undefined);
    assert.equal(result.errorCode, undefined);
    assert.equal(result.orderId, 'ORDER12345');
    assert.equal(result.transId, '17201OSAE17750');
    assert.equal(result.authCode, '332816');
    assert.equal(result.hostRefNum, '720114004948');
    assert.equal(result.settleId, '1');
    assert.equal(result.transactionDate, '20170520 14:18:00');
    assert.equal(result.cardBrand, 'VISA');
    assert.equal(result.cardIssuer, 'CDM');
    assert.equal(result.extra.NUMCODE, '00');
  });

  it('sends a partial capture amount rounded to the cent', async () => {
    const sent: Sent[] = [];
    await client(POSTAUTH_APPROVED, sent).postAuth({ orderId: 'O-1', amount: '1.155' });
    assert.equal(tag(sent[0].xml, 'Total'), '1.16');
  });

  it('refunds: Credit with Total and Currency, or a full refund without them', async () => {
    const sent: Sent[] = [];
    const api = client(POSTAUTH_APPROVED, sent);
    await api.refund({ orderId: 'O-1', amount: 0.15 });
    await api.refund({ orderId: 'O-1', amount: 10, currency: 'mad' });
    await api.refund({ orderId: 'O-1' });
    assert.equal(tag(sent[0].xml, 'Type'), 'Credit');
    assert.equal(tag(sent[0].xml, 'Total'), '0.15');
    assert.equal(tag(sent[0].xml, 'Currency'), '504');
    assert.equal(tag(sent[1].xml, 'Currency'), '504');
    assert.equal(tag(sent[2].xml, 'Total'), undefined);
    assert.equal(tag(sent[2].xml, 'Currency'), undefined);
    await assert.rejects(api.refund({ orderId: 'O-1', amount: 1, currency: 'XYZ' }), /Unsupported currency/);
  });

  it('refuses a currency without an amount (it would be ignored)', async () => {
    const sent: Sent[] = [];
    await assert.rejects(client(POSTAUTH_APPROVED, sent).refund({ orderId: 'O-1', currency: 'MAD' }), /currency is only used with amount/);
    assert.equal(sent.length, 0);
  });

  it('voids', async () => {
    const sent: Sent[] = [];
    const result = await client(POSTAUTH_APPROVED, sent).void({ orderId: 'O-1' });
    assert.equal(tag(sent[0].xml, 'Type'), 'Void');
    assert.equal(result.approved, true);
  });

  it('returns a refusal as a result, not an exception', async () => {
    const result = await client(DECLINED).refund({ orderId: 'ORDER12345', amount: 999 });
    assert.equal(result.approved, false);
    assert.equal(result.response, 'Error');
    assert.equal(result.procReturnCode, '99');
    assert.equal(result.errorCode, 'CORE-2509');
    assert.match(result.message ?? '', /depasse/);
  });

  it('is not approved when Response=Approved comes with another return code', async () => {
    const result = await client('<CC5Response><Response>Approved</Response><ProcReturnCode>05</ProcReturnCode></CC5Response>').void({ orderId: 'O' });
    assert.equal(result.approved, false);
  });

  it('validates the order id and amounts before calling CMI', async () => {
    const sent: Sent[] = [];
    const api = client(POSTAUTH_APPROVED, sent);
    await assert.rejects(api.void({ orderId: '' }), /orderId is required/);
    await assert.rejects(api.void({ orderId: 'x'.repeat(65) }), /at most 64/);
    await assert.rejects(api.void({ orderId: 'a\nb' }), /control characters/);
    await assert.rejects(api.orderStatus(undefined as unknown as string), /orderId is required/);
    await assert.rejects(api.postAuth({ orderId: 'O', amount: 0 }), /greater than 0/);
    await assert.rejects(api.refund({ orderId: 'O', amount: '-5' }), /greater than 0/);
    await assert.rejects(api.refund({ orderId: 'O', amount: '0.004' }), /greater than 0/);
    await assert.rejects(api.postAuth({ orderId: 'O', amount: '1,5' }), /Invalid amount/);
    assert.equal(sent.length, 0);
  });

  it('reads an order status (guide sample)', async () => {
    const sent: Sent[] = [];
    const result = await client(ORDER_STATUS, sent).orderStatus('ORDER12345');
    assert.equal(tag(sent[0].xml, 'ORDERSTATUS'), 'QUERY');
    assert.equal(tag(sent[0].xml, 'Type'), undefined);
    assert.equal(result.found, true);
    assert.equal(result.message, 'Record(s) found for ORDER-17201OMPE17203');
    assert.equal(result.maskedPan, '4000 00** **** 0010');
    const t = result.transaction!;
    assert.equal(t.status, 'captured');
    assert.equal(t.statusCode, 'C');
    assert.equal(t.chargeType, 'S');
    assert.equal(t.shipmentPossible, true);
    assert.equal(t.transient, false);
    assert.equal(t.originalAmount, 100);
    assert.equal(t.capturedAmount, 100);
    assert.equal(t.authorizedAt, '2017-05-20 14:18:00.427');
    assert.equal(t.authCode, '332816');
    assert.equal(t.hostReturnCode, '00');
    assert.equal(t.transId, '17201OSAE17750');
    assert.equal(t.settleId, undefined);
  });

  it('falls back on the ORDERSTATUS text when the separate elements are missing', async () => {
    const xml = `<CC5Response><ProcReturnCode>00</ProcReturnCode><Response>Approved</Response><Extra>
      <ORDERSTATUS>ORD_ID:O-1\tCHARGE_TYPE_CD:S\tORIG_TRANS_AMT:9196\tCAPTURE_AMT:0\tTRANS_STAT:A\tAUTH_DTTM:2016-02-25 16:56:06.995</ORDERSTATUS>
      </Extra></CC5Response>`;
    const t = (await client(xml).orderStatus('O-1')).transaction!;
    assert.equal(t.status, 'preauthorized');
    assert.equal(t.originalAmount, 91.96);
    assert.equal(t.capturedAmount, 0);
    assert.equal(t.authorizedAt, '2016-02-25 16:56:06.995');
  });

  it('reports an unknown order as not found', async () => {
    const status = await client(NOT_FOUND).orderStatus('ORDER-X');
    assert.equal(status.found, false);
    assert.equal(status.transaction, undefined);
    const history = await client(NOT_FOUND).orderHistory('ORDER-X');
    assert.equal(history.found, false);
    assert.deepEqual(history.transactions, []);
  });

  it('reads an order history (guide sample)', async () => {
    const sent: Sent[] = [];
    const result = await client(ORDER_HISTORY, sent).orderHistory('ORDER-17201OMPE17203');
    assert.equal(tag(sent[0].xml, 'ORDERHISTORY'), 'QUERY');
    assert.equal(result.found, true);
    assert.equal(result.transactions.length, 2);
    const [voidedRefund, capture] = result.transactions;
    assert.equal(voidedRefund.chargeType, 'C');
    assert.equal(voidedRefund.status, 'voided');
    assert.equal(voidedRefund.voidedAt, '2017-05-20 14:22:21.238');
    assert.equal(capture.status, 'captured');
    assert.equal(capture.capturedAmount, 100);
    assert.equal(capture.authCode, '332816');
    assert.ok(capture.raw.startsWith('S C 10000'));
  });
});

// ================================================================ client: failures and secrecy

describe('CMIApiClient failures', () => {
  const expectApiError = async (promise: Promise<unknown>, code: string) => {
    const error = await promise.then(
      () => assert.fail('expected a CMIApiError'),
      (e: unknown) => e,
    );
    assert.ok(error instanceof CMIApiError, String(error));
    assert.equal(error.code, code);
    assert.ok(!error.message.includes(PASSWORD));
    return error;
  };

  it('HTTP_STATUS on a non-2xx answer', async () => {
    const error = await expectApiError(
      client(() => new Response('oops', { status: 503 })).orderStatus('O'),
      'HTTP_STATUS',
    );
    assert.equal(error.status, 503);
    assert.equal(error.operation, 'orderStatus');
  });

  it('INVALID_RESPONSE when the answer is not a CC5Response', async () => {
    await expectApiError(client('<html>login</html>').void({ orderId: 'O' }), 'INVALID_RESPONSE');
    await expectApiError(client('not xml at all <').void({ orderId: 'O' }), 'INVALID_RESPONSE');
  });

  it('NETWORK when fetch fails, TIMEOUT when it times out', async () => {
    await expectApiError(
      client(() => Promise.reject(new TypeError('fetch failed'))).postAuth({ orderId: 'O' }),
      'NETWORK',
    );
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    await expectApiError(client(() => Promise.reject(timeout)).refund({ orderId: 'O' }), 'TIMEOUT');
  });

  it('never retries', async () => {
    let calls = 0;
    await expectApiError(
      client(() => {
        calls++;
        return Promise.reject(new TypeError('fetch failed'));
      }).refund({ orderId: 'O', amount: 1 }),
      'NETWORK',
    );
    assert.equal(calls, 1);
  });

  it('keeps the password out of logs, JSON and inspect output', async () => {
    const lines: string[] = [];
    const sink = { debug: (l: unknown) => lines.push(String(l)), info: () => {}, warn: (l: unknown) => lines.push(String(l)), error: () => {} };
    configureLogger({ enabled: true, level: 'debug', sink });
    try {
      const api = client(DECLINED);
      await api.refund({ orderId: 'O', amount: 1 });
      await client(() => new Response('x', { status: 500 })).void({ orderId: 'O' }).catch(() => {});
      assert.ok(lines.length >= 2);
      for (const line of [...lines, JSON.stringify(api), inspect(api), String(api)]) {
        assert.ok(!line.includes(PASSWORD), line);
      }
      assert.match(inspect(api), /password: '\*{8}'/);
    } finally {
      resetLogger();
      configureLogger({ enabled: false });
    }
  });
});

// ================================================================ configuration

describe('CMIApiClient configuration', () => {
  it('accepts https, and http only for localhost', () => {
    assert.doesNotThrow(() => new CMIApiClient(config));
    assert.doesNotThrow(() => new CMIApiClient({ ...config, apiUrl: 'http://127.0.0.1:8080/fim/api' }));
    assert.throws(() => new CMIApiClient({ ...config, apiUrl: 'http://testpayment.cmi.co.ma/fim/api' }), /https/);
    assert.throws(() => new CMIApiClient({ ...config, apiUrl: 'ftp://x' }), /https/);
  });

  it('requires the credentials and checks their sizes', () => {
    assert.throws(() => new CMIApiClient({ ...config, password: '' }), /password is required/);
    assert.throws(() => new CMIApiClient({ ...config, username: ' ' }), /username is required/);
    assert.throws(() => new CMIApiClient({ ...config, clientId: '1234567890123456' }), /clientId must be at most 15/);
    assert.throws(() => new CMIApiClient({ ...config, password: 'p'.repeat(256) }), /at most 255/);
    assert.throws(() => new CMIApiClient(undefined as never), /configuration object/);
  });

  it('refuses control characters in the credentials when the client is created', () => {
    const tab = String.fromCharCode(9), bell = String.fromCharCode(7), lf = String.fromCharCode(10);
    for (const [field, value] of [['username', 'api' + lf + 'user'], ['password', 'pass' + bell + 'word'], ['password', 'pass' + tab], ['clientId', '6000' + tab + '1']]) {
      assert.throws(
        () => new CMIApiClient({ ...config, [field]: value }),
        (e: unknown) => e instanceof Error && e.message.startsWith(`${field} must not contain control characters`) && !e.message.includes(value),
        field,
      );
    }
    assert.doesNotThrow(() => new CMIApiClient({ ...config, password: ' spaces around are kept ' }));
  });

  it('checks the timeout', () => {
    assert.throws(() => new CMIApiClient({ ...config, timeoutMs: 0 }), /timeoutMs/);
    assert.throws(() => new CMIApiClient({ ...config, timeoutMs: 1.5 }), /timeoutMs/);
    assert.throws(() => new CMIApiClient({ ...config, timeoutMs: 400_000 }), /timeoutMs/);
  });

  it('refuses to run in a browser', () => {
    const g = globalThis as { window?: unknown; document?: unknown };
    g.window = {};
    g.document = {};
    try {
      assert.throws(() => new CMIApiClient(config), /server-only/);
    } finally {
      delete g.window;
      delete g.document;
    }
  });
});

// ================================================================ real HTTP transport

describe('CMIApiClient over HTTP', () => {
  let server: http.Server;
  let base = '';
  const received: string[] = [];

  before(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push(body);
        switch (req.url) {
          case '/ok':
            res.writeHead(200, { 'Content-Type': 'text/xml' }).end(POSTAUTH_APPROVED);
            break;
          case '/latin1':
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.end(Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><CC5Response><ErrMsg>Montant érroné</ErrMsg></CC5Response>', 'latin1'));
            break;
          case '/huge':
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.end('<CC5Response>' + 'x'.repeat(1024 * 1024 + 10) + '</CC5Response>');
            break;
          case '/redirect':
            res.writeHead(307, { Location: '/ok' }).end();
            break;
          case '/stall':
            // Headers and part of the answer, then nothing: the deadline passes while reading.
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.write('<CC5Response><Response>Appr');
            return;
          case '/slow':
            setTimeout(() => res.writeHead(200).end(POSTAUTH_APPROVED), 500);
            break;
          default:
            res.writeHead(404).end();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const at = (path: string, extra = {}) => new CMIApiClient({ ...config, apiUrl: base + path, ...extra });

  it('sends a form-encoded DATA field and reads the answer', async () => {
    const result = await at('/ok').postAuth({ orderId: 'ORDER 1&2' });
    assert.equal(result.approved, true);
    const data = new URLSearchParams(received.at(-1)).get('DATA') ?? '';
    assert.equal(tag(data, 'OrderId'), 'ORDER 1&amp;2');
  });

  it('decodes an ISO-8859-1 answer', async () => {
    const result = await at('/latin1').orderStatus('O');
    assert.equal(result.message, 'Montant érroné');
  });

  it('refuses an answer over 1 MB', async () => {
    await assert.rejects(at('/huge').orderStatus('O'), (e: unknown) => e instanceof CMIApiError && e.code === 'INVALID_RESPONSE' && /too large/.test(e.message));
  });

  it('does not follow redirects (the credentials stay with the configured URL)', async () => {
    const before = received.length;
    await assert.rejects(at('/redirect').void({ orderId: 'O' }), (e: unknown) => e instanceof CMIApiError && e.code === 'NETWORK');
    assert.equal(received.length, before + 1, 'only the first request was sent');
  });

  it('times out', async () => {
    await assert.rejects(
      at('/slow', { timeoutMs: 50 }).orderStatus('O'),
      (e: unknown) => e instanceof CMIApiError && e.code === 'TIMEOUT' && /50 ms/.test(e.message),
    );
  });

  it('reports TIMEOUT when the answer stops arriving halfway', async () => {
    await assert.rejects(
      at('/stall', { timeoutMs: 200 }).postAuth({ orderId: 'O' }),
      (e: unknown) => e instanceof CMIApiError && e.code === 'TIMEOUT' && e.operation === 'postAuth',
    );
  });
});
