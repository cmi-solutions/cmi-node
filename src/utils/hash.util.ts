import crypto from "crypto";
import { SanitizationUtil } from "@utils";
import { HASH_SANITIZE_FIELDS } from "@constants/fields";
import { SecretString } from "./secret-string.util";

// Pre-computed set for hash sanitization — lowercased for case-insensitive lookup.
// Avoids re-creation per call and ensures keys like 'billtoname' match correctly.
const SANITIZE_FIELD_SET: ReadonlySet<string> = new Set(
    HASH_SANITIZE_FIELDS.map(f => f.toLowerCase())
);

export class HashUtil {

  static generate(params: Record<string, any>, storeKey: string | SecretString): string {
    try {
      const sortedKeys = Object.keys(params).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      );

      let hashval = "";

      for (const key of sortedKeys) {
        const lowerKey = key.toLowerCase();
        if (lowerKey !== "hash" && lowerKey !== "encoding") {
          let paramValue = String(params[key] ?? "").trim();

          // Apply sanitization to billing fields (CRITICAL)
          // Uses lowerKey for case-insensitive matching against the set.
          if (SANITIZE_FIELD_SET.has(lowerKey)) {
            paramValue = SanitizationUtil.sanitizeString(paramValue);
          }

          const escapedValue = paramValue
            .replace(/\\/g, "\\\\")
            .replace(/\|/g, "\\|");
          hashval += escapedValue + "|";
        }
      }

      // Extract actual value if SecretString, otherwise use as-is
      const keyValue = storeKey instanceof SecretString
        ? storeKey.getValue()
        : storeKey;

      const escapedStoreKey = keyValue
        .replace(/\\/g, "\\\\")
        .replace(/\|/g, "\\|");
      hashval += escapedStoreKey;

      const calculatedHash = crypto
        .createHash("sha512")
        .update(hashval, "utf8")
        .digest("hex");

      return Buffer.from(calculatedHash, "hex").toString("base64");
    } catch (error) {
      throw new Error(
        `Hash generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

}

