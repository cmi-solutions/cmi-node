# Contributing to cmi-node

Thank you for considering contributing to `cmi-node`! This document outlines the process and guidelines.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/cmi.git`
3. **Install** dependencies: `npm install`
4. **Create** a feature branch: `git checkout -b feature/your-feature`

## Development

```bash
# Build (CJS + ESM + Types)
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run type-check

# Lint
npm run lint

# Format
npm run format
```

## Project Structure

```
src/
├── core/           # Gateway, Builder, Verifier, Form, Handler
├── constants/      # Field definitions, currencies, languages
├── logger/         # Environment-aware logger
├── middleware/      # Framework adapters (Express, NestJS, Next.js, Fastify, Hono)
├── types/          # TypeScript type definitions
├── utils/          # Hash, sanitization, formatter, crypto utilities
├── validators/     # Config + payment validation
└── index.ts        # Public API barrel export
```

## Guidelines

### Code Style
- Follow existing patterns and naming conventions
- Use TypeScript strict mode — no `any` without an explicit comment justifying it
- Keep runtime dependencies at **zero** — use only Node.js built-ins

### Security
- Never log or expose the `storeKey` — always use `SecretString`
- Use timing-safe comparisons for hash verification
- HTML-escape all values in generated forms
- Validate and sanitize all user inputs

### Testing
- Write tests for all new features
- Use Node.js built-in `node:test` runner
- Maintain or improve coverage (currently ~87%)
- Include hash roundtrip tests for any changes to hash generation

### Commits
- Use clear, descriptive commit messages
- Reference issue numbers where applicable

## Pull Request Process

1. Ensure all tests pass: `npm test`
2. Ensure type check passes: `npm run type-check`
3. Ensure linting passes: `npm run lint`
4. Update documentation if your change affects the public API
5. Update the `CHANGELOG.md` under an `[Unreleased]` section
6. Submit your PR against the `main` branch

## Reporting Issues

- Use the [GitHub Issues](https://github.com/integrationcmi/cmi/issues) page
- Include steps to reproduce, expected behavior, and actual behavior
- Include your Node.js version and OS

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
