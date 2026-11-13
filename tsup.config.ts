import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        // Main entrypoint — core SDK + all framework helpers
        index: 'src/index.ts',
        // Resolved by the "browser" export condition: throws at import (server-only SDK)
        browser: 'src/browser.ts',
        // Per-framework subpath entries — consumers can import only what they need,
        // e.g.  import { createExpressMiddleware } from 'cmi-node/express'
        // Note: the core (CMIPaymentGateway) uses Node.js 'crypto' and Buffer, so edge
        // runtimes need Node.js compatibility (e.g. Cloudflare Workers: nodejs_compat).
        // Standard kit (hosted payment page): cmi-node/standard
        standard:            'src/kits/standard/index.ts',
        'adapters/express':  'src/kits/standard/adapters/express.middleware.ts',
        'adapters/nextjs':   'src/kits/standard/adapters/nextjs.helper.ts',
        'adapters/fastify':  'src/kits/standard/adapters/fastify.helper.ts',
        'adapters/hono':     'src/kits/standard/adapters/hono.helper.ts',
        'adapters/nestjs':   'src/kits/standard/adapters/nestjs.helper.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: true,
    outDir: 'dist',
    target: 'es2022',
    // Source maps keep file and line mappings for stack traces, but not a copy of the
    // sources (sourcesContent), which roughly halves the published size.
    esbuildOptions(options) {
        options.sourcesContent = false;
    },
    // tsup uses esbuild which resolves tsconfig paths automatically
});
