# Architecture

## System Context

The browser communicates with a Next.js App Router application on Vercel. Next.js uses Supabase Auth for identity and PostgreSQL for tenant data. Anthropic handles ticket-language operations and triage; OpenAI embeddings support optional RAG. Resend provides optional outbound email, while an authenticated webhook ingests email replies.

## Boundaries

| Boundary | Responsibility |
| --- | --- |
| UI | Rendering, interaction and local form feedback; never authoritative authorization |
| Route Handlers | HTTP validation, authentication, authorization and response mapping |
| Server Actions | Authenticated mutations initiated by server-rendered flows |
| Domain libraries | Ticket visibility, lifecycle, SLA, notifications and AI orchestration |
| Supabase session client | User-scoped operations protected by RLS |
| Supabase service client | Trusted server operations with mandatory explicit tenant filters |
| PostgreSQL/RLS | Last-line tenant and row authorization |

## Main Flows

### Ticket creation

Authenticated customer -> validated request -> profile-derived organization -> ticket and SLA deadlines -> notification -> deferred AI triage -> AI analysis -> optional priority and SLA update when no human override exists.

### Ticket handling

Authenticated staff -> role and tenant check -> visibility policy -> assignment/status/comment mutation -> lifecycle audit -> notification and SLA reassessment.

### Email ingestion

Bearer-authenticated provider -> normalized sender -> existing Supabase user/profile -> tenant and owner/role-scoped ticket lookup -> append comment or create ticket.

### SLA cron

Bearer-authenticated Vercel Cron -> active tickets -> deadline normalization -> breach assessment -> notifications.

## Data Architecture

`organizations` is the tenant root. `profiles` links Auth users to a tenant and role. Tickets belong to one organization and one creator; comments, attachments and AI analysis inherit access through their ticket. Audit logs and knowledge chunks are organization-scoped.

## Known Constraints

- Historical SQL files overlap; production schema state must be verified externally.
- Some large RSC pages combine querying, aggregation and presentation.
- Service-role use remains broader than the target architecture.
- Serverless execution provides no durable in-memory rate limiting or queue.

## Target Direction

Move tenant-aware data access behind typed repositories, consolidate forward-only migrations, use a durable background queue for AI/email work, and add integration tests against disposable Supabase environments.
