import crypto from "crypto";
import { SanitizationUtil } from "./sanitization.util";
import { SecretString } from "./secret-string.util";
import { phpHtmlEntityDecode, phpStrnatcasecmp, phpStripTrailingNewline } from "./php-compat.util";

/**
 * CMI "ver3" hash, as in CMI's reference PHP scripts:
 * field names sorted with natcasesort(), "hash" and "encoding" skipped,
 * "\" then "|" escaped, values joined with "|", the escaped store key appended,
 * then base64(sha512).
 */
export class HashUtil {

  /**
   * Hash of a payment request (2.SendData.php). Values are hashed exactly as they
   * are posted to CMI — PaymentBuilder has already trimmed and cleaned them.
   */
  static generate(params: Record<string, any>, storeKey: string | SecretString): string {
    return HashUtil.compute(params, storeKey, (value) => value);
  }

  /**
   * Hash of a callback or okUrl/failUrl request (callback.php): each received value
   * loses one trailing newline and is HTML-entity-decoded, and is not trimmed.
   */
  static generateForCallback(params: Record<string, any>, storeKey: string | SecretString): string {
    return HashUtil.compute(params, storeKey, (value) =>
      phpHtmlEntityDecode(phpStripTrailingNewline(value))
    );
  }

  private static compute(
    params: Record<string, any>,
    storeKey: string | SecretString,
    transform: (value: string) => string
  ): string {
    try {
      // Array.prototype.sort is stable, like PHP 8's natcasesort().
      const sortedKeys = Object.keys(params).sort(phpStrnatcasecmp);

      let hashval = "";
      for (const key of sortedKeys) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === "hash" || lowerKey === "encoding") continue;

        const value = transform(HashUtil.toFieldString(params[key]));
        // CMI's anti-XSS filter changes the character after "document" before checking
        // the hash (integration guide V2.0, §4.1.4).
        hashval += HashUtil.escape(SanitizationUtil.applyDocumentRule(value)) + "|";
      }

      const keyValue = storeKey instanceof SecretString ? storeKey.getValue() : storeKey;
      hashval += HashUtil.escape(keyValue);

      const calculatedHash = crypto.createHash("sha512").update(hashval, "utf8").digest("hex");
      return Buffer.from(calculatedHash, "hex").toString("base64");
    } catch (error) {
      throw new Error(
        `Hash generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        { cause: error }
      );
    }
  }

  /** A posted value as text. A repeated field keeps its last value, like PHP's $_POST. */
  static toFieldString(value: unknown): string {
    if (Array.isArray(value)) value = value[value.length - 1];
    return value === undefined || value === null ? "" : String(value);
  }

  private static escape(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
  }
}
