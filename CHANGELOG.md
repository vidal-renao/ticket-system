# Changelog

All notable changes are documented here. This project follows a simple unreleased-first format.

## Unreleased

### Security

- Restricted agents to explicitly assigned tickets across RLS, pages, inbox, comments and mutations; removed self-assignment.
- Reserved assignment, routing overrides, approval, user mutation and ticket cleanup for administrators.
- Replaced additive legacy ticket/comment/profile/AI policies with one deployed enterprise access contract.
- Added audited, tenant-scoped soft deletion and restore instead of dashboard hard deletion.
- Enforced creator ownership for customer ticket lists, details, comments, urgency and ratings.
- Centralized role-aware ticket access policy for service-role reads and mutations.
- Made cron, inbound email and admin setup authentication fail closed.
- Removed hardcoded setup identities and moved them to runtime configuration.
- Restricted public registration to customer accounts.
- Protected the teams endpoint with authentication, role and tenant checks.
- Added an idempotent RLS hardening migration for profiles, comments, attachments, AI analysis and RAG RPC access.
- Removed known passwords from executable seeds and recovery SQL.
- Added baseline HTTP security headers and removed cookie/user debug logging.
- Enforced ticket ownership for customer-originated inbound email updates.
- Prevented AI triage from overwriting a priority changed by a human operator.

### Quality

- Added deterministic tests for specialist routing, role-specific fields, review authorization and business-stage projection.
- Reconciled the application with the deployed schema by removing the nonexistent `tickets.updated_at` dependency.
- Added authorization and lifecycle regression coverage for the primary ticket flow.
- Aligned ticket reopening with canonical transitions and resolution SLA recalculation.
- Added Vitest with security regression tests.
- Replaced interactive `next lint` with ESLint CLI.
- Added deterministic CI for lint, typecheck, tests, build and high-severity dependency audit.
- Updated Next.js and next-intl to patched compatible versions.
- Added runtime validation for Supabase server configuration.
- Made zero-warning linting part of the local and CI quality gate.
- Scoped Next.js output tracing to this application to avoid scanning the parent workspace.
- Recalculated SLA deadlines when an eligible AI priority recommendation is applied.

### Product and design

- Added a customer-to-specialist-to-admin chain of custody with an explicit **Ready for admin OK** gate.
- Rebuilt the agent workspace as assigned-only stages and the admin console as new/assigned/in-progress/waiting/review/processed/trash queues.
- Added tenant-wide administrator user search with Auth email, role, specialty/company and activation status.
- Reframed the public experience as a Swiss support operations control room with a coherent semantic token system.
- Replaced generic marketing blocks with a product workflow preview and verifiable capability statements.
- Removed the inactive checkout prototype, speculative pricing, competitor comparisons and unverified compliance claims.
- Added the project-local `frontend-design` skill and documented its use for future interface work.

### Documentation

- Rebuilt the README, SDD, architecture, roadmap, decisions and agent guardrails around the current product.
- Removed stale audit snapshots, duplicate agent prompts, destructive seed scripts and unrelated CV assets.
