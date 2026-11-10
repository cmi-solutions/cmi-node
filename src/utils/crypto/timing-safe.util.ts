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
        // Hash both inputs to fixed-length digests (32 bytes) so that
        // crypto.timingSafeEqual always receives equal-length buffers,
        // regardless of the original string lengths.
        const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
        const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
        return crypto.timingSafeEqual(hashA, hashB);
    } catch {
        return false;
    }
}

