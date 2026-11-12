export class Validator {
  protected static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Check if URL has HTTP/HTTPS protocol
  protected static hasHttpProtocol(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === "http:" || urlObj.protocol === "https:";
    } catch {
      return false;
    }
  }

  protected static isValidEmail(email: string): boolean {
    // Strict regex: only alphanumeric + allowed special chars
    const emailRegex =
      /^[a-zA-Z0-9]+([._+-][a-zA-Z0-9]+)*@[a-zA-Z0-9]+([.-][a-zA-Z0-9]+)*\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  protected static isPhoneNumber(phone: string): boolean {
    const trimmed = phone.trim();

    // First, check the raw format is valid
    // Allow: digits, spaces, dashes, parentheses, and optional leading +
    // But must start with + or digit, not with dash/space/parenthesis
    const formatRegex = /^[+\d][\d\s\-()]*$/;
    if (!formatRegex.test(trimmed)) {
      return false;
    }

    // Remove formatting characters
    const cleaned = trimmed.replace(/[\s\-()]/g, "");

    // Validate cleaned version: optional +, then 6 to 20 digits. Leading zeros are
    // allowed (Moroccan numbers such as 0612345678 or 00212612345678).
    const phoneRegex = /^\+?\d{6,20}$/;

    return phoneRegex.test(cleaned);
  }


  protected static isNumeric(value: string): boolean {
    return /^-?\d*\.?\d+$/.test(value.trim());
  }

  /** Only the digits 0-9 (no sign, no decimal point). */
  protected static isDigits(value: string): boolean {
    return /^\d+$/.test(value.trim());
  }

  /**
   * HTTPS, or plain HTTP on a local development host (localhost, *.localhost,
   * 127.0.0.1, [::1]), so the gateway and callback URLs are never sent in clear
   * text over the internet.
   */
  protected static isSecureOrLocalUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === "https:") return true;
      if (urlObj.protocol !== "http:") return false;
      const host = urlObj.hostname.toLowerCase();
      return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "[::1]";
    } catch {
      return false;
    }
  }

  // Returns true for http, https, or any safe custom scheme (deeplink)
  protected static isValidRedirectUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol.toLowerCase();
      // Block dangerous schemes
      const blockedSchemes = ['javascript:', 'data:', 'vbscript:', 'file:'];
      if (blockedSchemes.includes(protocol)) return false;
      return true;
    } catch {
      return false;
    }
  }
}

