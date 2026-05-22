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

```
src/
├── core/           # Gateway, Builder, Verifier, Form, Handler
├── constants/      # Field definitions, currencies, languages, account types
├── logger/         # Environment-aware logger
├── middleware/      # Framework adapters (Express, NestJS, Next.js, Fastify, Hono)
├── types/          # TypeScript type definitions
├── utils/          # Hash, sanitization, formatter, crypto utilities
├── validators/     # Config + payment validation
└── index.ts        # Public API barrel export
```

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
- Use path aliases (`@core`, `@types`, `@utils`, `@validators`, `@constants`, `@logger`) for imports

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
 