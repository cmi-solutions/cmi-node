import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        // Main entrypoint — core SDK + all framework helpers
        index: 'src/index.ts',
        // Per-framework subpath entries — consumers can import only what they need,
        // e.g.  import { createExpressMiddleware } from 'cmi-node/express'
        // This also prevents edge-runtime failures: Hono/Cloudflare Workers
        // won't evaluate Node.js-only modules at import time.
        'adapters/express':  'src/middleware/express.middleware.ts',
        'adapters/nextjs':   'src/middleware/nextjs.helper.ts',
        'adapters/fastify':  'src/middleware/fastify.helper.ts',
        'adapters/hono':     'src/middleware/hono.helper.ts',
        'adapters/nestjs':   'src/middleware/nestjs.helper.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    outDir: 'dist',
    target: 'es2020',
    // tsup uses esbuild which resolves tsconfig paths automatically
});
