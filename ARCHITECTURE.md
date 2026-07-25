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

Authenticated actor -> role and tenant check -> strict owner/assignee visibility -> role-specific mutation -> lifecycle/review audit -> notification and SLA reassessment. Agents execute assigned work; administrators own routing and approval.

Automatic routing is deterministic before it is probabilistic: explicit team/category and keyword classification can route immediately, then asynchronous AI may refine only an unassigned, unlocked ticket. No-match is a safe administrator intake queue, never an unrelated-agent fallback.

### Email ingestion

Bearer-authenticated provider -> normalized sender -> existing Supabase user/profile -> tenant and owner/role-scoped ticket lookup -> append comment or create ticket.

### SLA cron

Bearer-authenticated Vercel Cron -> active tickets -> deadline normalization -> breach assessment -> notifications.

## Data Architecture

`organizations` is the tenant root. `profiles` links Auth users to a tenant and role. Tickets belong to one organization and one creator; comments, attachments and AI analysis inherit access through their ticket. Audit logs and knowledge chunks are organization-scoped.

Operational status and administrator review are separate fields. `routing_override` protects human routing decisions from background automation. `deleted_at` and `deleted_by` provide recoverable, tenant-scoped cleanup while preserving dependent history.

## Known Constraints

- Historical SQL files overlap; production schema state must be verified externally.
- Some large RSC pages combine querying, aggregation and presentation.
- Service-role use remains broader than the target architecture.
- Serverless execution provides no durable in-memory rate limiting or queue.

## Target Direction

Move tenant-aware data access behind typed repositories, consolidate forward-only migrations, use a durable background queue for AI/email work, and add integration tests against disposable Supabase environments.

## Phase 4A RAG Foundation

The additive `rag_*` model is the canonical target for new knowledge work. It separates approved sources, logical documents, immutable versions, sanitized chunks and embedding jobs. The legacy `knowledge_chunks` table and `match_knowledge_chunks` RPC remain untouched until Preview metadata and a future backfill prove a safe cutover.

Authenticated retrieval derives organization from the current profile. Backend retrieval accepts organization only across an internal server boundary and is executable only by `service_role`; MCP tool schemas never expose that parameter. Both paths filter organization, current approved version and active ready chunks inside SQL before exact cosine ordering.
