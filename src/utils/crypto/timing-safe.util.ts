/**
 * Timing-Safe Cryptographic Utilities
 * 
 * Provides secure comparison functions to prevent timing attacks.
 */

import crypto from 'crypto';

/**
 * Perform a constant-time comparison of two strings.
 * This prevents timing attacks when comparing hashes.
 * 
 * Uses an ephemeral HMAC-then-compare strategy so that neither
 * the value nor the length of either string can be inferred from
 * response timing, regardless of whether lengths differ.
 * 
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 * 
 * @example
 * ```typescript
 * const isValid = timingSafeCompare(receivedHash, calculatedHash);
 * ```
 */
export function timingSafeCompare(a: string, b: string): boolean {
    try {
        // Generate a fresh random key for each comparison.
        // HMAC output is always fixed-length (32 bytes for SHA-256),
        // so the comparison time is constant regardless of input length.
        const key = crypto.randomBytes(32);
        const hmacA = crypto.createHmac('sha256', key).update(a, 'utf8').digest();
        const hmacB = crypto.createHmac('sha256', key).update(b, 'utf8').digest();
        return crypto.timingSafeEqual(hmacA, hmacB);
    } catch {
        return false;
    }
}

/**
 * Generate a SHA-512 hash and return as base64
 * 
 * @param data - String to hash
 * @returns Base64-encoded SHA-512 hash
 */
export function sha512Base64(data: string): string {
    const hash = crypto.createHash('sha512').update(data, 'utf8').digest('hex');
    return Buffer.from(hash, 'hex').toString('base64');
}
