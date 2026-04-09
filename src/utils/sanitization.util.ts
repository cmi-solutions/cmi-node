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
}
