// CC5 XML: the request builder and a small reader for CMI's CC5Response.
//
// CMI's responses are flat: a <CC5Response> root, simple elements, and one <Extra>
// element whose children are simple elements too. The reader below handles exactly
// that shape, with no external XML library. It refuses DOCTYPE and entity
// declarations, so no entity expansion (XXE, "billion laughs") can happen.

/** Thrown when a CMI answer is not a readable CC5Response. */
export class CC5XmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CC5XmlError';
  }
}

/** One request element: a text value or nested elements, in order. */
export type CC5Node = string | ReadonlyArray<readonly [string, CC5Node]>;

const ELEMENT_NAME = /^[A-Za-z_][\w.-]*$/;
// Control characters XML 1.0 does not allow (tab, line feed and carriage return are allowed).
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

/** Escapes text for an XML element. */
export function escapeXml(value: string): string {
  if (INVALID_XML_CHARS.test(value)) {
    throw new CC5XmlError('A request value contains a control character that XML does not allow.');
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function writeNode(name: string, node: CC5Node): string {
  if (!ELEMENT_NAME.test(name)) throw new CC5XmlError(`Invalid XML element name: ${name}`);
  if (typeof node === 'string') return `<${name}>${escapeXml(node)}</${name}>`;
  return `<${name}>${node.map(([child, value]) => writeNode(child, value)).join('')}</${name}>`;
}

/** Builds `<?xml ...?><CC5Request>...</CC5Request>` from ordered elements. */
export function buildCC5Request(elements: ReadonlyArray<readonly [string, CC5Node]>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>${writeNode('CC5Request', elements)}`;
}

/** A parsed CC5Response: its top-level elements and the children of <Extra>. */
export interface CC5Response {
  /** Top-level elements (OrderId, Response, ProcReturnCode, ErrMsg...). */
  readonly fields: Readonly<Record<string, string>>;
  /** Children of <Extra> (TRXDATE, TRANS_STAT, TRX1...). */
  readonly extra: Readonly<Record<string, string>>;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_m, entity: string) => {
    switch (entity) {
      case 'lt': return '<';
      case 'gt': return '>';
      case 'amp': return '&';
      case 'quot': return '"';
      case 'apos': return "'";
    }
    const code = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    try {
      return String.fromCodePoint(code);
    } catch {
      throw new CC5XmlError('Invalid character reference in the CMI response.');
    }
  });
}

/** Trims spaces and line breaks around a value, but keeps tabs: TRXn lines are tab-separated. */
function trimValue(text: string): string {
  return text.replace(/^[ \r\n]+|[ \r\n]+$/g, '');
}

interface Element {
  name: string;
  text: string;
  children: Element[];
}

/**
 * Reads a CC5Response. Element names are kept as sent; when an element repeats,
 * the last one wins. Values are entity-decoded and trimmed (tabs kept).
 */
export function parseCC5Response(xml: string): CC5Response {
  let source = xml.replace(/^\uFEFF/, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new CC5XmlError('The CMI response contains a DOCTYPE or ENTITY declaration, which is refused.');
  }
  source = source
    .replace(/<\?[\s\S]*?\?>/g, '') // XML declaration / processing instructions
    .replace(/<!--[\s\S]*?-->/g, ''); // comments

  const root: Element = { name: '#document', text: '', children: [] };
  const stack: Element[] = [root];
  // A tag (names may have spaces after "<" or "</", as some CMI samples do) or a CDATA section.
  const token = /<!\[CDATA\[([\s\S]*?)\]\]>|<\s*(\/?)\s*([A-Za-z_][\w.:-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  let last = 0;
  let match: RegExpExecArray | null;

  const addText = (raw: string) => {
    // A "<" left between tags is markup the reader did not recognise.
    if (raw.includes('<')) throw new CC5XmlError('The CMI response is not well-formed XML.');
    stack[stack.length - 1].text += decodeEntities(raw);
  };

  while ((match = token.exec(source)) !== null) {
    addText(source.slice(last, match.index));
    last = token.lastIndex;
    const [, cdata, closing, name, , selfClosing] = match;
    const current = stack[stack.length - 1];

    if (cdata !== undefined) {
      current.text += cdata;
    } else if (closing) {
      if (current.name !== name || stack.length === 1) {
        throw new CC5XmlError(`The CMI response is not well-formed XML (unexpected </${name}>).`);
      }
      stack.pop();
    } else {
      const element: Element = { name, text: '', children: [] };
      current.children.push(element);
      if (!selfClosing) stack.push(element);
    }
  }
  addText(source.slice(last));

  if (stack.length !== 1) {
    throw new CC5XmlError(`The CMI response is not well-formed XML (<${stack[stack.length - 1].name}> is not closed).`);
  }
  const top = root.children;
  if (top.length !== 1 || root.text.trim() !== '') {
    throw new CC5XmlError('The CMI response must have exactly one root element.');
  }
  if (top[0].name !== 'CC5Response') {
    throw new CC5XmlError(`Expected a <CC5Response>, got <${top[0].name}>.`);
  }

  // Null-prototype objects: a field named "__proto__" stays a plain key.
  const fields: Record<string, string> = Object.create(null);
  const extra: Record<string, string> = Object.create(null);
  for (const child of top[0].children) {
    if (child.name === 'Extra') {
      for (const item of child.children) extra[item.name] = trimValue(item.text);
    } else {
      fields[child.name] = trimValue(child.text);
    }
  }
  return { fields, extra };
}
