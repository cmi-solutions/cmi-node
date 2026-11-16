 # Contributing to cmi-node

Thank you for considering contributing to `cmi-node`! This document outlines the rules, conventions, and workflow you **must** follow before submitting any contribution.

> **⚠️ Important:** This project enforces commit message format and branch naming conventions via automated Git hooks (Husky) and CI checks. Contributions that do not follow these rules will be automatically rejected.

---

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development](#development)
- [Commit Message Convention](#-commit-message-convention)
- [Branch Naming Convention](#-branch-naming-convention)
- [Git Hooks (Enforced Automatically)](#-git-hooks-enforced-automatically)
- [Code Style Guidelines](#-code-style-guidelines)
- [Security Guidelines](#-security-guidelines)
- [Testing Guidelines](#-testing-guidelines)
- [Pull Request Process](#-pull-request-process)
- [Reporting Issues](#reporting-issues)
- [License](#license)

---

## Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/cmi.git`
3. **Install** dependencies: `npm install`
4. **Create** a feature branch: `git checkout -b feature/your-feature` (see [Branch Naming Convention](#-branch-naming-convention))

---

## Project Structure

The SDK is split into **kits** (one per way of working with CMI) on top of a **shared** layer:

```
src/
├── shared/                   # Used by every kit; knows nothing about kits
│   ├── cc5/                  #   CMI's XML API: request builder, response reader, HTTP transport, CMIApiError
│   ├── constants/            #   currencies, languages
│   ├── formatting/           #   amount rounding (half-up to the cent)
│   ├── logger/               #   environment-aware logger
│   ├── security/             #   SecretString, timing-safe compare, browser guard
│   └── validation/           #   base validator (https-only URLs, e-mail, phone...)
├── kits/
│   ├── api/                  # API kit: back-office XML API (cmi-node/api)
│   │   ├── CMIApiClient.ts   #   postAuth, refund, void, orderStatus, orderHistory
│   │   ├── order-status.ts   #   CMI's status table, history lines
│   │   ├── api.types.ts
│   │   └── index.ts          #   the kit's public API
│   └── standard/             # Standard kit: hosted payment page (cmi-node/standard)
│       ├── CMIPaymentGateway.ts
│       ├── adapters/         #   Express, Next.js, Fastify, Hono, NestJS
│       ├── callback/         #   CallbackVerifier, CallbackHandler
│       ├── constants/        #   store types, tran types, confirmation modes, fields
│       ├── hash/             #   ver3 hash, PHP-compatible sorting
│       ├── payment/          #   PaymentBuilder, FormGenerator
│       ├── types/
│       ├── utils/            #   formatter, sanitization, generator, storeKey checks
│       ├── validators/       #   config and payment validation
│       └── index.ts          #   the kit's public API
├── browser.ts                # What bundlers load for browser code: throws at once
└── index.ts                  # Root entry: re-exports every kit
test/
├── api/                      # One test folder per kit...
├── shared/                   # ...and one for shared code
└── standard/
```

The Tokenization kit (`src/kits/tokenization`) will follow the same layout and reuse `src/shared/cc5` for its API calls.

### Architecture rules

These keep the kits independent. ESLint enforces the first two, so a wrong import fails `npm run lint` and CI:

1. **A kit imports only from itself and from `src/shared`**, never from another kit.
2. **`src/shared` never imports from a kit.**
3. **Code two kits need moves to `src/shared`.** Don't copy it, and don't import it across kits.
4. **Each kit owns its configuration and secrets.** The Standard kit takes the `storeKey`; another kit never receives it.
5. **Each kit has one public entry point** (`src/kits/<kit>/index.ts`), published as `cmi-node/<kit>` and re-exported by `src/index.ts`. Anything not exported there is internal.
6. **Published import paths never change in a minor version.** Keep the old paths working when files move.

### Adding a kit

1. Create `src/kits/<kit>/` with an `index.ts` listing its public API.
2. Add it to the ESLint kit list in `eslint.config.mjs`, a `@<kit>/*` alias in `tsconfig.json`, an entry in `tsup.config.ts`, and a `./<kit>` subpath in the `exports` of `package.json`.
3. Re-export it from `src/index.ts`, and put its tests in `test/<kit>/`.

---

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

---

## 📝 Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by [commitlint](https://commitlint.js.org/) with the `@commitlint/config-conventional` preset.

Every commit message **must** follow this format:

```
<type>(<scope>): <subject>
```

Or without scope:

```
<type>: <subject>
```

### Rules

| Rule | Constraint |
|---|---|
| **Header max length** | 100 characters |
| **Subject case** | Cannot be `sentence-case`, `start-case`, `pascal-case`, or `UPPER-CASE` |
| **Type** | Must be one of the allowed types below |

### Allowed Types

| Type | Description |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `refactor` | Code refactoring (no feature change, no bug fix) |
| `test` | Adding or correcting tests |
| `chore` | Build process, tooling, dependency updates |
| `ci` | Changes to CI configuration files and scripts |

### ✅ Good Examples

```bash
git commit -m "feat: add offshore account type support"
git commit -m "fix: resolve hash mismatch on callback verification"
git commit -m "docs: update README with Express full example"
git commit -m "refactor(core): extract payment builder into separate class"
git commit -m "test: add coverage for currency validation"
git commit -m "chore: bump typescript to 5.4.5"
git commit -m "ci: add yarn berry compatibility job"
```

### ❌ Bad Examples

```bash
git commit -m "updated stuff"                  # No type prefix
git commit -m "feat: Added new feature"        # Subject starts with capital (start-case)
git commit -m "FEAT: add feature"              # Type must be lowercase
git commit -m "style: fix formatting"          # 'style' is not an allowed type
git commit -m "feat: this is a very long commit message that exceeds the seventy-two character limit for headers"  # Too long
```

> **Note:** The `commit-msg` Git hook runs `commitlint` automatically. If your commit message doesn't comply, the commit will be **rejected**.

---

## 🌿 Branch Naming Convention

Branch names are validated by the `pre-push` Git hook. Your branch **must** match one of these patterns:

### Protected Branches (Direct)

| Branch | Purpose |
|---|---|
| `main` | Production-ready code |
| `develop` | Integration branch |
| `preprod` | Pre-production staging |

### Feature/Work Branches

Format: `<type>/<short-description>`

- **Type** must be one of: `feat`, `fix`, `chore`, `docs`, `refactor`, `release`, `ci`, `test`
- **Description** must be lowercase alphanumeric with hyphens (`a-z`, `0-9`, `-`)

### ✅ Valid Branch Names

```
feat/add-refund
fix/callback-bug
chore/update-deps
docs/contributing-guide
refactor/extract-verifier
release/v1-1-0
ci/add-coverage-check
test/hash-roundtrip
```

### ❌ Invalid Branch Names

```
my-branch                    # Missing type prefix
feature/AddRefund            # 'feature' is not an allowed type and no uppercase letters allowed
feat/add_refund              # No underscores (use hyphens)
Feat/add-refund              # Type must be lowercase
bugfix/something             # 'bugfix' is not an allowed type
```

> **Note:** The `pre-push` hook validates your branch name before pushing. Invalid branch names will be **rejected** with a descriptive error message.

---

## 🪝 Git Hooks (Enforced Automatically)

This project uses [Husky](https://typicode.github.io/husky/) to enforce quality gates at every stage:

| Hook | What It Does |
|---|---|
| `pre-commit` | Runs the full test suite (`npm test`) |
| `commit-msg` | Validates commit message format via `commitlint` |
| `pre-push` | Validates branch name against the naming convention |

These hooks are installed automatically when you run `npm install` (via the `prepare` script). **Do not bypass them** with `--no-verify` unless you have a valid reason — CI will catch violations anyway.

---

## 🎨 Code Style Guidelines

- Follow existing patterns and naming conventions
- Use TypeScript strict mode — no `any` without an explicit comment justifying it
- Keep runtime dependencies at **zero** — use only Node.js built-ins (`crypto`, `buffer`)
- All field names are normalized case-insensitively — follow the canonical casing in the codebase
- Use path aliases for imports that leave the current folder: `@shared/...` for shared code, `@standard/...` inside the Standard kit; use `./` for files in the same folder

---

## 🔒 Security Guidelines

- **Never** log or expose the `storeKey` — always use `SecretString`
- Use **timing-safe comparisons** for hash verification (`timingSafeCompare`)
- **HTML-escape** all values in generated forms (`SanitizationUtil.escapeHtml`)
- Validate and sanitize all user inputs
- Enforce max length limits on all string fields (including custom fields, capped at 255)
- Never store `storeKey` in `this.config` — it lives only in `secureStoreKey`

---

## 🧪 Testing Guidelines

- Write tests for all new features
- Use Node.js built-in `node:test` runner
- Include hash roundtrip tests for any changes to hash generation
- Test both CJS and ESM import paths
- Reference issue numbers where applicable

---

## 🚀 Pull Request Process

1. ✅ Ensure all tests pass: `npm test`
2. ✅ Ensure type check passes: `npm run type-check`
3. ✅ Ensure linting passes: `npm run lint`
4. ✅ Ensure your commit messages follow [Conventional Commits](#-commit-message-convention)
5. ✅ Ensure your branch follows the [naming convention](#-branch-naming-convention)
6. 📝 Update documentation if your change affects the public API
7. 📝 Update the `CHANGELOG.md` under an `[Unreleased]` section
8. 🚀 **Submit your PR** against the `main` branch

> [!IMPORTANT]
> **Direct commits to the `main`, `preprod` and `develop` branches are strictly prohibited.** All changes must be submitted via a Pull Request and pass all CI checks before merging. Direct pushes to these branches will be blocked by branch protection and CI guards.

### CI Checks (Must Pass)

Your PR will be validated against:

- **Build** — CJS, ESM, and TypeScript declarations
- **Type check** — `tsc --noEmit`
- **Lint** — ESLint
- **Tests** — Full test suite on Node.js 18.x, 20.x, and 22.x
- **Coverage** — Minimum 85% line coverage
- **Smoke tests** — CJS `require()`, ESM `import`, and all subpath imports
- **Yarn compatibility** — Classic and Berry (PnP)

---

## Reporting Issues

- Use the [GitHub Issues](https://github.com/integrationcmi/cmi/issues) page
- Include steps to reproduce, expected behavior, and actual behavior
- Include your Node.js version and OS

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
 