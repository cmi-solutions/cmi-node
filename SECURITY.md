# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 2.x     | Yes       |
| 1.x     | Security fixes only, until 2.0.0 has been released for 6 months |

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Report it privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability** (GitHub private vulnerability reporting). Include the affected
version, a description of the issue, and steps to reproduce it.

You will get an acknowledgement within 5 working days. A fix is released as a patch
version, and the advisory is published once users have had time to upgrade.

## Scope

In scope: hash generation and verification, callback handling, the generated payment
form, secret handling, and the framework adapters in this package.

Out of scope: vulnerabilities in CMI's own platform (report those to CMI), and issues
that need an attacker to already know the merchant's store key.
