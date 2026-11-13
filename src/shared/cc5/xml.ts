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

const NAME = /^[A-Za-z_][\w.:-]*$/;

function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
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

const isSpace = (code: number) => code === 32 || code === 9 || code === 10 || code === 13;

/** Trims spaces and line breaks around a value, but keeps tabs: TRXn lines are tab-separated. */
function trimValue(text: string): string {
  const keep = (code: number) => code !== 32 && code !== 10 && code !== 13;
  let start = 0;
  let end = text.length;
  while (start < end && !keep(text.charCodeAt(start))) start++;
  while (end > start && !keep(text.charCodeAt(end - 1))) end--;
  return text.slice(start, end);
}

interface Element {
  name: string;
  text: string;
  children: Element[];
}

const notWellFormed = (detail: string) => new CC5XmlError(`The CMI response is not well-formed XML (${detail}).`);

/**
 * Reads a CC5Response. Element names are kept as sent; when an element repeats,
 * the last one wins. Values are entity-decoded and trimmed (tabs kept).
 *
 * The reader is a single forward scan (indexOf based, no backtracking regex), so its
 * time grows linearly with the answer's size, whatever the answer contains.
 */
export function parseCC5Response(xml: string): CC5Response {
  const source = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml; // byte order mark
  const root: Element = { name: '#document', text: '', children: [] };
  const stack: Element[] = [root];
  const length = source.length;
  let i = 0;

  while (i < length) {
    const lt = source.indexOf('<', i);
    const textEnd = lt === -1 ? length : lt;
    if (textEnd > i) stack[stack.length - 1].text += decodeEntities(source.slice(i, textEnd));
    if (lt === -1) break;

    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      if (end === -1) throw notWellFormed('unclosed comment');
      i = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt + 9);
      if (end === -1) throw notWellFormed('unclosed CDATA section');
      stack[stack.length - 1].text += source.slice(lt + 9, end);
      i = end + 3;
      continue;
    }
    if (source.startsWith('<?', lt)) {
      const end = source.indexOf('?>', lt + 2);
      if (end === -1) throw notWellFormed('unclosed processing instruction');
      i = end + 2;
      continue;
    }
    if (source.startsWith('<!', lt)) {
      // <!DOCTYPE ...>, <!ENTITY ...>: refused, so no entity expansion can happen.
      throw new CC5XmlError('The CMI response contains a DOCTYPE or ENTITY declaration, which is refused.');
    }

    const gt = source.indexOf('>', lt + 1);
    if (gt === -1) throw notWellFormed('unclosed tag');
    // Tag content between "<" and ">", e.g. "ErrMsg", "/ ERRORCODE", "ErrMsg/", " CC5Response".
    let start = lt + 1;
    let end = gt;
    const nextLt = source.indexOf('<', lt + 1);
    if (nextLt !== -1 && nextLt < gt) throw notWellFormed('"<" inside a tag');
    while (start < end && isSpace(source.charCodeAt(start))) start++;
    const closing = source.charCodeAt(start) === 47; // "/"
    if (closing) start++;
    while (start < end && isSpace(source.charCodeAt(end - 1))) end--;
    const selfClosing = !closing && end > start && source.charCodeAt(end - 1) === 47;
    if (selfClosing) end--;
    while (start < end && isSpace(source.charCodeAt(start))) start++;
    let nameEnd = start;
    while (nameEnd < end && !isSpace(source.charCodeAt(nameEnd))) nameEnd++;
    const name = source.slice(start, nameEnd); // anything after the name (attributes) is ignored
    if (!NAME.test(name)) throw notWellFormed(`invalid tag <${source.slice(lt + 1, Math.min(gt, lt + 40))}>`);
    if (closing && nameEnd < end) throw notWellFormed(`unexpected text in </${name}>`);

    const current = stack[stack.length - 1];
    if (closing) {
      if (current.name !== name || stack.length === 1) throw notWellFormed(`unexpected </${name}>`);
      stack.pop();
    } else {
      const element: Element = { name, text: '', children: [] };
      current.children.push(element);
      if (!selfClosing) stack.push(element);
    }
    i = gt + 1;
  }

  if (stack.length !== 1) throw notWellFormed(`<${stack[stack.length - 1].name}> is not closed`);
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
