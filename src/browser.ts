// Resolved instead of the real SDK by bundlers that build browser code (the "browser"
// export condition in package.json: webpack, Turbopack, Vite, esbuild, Rollup).
// Importing cmi-node from a client component therefore fails at once, before any
// storeKey can be bundled into JavaScript sent to the browser.
import { SERVER_ONLY_MESSAGE } from './utils/runtime-guard.util';

throw new Error(SERVER_ONLY_MESSAGE);
