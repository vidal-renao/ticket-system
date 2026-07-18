# Architecture Decisions

## ADR-001: Next.js App Router on Vercel

Status: accepted. The product uses one TypeScript deployment surface for UI, server rendering, Route Handlers and cron-compatible functions.

## ADR-002: Supabase Auth and PostgreSQL RLS

Status: accepted with hardening. RLS is the database authorization boundary; service-role access is exceptional and must include explicit tenant predicates.

## ADR-003: Customer-only self-registration

Status: accepted. Public callers cannot create staff roles. Agents and managers are provisioned by an authenticated administrator until signed, expiring invitations are implemented.

## ADR-004: AI remains assistive

Status: accepted. AI may classify and draft, but customer-facing messages require human review. Optional PII scrubbing reduces disclosed data.

## ADR-005: Fail-closed operational endpoints

Status: accepted. Missing or weak webhook/cron/setup secrets disable the endpoint instead of bypassing authentication.

## ADR-006: Forward-only security migrations

Status: accepted. Production fixes are new idempotent migrations. Historical files are not treated as proof of applied database state.

## ADR-007: One ticket access policy

Status: accepted. Ticket access is derived from the authenticated profile and ticket row: customers are owner-scoped, agents are assignment-scoped, and managers/admins are organization-scoped. Query helpers and point mutations must reuse the same policy.

## ADR-008: Reopening resumes active work

Status: accepted. Reopening a terminal ticket transitions it to `in_progress`, clears terminal timestamps and starts a new resolution SLA window. It does not create a second first-response obligation.

## ADR-009: Preserve waiting reasons

Status: accepted. `pending_customer` and `pending_third_party` remain separate states in storage, domain mapping, operational filters and presentation. Neither state may silently disappear from active queues or SLA processing.

## ADR-010: Swiss operations control-room design

Status: accepted. The product uses semantic graphite, signal-blue, SLA-amber and mint tokens with a restrained pulse-line signature. Accessibility, responsive layout and reduced-motion behavior are release requirements.
