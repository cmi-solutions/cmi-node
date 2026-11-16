import { logger } from '@shared/logger';
import { SecretString } from '@shared/security/secret-string.util';

/** Minimum storeKey length below which a warning is logged (the key is not salted by CMI's ver3 hash). */
export const MIN_STORE_KEY_LENGTH = 16;
let warnedWeakKey = false;

/**
 * CMI's ver3 hash is an unsalted SHA-512 over values that are all visible in the payment form,
 * so a short storeKey can be brute-forced offline from any one form. Warn once per process.
 */
export function warnIfWeakStoreKey(storeKey: SecretString): void {
  if (warnedWeakKey || storeKey.length >= MIN_STORE_KEY_LENGTH) return;
  warnedWeakKey = true;
  logger.warn(
    `CMI storeKey is shorter than ${MIN_STORE_KEY_LENGTH} characters. The hash in every payment form ` +
    'can be used to guess a short key offline: set a long random store key in the CMI back-office.'
  );
}
