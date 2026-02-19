import crypto from 'crypto';

/**
 * SecretString - Wrapper for sensitive strings
 * 
 * Prevents accidental exposure of secrets via:
 * - console.log()
 * - JSON.stringify()
 * - Error messages
 * - String concatenation
 * 
 * @example
 * ```typescript
 * const secret = new SecretString('my-api-key');
 * console.log(secret);        // SecretString(********)
 * JSON.stringify({key: secret}); // {"key":"********"}
 * secret.getValue();          // 'my-api-key' (explicit access only)
 * ```
 */
export class SecretString {
    private readonly value: string;
    private static readonly MASK = '********';

    constructor(value: string) {
        if (!value || typeof value !== 'string') {
            throw new Error('SecretString requires a non-empty string value');
        }
        this.value = value;
    }

    /**
     * Get the actual secret value.
     * Only use this internally for cryptographic operations.
     * @internal
     */
    getValue(): string {
        return this.value;
    }

    /**
     * Returns masked value to prevent accidental logging
     */
    toString(): string {
        return SecretString.MASK;
    }

    /**
     * Returns masked value for JSON serialization
     */
    toJSON(): string {
        return SecretString.MASK;
    }

    /**
     * Custom inspect for Node.js console.log
     */
    [Symbol.for('nodejs.util.inspect.custom')](): string {
        return `SecretString(${SecretString.MASK})`;
    }

    /**
     * Get the length without exposing the value
     */
    get length(): number {
        return this.value.length;
    }

    /**
     * Check if value matches using constant-time comparison (timing-safe)
     */
    equals(other: string | SecretString): boolean {
        const otherValue = other instanceof SecretString ? other.getValue() : other;
        const bufA = Buffer.from(this.value, 'utf8');
        const bufB = Buffer.from(otherValue, 'utf8');

        if (bufA.length !== bufB.length) {
            // Still do a comparison to maintain constant time
            try { crypto.timingSafeEqual(bufA, bufA); } catch { /* ignore */ }
            return false;
        }

        try {
            return crypto.timingSafeEqual(bufA, bufB);
        } catch {
            return false;
        }
    }
}
