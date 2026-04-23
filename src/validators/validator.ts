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

  protected static hasSpecialCharacters(str: string): boolean {
    // Allow alphanumeric and spaces, but prevent multiple consecutive spaces
    // and spaces at start/end
    const regex = /^[a-zA-Z0-9]+(\s+[a-zA-Z0-9]+)*$/;

    // Also check for consecutive spaces
    if (/\s{2,}/.test(str)) {
      return true; // Has special characters (multiple spaces)
    }

    return !regex.test(str);
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

    // Validate cleaned version: optional +, then 7-15 digits starting with 1-9
    const phoneRegex = /^\+?[1-9]\d{9,14}$/;

    return phoneRegex.test(cleaned);
  }


  protected static isNumeric(value: string): boolean {
    return /^-?\d*\.?\d+$/.test(value.trim());
  }

  protected static isEmpty(value: string): boolean {
    return value.trim().length === 0;
  }

  protected static hasDeepLinkProtocol(url: string): boolean {
    try {
      const urlObj = new URL(url);
      // Deeplinks: any scheme like myapp://, app://, etc.
      // We block dangerous schemes that could be used for XSS or local file access
      const dangerousSchemes = ['javascript:', 'data:', 'vbscript:', 'file:'];
      const protocol = urlObj.protocol.toLowerCase();

      if (dangerousSchemes.includes(protocol)) return false;
      
      // If it's not http/https and not dangerous, we consider it a potential deep link
      return protocol !== 'http:' && protocol !== 'https:';
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

