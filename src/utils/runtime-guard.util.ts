import { logger } from '@logger';
import { SecretString } from './secret-string.util';

/** Shown when the SDK is loaded or constructed in a browser. */
export const SERVER_ONLY_MESSAGE =
  'cmi-node is server-only: it holds your CMI storeKey and must never run in a browser. ' +
  'Use it in a server route (API route, route handler, server action, controller) and ' +
  'never expose CMI_* variables with a public prefix such as NEXT_PUBLIC_ or VITE_.';

/**
 * Throws when running in a browser (a global `window` with a `document`).
 * Node, Deno, Bun, Vercel and Cloudflare Workers have no `document`, so they pass.
 */
export function assertServerRuntime(): void {
  const g = globalThis as { window?: unknown; document?: unknown };
  if (typeof g.window !== 'undefined' && typeof g.document !== 'undefined') {
    throw new Error(SERVER_ONLY_MESSAGE);
  }
}

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
