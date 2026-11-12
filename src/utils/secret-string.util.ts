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
    // ES2022 hard-private — truly inaccessible at runtime, not just compile-time.
    // Prevents `(secret as any).value` from leaking the store key.
    #value: string;
    static readonly #MASK = '********';

    constructor(value: string) {
        if (!value || typeof value !== 'string') {
            throw new Error('SecretString requires a non-empty string value');
        }
        this.#value = value;
    }

    /**
     * Get the actual secret value.
     * Only use this internally for cryptographic operations.
     * @internal
     */
    getValue(): string {
        return this.#value;
    }

    /**
     * Returns masked value to prevent accidental logging
     */
    toString(): string {
        return SecretString.#MASK;
    }

    /**
     * Returns masked value for JSON serialization
     */
    toJSON(): string {
        return SecretString.#MASK;
    }

    /**
     * Custom inspect for Node.js console.log
     */
    [Symbol.for('nodejs.util.inspect.custom')](): string {
        return `SecretString(${SecretString.#MASK})`;
    }

    /**
     * Get the length without exposing the value
     */
    get length(): number {
        return this.#value.length;
    }

    /**
     * Check if value matches using constant-time comparison (timing-safe).
     * Both sides are hashed to fixed-length digests first, so neither the content
     * nor the length of the secret can be inferred from the comparison time.
     */
    equals(other: string | SecretString): boolean {
        const otherValue = other instanceof SecretString ? other.getValue() : other;
        if (typeof otherValue !== 'string') return false;
        const digestA = crypto.createHash('sha256').update(this.#value, 'utf8').digest();
        const digestB = crypto.createHash('sha256').update(otherValue, 'utf8').digest();
        return crypto.timingSafeEqual(digestA, digestB);
    }
}
