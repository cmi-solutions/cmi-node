import crypto from "crypto";

export class GeneratorUtil {
  static generateOrderId(): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `ORD-${timestamp}-${random}`;
  }

  static generateRandom(): string {
    // Must produce purely alphabetic characters (a-zA-Z) to satisfy
    // the CMI `rnd` field constraints (max 20 chars, alphabetic only).
    // Uses crypto.randomInt for unbiased uniform distribution.
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 20; i++) {
      result += chars[crypto.randomInt(chars.length)];
    }
    return result;
  }
}
