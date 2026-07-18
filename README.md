# HelpDesk AI

Enterprise-oriented, multilingual support operations for Swiss SMEs. HelpDesk AI combines ticket ownership, agent queues, SLA workflows, notifications and human-reviewed AI assistance in one Next.js application.

> Status: portfolio-ready and suitable for controlled demos. Production promotion still requires staging migration verification, disposable-database RLS integration tests and authenticated E2E coverage.

## Product

- Customer portal for ticket creation, progress, comments, ratings and controlled reopening.
- Agent queue with assignment, priority, waiting reasons and SLA visibility.
- Manager/admin analytics, user administration and organization privacy settings.
- DE, EN and ES interface with translation assistance.
- Anthropic-assisted triage and reply suggestions; optional OpenAI/pgvector RAG.
- Inbound email, notifications and authenticated SLA cron processing.

AI output is assistive. Customer-facing replies require human action. Tenant isolation, RLS, PII minimization and audit events are technical controls; they are not a legal certification.

## Trust boundaries

| Actor | Ticket scope |
| --- | --- |
| Customer | Own tickets only (`created_by`) |
| Agent | Assigned tickets; explicitly enabled unassigned queue work |
| Manager | Organization tickets |
| Admin | Organization tickets and configuration |

Identity, role and organization are derived server-side from Supabase Auth and `profiles`. Service-role operations include explicit tenant or owner predicates and never trust caller-provided tenant data.

## Stack

- Next.js 15 App Router, React 19 and strict TypeScript.
- Tailwind CSS 4 with a semantic control-room design system.
- Supabase Auth, PostgreSQL and RLS.
- next-intl for DE/EN/ES.
- Vitest, ESLint and GitHub Actions.
- Vercel Functions/Cron, Anthropic, optional OpenAI and Resend.

## Repository

| Path | Responsibility |
| --- | --- |
| `app/[locale]/` | Public, authentication and protected application routes |
| `app/api/` | HTTP endpoints, cron and integrations |
| `app/actions/` | Authenticated server mutations |
| `components/` | Domain and shared UI |
| `lib/` | Authorization, lifecycle, SLA, AI and infrastructure clients |
| `tests/` | Security and domain regression tests |
| `docs/` | Schema references and forward migrations |
| `.agents/skills/` | Project-local agent skills, including frontend design |

Read [ARCHITECTURE.md](./ARCHITECTURE.md), [DOMAIN.md](./DOMAIN.md), [SECURITY.md](./SECURITY.md) and [SDD.md](./SDD.md) before changing data or authorization flows.

## Local setup

Requirements: Node.js 20+, a Supabase project and the required provider credentials.

```bash
npm ci
cp .env.local.example .env.local
npm run dev
```

Key variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/session key protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged operations |
| `NEXT_PUBLIC_APP_URL` | Canonical application URL |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Public demo/contact CTA |
| `ANTHROPIC_API_KEY` | Triage, translation and reply suggestions |
| `OPENAI_API_KEY` | Optional RAG embeddings |
| `CRON_SECRET` | Fail-closed SLA cron authentication |
| `EMAIL_INGEST_SECRET` | Fail-closed inbound-email authentication |
| `SETUP_SECRET` | Exceptional setup endpoint authentication |

Secrets for cron, email ingestion and setup must be distinct random values of at least 32 characters.

## Quality gates

```bash
npm run check
npm run build
npm audit --audit-level=high
```

`npm run check` enforces zero-warning lint, strict typecheck and all unit tests. CI runs the same checks from a deterministic `npm ci` install.

## Database

Repository SQL files describe an ordered bootstrap/hardening path but do not prove the deployed schema. Verify the Supabase migration history before promotion:

1. `docs/migration_v1_final.sql`
2. `docs/migration_schema_consistency.sql`
3. `docs/migration_phase1_routing.sql`
4. `docs/migration_rls_profiles_fix.sql`
5. `docs/migration_security_hardening.sql`
6. `docs/rag_migration.sql` only when RAG is enabled

Never edit a historical migration to represent a production change. Add an idempotent forward migration with rollback notes and test it against two tenants.

## Release checklist

1. Apply and verify migrations in staging.
2. Test two organizations and all four roles against RLS.
3. Run customer, agent and admin authenticated E2E flows.
4. Verify cron/webhook secrets and provider failure behavior.
5. Confirm retention, DPA, provider region and incident-response operations.
6. Measure accessibility, Core Web Vitals and bundle budgets; publish only measured results.

See [ROADMAP.md](./ROADMAP.md) for non-implemented work and [CHANGELOG.md](./CHANGELOG.md) for delivered changes.
