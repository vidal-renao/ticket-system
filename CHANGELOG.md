# Changelog

All notable changes are documented here. This project follows a simple unreleased-first format.

## Unreleased

### Security

- Made cron, inbound email and admin setup authentication fail closed.
- Removed hardcoded setup identities and moved them to runtime configuration.
- Restricted public registration to customer accounts.
- Protected the teams endpoint with authentication, role and tenant checks.
- Added an idempotent RLS hardening migration for profiles, comments, attachments, AI analysis and RAG RPC access.
- Removed known passwords from executable seeds and recovery SQL.
- Added baseline HTTP security headers and removed cookie/user debug logging.

### Quality

- Added Vitest with security regression tests.
- Replaced interactive `next lint` with ESLint CLI.
- Added deterministic CI for lint, typecheck, tests, build and high-severity dependency audit.
- Updated Next.js and next-intl to patched compatible versions.
- Added runtime validation for Supabase server configuration.

### Documentation

- Replaced the corrupted README and added architecture, product, domain, security, testing, contribution and agent guardrails.
