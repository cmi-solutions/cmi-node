/**
 * Shared CC5 layer: building the request XML and reading CMI's CC5Response,
 * including hostile answers that must not freeze the process.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCC5Request, parseCC5Response, escapeXml, CC5XmlError } from '../../src/shared/cc5/xml.js';

// ================================================================ XML

describe('CC5 XML', () => {
  it('builds the request in order, escaping values', () => {
    const xml = buildCC5Request([
      ['Name', 'a&b'],
      ['Password', `<p'">`],
      ['Extra', [['ORDERSTATUS', 'QUERY']]],
    ]);
    assert.equal(
      xml,
      '<?xml version="1.0" encoding="UTF-8"?><CC5Request><Name>a&amp;b</Name>' +
        '<Password>&lt;p&apos;&quot;&gt;</Password><Extra><ORDERSTATUS>QUERY</ORDERSTATUS></Extra></CC5Request>',
    );
  });

  it('refuses control characters and bad element names', () => {
    assert.throws(() => escapeXml('a\u0001b'), CC5XmlError);
    assert.throws(() => buildCC5Request([['bad name', 'x']]), CC5XmlError);
  });

  it('reads top-level fields and Extra, decoding entities and keeping tabs', () => {
    const { fields, extra } = parseCC5Response(
      '<?xml version="1.0"?><!-- c --><CC5Response><ErrMsg>a &amp; b &#233; &#x41;</ErrMsg>' +
        '<Empty/><Data><![CDATA[<raw>]]></Data><Extra><TRX1>\n S\tC\t\t100 \n</TRX1></Extra></CC5Response>',
    );
    assert.equal(fields.ErrMsg, 'a & b é A');
    assert.equal(fields.Empty, '');
    assert.equal(fields.Data, '<raw>');
    assert.equal(extra.TRX1, 'S\tC\t\t100');
  });

  it("accepts the guide's spaced tags (< CC5Response>, </ ERRORCODE>)", () => {
    const { fields } = parseCC5Response('< CC5Response><ERRORCODE></ ERRORCODE><ErrMsg>x</ErrMsg></ CC5Response>');
    assert.equal(fields.ERRORCODE, '');
    assert.equal(fields.ErrMsg, 'x');
  });

  it('keeps "__proto__" as a plain key', () => {
    const { fields } = parseCC5Response('<CC5Response><__proto__>x</__proto__></CC5Response>');
    assert.equal(Object.getPrototypeOf(fields), null);
    assert.equal(fields.__proto__, 'x');
    assert.equal(({} as Record<string, unknown>).x, undefined);
  });

  for (const [name, xml] of [
    ['a DOCTYPE', '<!DOCTYPE x [<!ENTITY a "b">]><CC5Response/>'],
    ['mismatched tags', '<CC5Response><A></B></CC5Response>'],
    ['an unclosed element', '<CC5Response><A>x</CC5Response>'],
    ['another root', '<html><body/></html>'],
    ['two roots', '<CC5Response/><CC5Response/>'],
    ['plain text', 'Internal Server Error'],
    ['a stray "<"', '<CC5Response>a < b</CC5Response>'],
    ['a bad character reference', '<CC5Response><A>&#xFFFFFFF;</A></CC5Response>'],
  ]) {
    it(`refuses ${name}`, () => assert.throws(() => parseCC5Response(xml), CC5XmlError));
  }
});

// ================================================================ hostile answers
//
// A compromised server or a TLS-intercepting proxy could send a crafted answer. Reading
// it must stay linear: answers up to the 1 MB limit are read (or refused) in well under
// a second, so one answer can never block the Node process.

describe('CC5 reader on hostile answers (1 MB)', () => {
  const MB = 1024 * 1024;
  const cases: Array<[string, string]> = [
    ['a tag that never closes', '<CC5Response><a' + ' '.repeat(MB)],
    ['a value full of spaces', '<CC5Response><a>x' + ' '.repeat(MB - 40) + 'x</a></CC5Response>'],
    ['unclosed comments', '<CC5Response>' + '<!--'.repeat(MB / 4)],
    ['unclosed processing instructions', '<CC5Response>' + '<?'.repeat(MB / 2)],
    ['thousands of tags', '<CC5Response>' + '<a/>'.repeat(MB / 4) + '</CC5Response>'],
    ['deep nesting', '<CC5Response>' + '<a>'.repeat(MB / 8) + '</a>'.repeat(MB / 8) + '</CC5Response>'],
    ['many entities', '<CC5Response><a>' + '&amp;'.repeat(MB / 5) + '</a></CC5Response>'],
    ['a huge character reference', '<CC5Response><a>&#x' + '1'.repeat(MB - 40) + ';</a></CC5Response>'],
  ];
  for (const [name, xml] of cases) {
    it(`reads or refuses ${name} quickly`, () => {
      const started = performance.now();
      try {
        parseCC5Response(xml);
      } catch (error) {
        assert.ok(error instanceof CC5XmlError, String(error));
      }
      const ms = performance.now() - started;
      assert.ok(ms < 2000, `took ${ms.toFixed(0)} ms`);
    });
  }
});
