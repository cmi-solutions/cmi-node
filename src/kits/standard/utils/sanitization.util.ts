/**
 * Letters that PHP's htmlentities() turns into an entity which str_without_accents()
 * reduces to plain letters, other than the usual accent entities (acute, grave, circ,
 * tilde, uml, ring, cedil, caron, slash). Entities not listed here and not reducible
 * through Unicode decomposition (Ð, Þ, þ, ×, ÷, µ...) are removed, as in PHP.
 */
const SPECIAL_LETTERS: Readonly<Record<string, string>> = {
  'Æ': 'AE', 'æ': 'ae', // &AElig; &aelig;
  'Œ': 'OE', 'œ': 'oe', // &OElig; &oelig;
  'ß': 'sz',            // &szlig;
  'Ø': 'O', 'ø': 'o',   // &Oslash; &oslash;
  'ð': 'e',             // &eth; matches the "th" suffix in CMI's regex
};

/** Characters from the HTML 4.01 entity table that keep their base letter. */
function isAccentEntityLetter(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  // Latin-1 letters (À-ÿ) plus Š š Ÿ, the only other HTML 4.01 letter entities.
  return (code >= 0xc0 && code <= 0xff) || code === 0x160 || code === 0x161 || code === 0x178;
}

export class SanitizationUtil {
  static sanitizeString(str: string | undefined, maxLength: number = 255): string {
    if (!str) return "";
    return String(str)
      .trim()
      .replace(/[<>'"]/g, "")
      .substring(0, maxLength);
  }

  static sanitizeEmail(email: string): string {
    return email.trim().toLowerCase().substring(0, 64);
  }

  static escapeHtml(str: string): string {
    const htmlEscapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, (char) => htmlEscapeMap[char] || char);
  }

  /**
   * PHP's trim(): removes only " \t\n\r\0\x0B" from both ends (unlike
   * String.prototype.trim(), which also removes non-breaking and Unicode spaces).
   */
  static phpTrim(str: string): string {
    const trimmed = " \t\n\r\0\u000b";
    let start = 0;
    let end = str.length;
    while (start < end && trimmed.includes(str[start])) start++;
    while (end > start && trimmed.includes(str[end - 1])) end--;
    return str.slice(start, end);
  }

  /**
   * Port of str_without_accents() from CMI's reference 2.SendData.php:
   * accented letters lose their accent (é → e, Æ → AE), and every character other
   * than a-z, A-Z, 0-9, "_", space and "-" is removed. The result is trimmed.
   */
  static removeAccents(str: string): string {
    let out = "";
    for (const char of String(str)) {
      if (/^[a-zA-Z0-9_ -]$/.test(char)) {
        out += char;
      } else if (char in SPECIAL_LETTERS) {
        out += SPECIAL_LETTERS[char];
      } else if (isAccentEntityLetter(char)) {
        const base = char.normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (/^[a-zA-Z]$/.test(base)) out += base;
      }
      // Anything else (punctuation, other scripts, symbols) is dropped, as in PHP.
    }
    return SanitizationUtil.phpTrim(out);
  }

  /**
   * CMI's anti-XSS filter replaces the character that follows "document" with "."
   * before checking the hash (integration guide V2.0, §4.1.4). Applying the same
   * change to the value we send keeps the hash identical on both sides; it is
   * idempotent ("document.x" is left unchanged).
   */
  static applyDocumentRule(str: string): string {
    return str.replace(/(document)[\s\S]/gi, "$1.");
  }
}
