# Agent Operating Guide

## Mission

Maintain HelpDesk AI as a secure multi-tenant ticketing product. Preserve tenant isolation, ticket lifecycle semantics and operational reliability before adding features.

## Read First

Read `README.md`, `ARCHITECTURE.md`, `DOMAIN.md`, `SECURITY.md` and the files involved in the requested flow. Do not infer database columns or API contracts from UI copy.

## Mandatory Rules

1. Never expose or log `SUPABASE_SERVICE_ROLE_KEY`, API keys, bearer tokens, passwords, session cookies or ticket content.
2. Never trust `organization_id`, role, user ID or ownership supplied by the client. Derive them from the authenticated profile.
3. Every `service_role` query touching tenant data must include an explicit tenant or user ownership predicate.
4. Public endpoints must fail closed when configuration is missing.
5. Public registration may create only `customer`; staff creation is an authenticated admin operation.
6. Do not add a database field without an idempotent migration, types, authorization review and rollback note.
7. Do not edit historical migrations to represent a production change. Add a new migration.
8. Do not invent APIs, tables, RLS behavior or compliance claims.
9. Reuse existing domain helpers before creating an abstraction.
10. Keep customer-visible errors generic and server logs free of sensitive values.

## Sensitive Areas

- `lib/supabase/server.ts` and every `createServiceClient*` call.
- `lib/authz.ts`, `lib/ticket-visibility.ts` and RLS migrations.
- `app/api/admin/`, `app/api/auth/`, `app/api/email/` and `app/api/cron/`.
- Ticket comments, internal notes, attachments, AI analysis and audit logs.
- Seed scripts and any operation using Supabase Auth Admin.

## Workflow

1. Establish current behavior and affected actors.
2. Write a short specification using `SDD.md` for meaningful changes.
3. Identify authorization, tenant, migration and failure-state effects.
4. Implement the smallest coherent change.
5. Add tests for critical logic, permissions or regressions.
6. Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.
7. Update documentation and `CHANGELOG.md` when contracts change.

## Definition of Done

- Authorization is enforced on the server and, where applicable, in RLS.
- Tenant filters cannot be selected by the caller.
- Empty, loading, validation and error states remain coherent.
- New environment variables appear in `.env.local.example` and documentation.
- Tests cover the changed critical behavior.
- Lint has no new warnings in touched files; typecheck, tests and build pass.
- No secrets, personal credentials or unverified claims are introduced.
