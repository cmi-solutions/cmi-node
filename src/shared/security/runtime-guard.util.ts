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
