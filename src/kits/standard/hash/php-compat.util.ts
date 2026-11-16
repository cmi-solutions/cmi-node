/**
 * PHP-compatible helpers used to reproduce, byte for byte, the hash calculation of
 * CMI's reference PHP scripts (2.SendData.php and callback.php).
 */

/**
 * HTML 4.01 named entities, as decoded by PHP's html_entity_decode(..., ENT_QUOTES, 'UTF-8')
 * (generated from get_html_translation_table(HTML_ENTITIES, ENT_QUOTES | ENT_HTML401, 'UTF-8')).
 */
const HTML401_ENTITIES: Readonly<Record<string, number>> = {
  AElig: 198, Aacute: 193, Acirc: 194, Agrave: 192, Alpha: 913, Aring: 197, Atilde: 195, Auml: 196,
  Beta: 914, Ccedil: 199, Chi: 935, Dagger: 8225, Delta: 916, ETH: 208, Eacute: 201, Ecirc: 202,
  Egrave: 200, Epsilon: 917, Eta: 919, Euml: 203, Gamma: 915, Iacute: 205, Icirc: 206, Igrave: 204,
  Iota: 921, Iuml: 207, Kappa: 922, Lambda: 923, Mu: 924, Ntilde: 209, Nu: 925, OElig: 338,
  Oacute: 211, Ocirc: 212, Ograve: 210, Omega: 937, Omicron: 927, Oslash: 216, Otilde: 213,
  Ouml: 214, Phi: 934, Pi: 928, Prime: 8243, Psi: 936, Rho: 929, Scaron: 352, Sigma: 931,
  THORN: 222, Tau: 932, Theta: 920, Uacute: 218, Ucirc: 219, Ugrave: 217, Upsilon: 933, Uuml: 220,
  Xi: 926, Yacute: 221, Yuml: 376, Zeta: 918, aacute: 225, acirc: 226, acute: 180, aelig: 230,
  agrave: 224, alefsym: 8501, alpha: 945, amp: 38, and: 8743, ang: 8736, aring: 229, asymp: 8776,
  atilde: 227, auml: 228, bdquo: 8222, beta: 946, brvbar: 166, bull: 8226, cap: 8745, ccedil: 231,
  cedil: 184, cent: 162, chi: 967, circ: 710, clubs: 9827, cong: 8773, copy: 169, crarr: 8629,
  cup: 8746, curren: 164, dArr: 8659, dagger: 8224, darr: 8595, deg: 176, delta: 948, diams: 9830,
  divide: 247, eacute: 233, ecirc: 234, egrave: 232, empty: 8709, emsp: 8195, ensp: 8194,
  epsilon: 949, equiv: 8801, eta: 951, eth: 240, euml: 235, euro: 8364, exist: 8707, fnof: 402,
  forall: 8704, frac12: 189, frac14: 188, frac34: 190, frasl: 8260, gamma: 947, ge: 8805, gt: 62,
  hArr: 8660, harr: 8596, hearts: 9829, hellip: 8230, iacute: 237, icirc: 238, iexcl: 161,
  igrave: 236, image: 8465, infin: 8734, int: 8747, iota: 953, iquest: 191, isin: 8712, iuml: 239,
  kappa: 954, lArr: 8656, lambda: 955, lang: 9001, laquo: 171, larr: 8592, lceil: 8968,
  ldquo: 8220, le: 8804, lfloor: 8970, lowast: 8727, loz: 9674, lrm: 8206, lsaquo: 8249,
  lsquo: 8216, lt: 60, macr: 175, mdash: 8212, micro: 181, middot: 183, minus: 8722, mu: 956,
  nabla: 8711, nbsp: 160, ndash: 8211, ne: 8800, ni: 8715, not: 172, notin: 8713, nsub: 8836,
  ntilde: 241, nu: 957, oacute: 243, ocirc: 244, oelig: 339, ograve: 242, oline: 8254, omega: 969,
  omicron: 959, oplus: 8853, or: 8744, ordf: 170, ordm: 186, oslash: 248, otilde: 245,
  otimes: 8855, ouml: 246, para: 182, part: 8706, permil: 8240, perp: 8869, phi: 966, pi: 960,
  piv: 982, plusmn: 177, pound: 163, prime: 8242, prod: 8719, prop: 8733, psi: 968, quot: 34,
  rArr: 8658, radic: 8730, rang: 9002, raquo: 187, rarr: 8594, rceil: 8969, rdquo: 8221,
  real: 8476, reg: 174, rfloor: 8971, rho: 961, rlm: 8207, rsaquo: 8250, rsquo: 8217, sbquo: 8218,
  scaron: 353, sdot: 8901, sect: 167, shy: 173, sigma: 963, sigmaf: 962, sim: 8764, spades: 9824,
  sub: 8834, sube: 8838, sum: 8721, sup: 8835, sup1: 185, sup2: 178, sup3: 179, supe: 8839,
  szlig: 223, tau: 964, there4: 8756, theta: 952, thetasym: 977, thinsp: 8201, thorn: 254,
  tilde: 732, times: 215, trade: 8482, uArr: 8657, uacute: 250, uarr: 8593, ucirc: 251,
  ugrave: 249, uml: 168, upsih: 978, upsilon: 965, uuml: 252, weierp: 8472, xi: 958, yacute: 253,
  yen: 165, yuml: 255, zeta: 950, zwj: 8205, zwnj: 8204,
};

/** Code points PHP decodes from numeric entities with the HTML 4.01 doctype. */
function isDecodableCodePoint(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return true;
  if (cp >= 0x20 && cp <= 0x7e) return true;
  return cp >= 0xa0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff);
}

/** PHP's html_entity_decode($value, ENT_QUOTES, 'UTF-8') with the default HTML 4.01 table. */
export function phpHtmlEntityDecode(value: string): string {
  return value.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/g, (match, dec, hex, name) => {
    if (name !== undefined) {
      const cp = HTML401_ENTITIES[name];
      return cp === undefined ? match : String.fromCodePoint(cp);
    }
    const cp = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
    return Number.isFinite(cp) && isDecodableCodePoint(cp) ? String.fromCodePoint(cp) : match;
  });
}

/** callback.php's preg_replace("/\n$/", "", $value): PCRE "$" also matches before a final newline. */
export function phpStripTrailingNewline(value: string): string {
  return value.replace(/\n(?=\n?$)/g, '');
}

const isDigit = (c: number): boolean => c >= 0x30 && c <= 0x39;
// C isspace(): space, \t, \n, \v, \f, \r
const isSpace = (c: number): boolean => c === 0x20 || (c >= 0x09 && c <= 0x0d);
const toUpper = (c: number): number => (c >= 0x61 && c <= 0x7a ? c - 0x20 : c);

/**
 * PHP's strnatcasecmp() (ext/standard/strnatcmp.c), on the UTF-8 bytes of both strings.
 * natcasesort() orders the field names with it: "item2" comes before "item10",
 * and the comparison is done on upper-cased characters (so "_" sorts after letters).
 */
export function phpStrnatcasecmp(left: string, right: string): number {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length === 0 || b.length === 0) {
    return a.length === b.length ? 0 : a.length > b.length ? 1 : -1;
  }
  // Out-of-range reads behave like C's terminating NUL byte.
  const at = (buf: Buffer, i: number): number => (i < buf.length ? buf[i] : 0);

  let ai = 0;
  let bi = 0;
  let leading = true;
  for (;;) {
    let ca = at(a, ai);
    let cb = at(b, bi);

    // Skip over leading zeros (only at the start of the strings).
    while (leading && ca === 0x30 && ai + 1 < a.length && isDigit(a[ai + 1])) ca = at(a, ++ai);
    while (leading && cb === 0x30 && bi + 1 < b.length && isDigit(b[bi + 1])) cb = at(b, ++bi);
    leading = false;

    // Skip consecutive whitespace.
    while (isSpace(ca)) ca = at(a, ++ai);
    while (isSpace(cb)) cb = at(b, ++bi);

    // Process a run of digits.
    if (isDigit(ca) && isDigit(cb)) {
      const fractional = ca === 0x30 || cb === 0x30;
      const result = fractional ? compareLeft() : compareRight();
      if (result !== 0) return result;
      if (ai === a.length && bi === b.length) return 0;
      if (ai === a.length) return -1;
      if (bi === b.length) return 1;
      ca = at(a, ai);
      cb = at(b, bi);
    }

    ca = toUpper(ca);
    cb = toUpper(cb);
    if (ca < cb) return -1;
    if (ca > cb) return 1;

    ++ai;
    ++bi;
    if (ai >= a.length && bi >= b.length) return 0;
    if (ai >= a.length) return -1;
    if (bi >= b.length) return 1;
  }

  // The longest run of digits wins; with equal length, the first difference decides.
  function compareRight(): number {
    let bias = 0;
    for (;; ai++, bi++) {
      const aEnd = ai === a.length || !isDigit(a[ai]);
      const bEnd = bi === b.length || !isDigit(b[bi]);
      if (aEnd && bEnd) return bias;
      if (aEnd) return -1;
      if (bEnd) return 1;
      if (a[ai] < b[bi]) { if (!bias) bias = -1; }
      else if (a[ai] > b[bi]) { if (!bias) bias = 1; }
    }
  }

  // Left-aligned (fractional) numbers: the first different digit wins.
  function compareLeft(): number {
    for (;; ai++, bi++) {
      const aEnd = ai === a.length || !isDigit(a[ai]);
      const bEnd = bi === b.length || !isDigit(b[bi]);
      if (aEnd && bEnd) return 0;
      if (aEnd) return -1;
      if (bEnd) return 1;
      if (a[ai] < b[bi]) return -1;
      if (a[ai] > b[bi]) return 1;
    }
  }
}
