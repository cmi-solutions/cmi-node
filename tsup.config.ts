import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        // Main entrypoint — core SDK + all framework helpers
        index: 'src/index.ts',
        // Per-framework subpath entries — consumers can import only what they need,
        // e.g.  import { createExpressMiddleware } from 'cmi-node/express'
        // Note: the core (CMIPaymentGateway) uses Node.js 'crypto' and Buffer, so edge
        // runtimes need Node.js compatibility (e.g. Cloudflare Workers: nodejs_compat).
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
    splitting: true,
    outDir: 'dist',
    target: 'es2022',
    // tsup uses esbuild which resolves tsconfig paths automatically
});
