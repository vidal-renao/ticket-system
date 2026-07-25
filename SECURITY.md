# Security

## Security Model

Identity is provided by Supabase Auth. Authorization is enforced in Route Handlers/Server Actions and PostgreSQL RLS. Tenant membership and role come from `profiles`, never from request payloads.

## Secrets

- Store secrets only in local ignored files, GitHub encrypted secrets and Vercel environment variables.
- Use distinct values per environment and rotate after personnel or provider changes.
- Bearer secrets must contain at least 32 random characters.
- Treat every credential formerly committed to Git as compromised, including deleted values.

## Privileged Operations

`/api/cron/sla`, `/api/email/inbound` and `/api/admin/setup` fail closed. Missing/short secrets return `503`; invalid bearer tokens return `401`. Setup additionally requires explicit user and organization UUIDs from runtime configuration.

Public registration creates customers only. Staff accounts are created by authenticated organization administrators.

## Multi-Tenancy

- Prefer session clients and RLS.
- Service clients bypass RLS and require explicit tenant/owner predicates.
- Child resources inherit access from the parent ticket.
- Apply `docs/migration_security_hardening.sql` followed by `docs/migration_enterprise_ticket_workflow.sql`, then test with at least two tenants before production promotion.
- Customers are creator-scoped, agents are assignee-scoped, and only administrators can route, approve or soft-delete tickets.

## Data and AI

Do not send secrets, credentials or unnecessary personal data to AI providers. PII scrubbing is a risk-reduction control, not a guarantee. Define provider retention, DPA, region and deletion behavior operationally.

Phase 4A permits only approved manuals, procedures, FAQs, knowledge articles and manually selected, reviewed, anonymized resolutions. Names, contact details, addresses, credentials, tokens, confidential material and unnecessary personal data are prohibited from embedding input. Sanitization itself is not implemented. The schema records approval evidence, rejects mutation of ready chunk identity/content/model, and permits only a controlled ready-to-stale transition that clears the vector. Retrieval independently revalidates active source, current document, approved version and ready chunk state; approval revocation invalidates child chunks idempotently without cross-row locking.

The new RAG tables use composite organization foreign keys as well as forced RLS. Agents can directly read only current, approved, ready, non-deleted retrieval content. Managers/admins manage drafts/history only in their organization. Customers and `anon` receive no effective access. Trigger helpers are revoked from browser roles. Service-role remains server-only and every backend query must include an explicit tenant predicate derived outside request/tool input.


## Logging

Logs must not include tokens, passwords, cookies, authorization headers, service keys or full ticket content. Use stable request/event identifiers and generic client errors.

## Missing Production Controls

- Durable distributed rate limiting for auth, registration, AI and webhook routes.
- Automated secret scanning and SAST in CI.
- Disposable-database RLS integration tests.
- Documented incident response, retention execution and access review cadence.

## Reporting

Do not open a public issue for a suspected vulnerability containing exploit details or customer data. Contact the repository owner privately with affected route, reproduction, impact and suggested mitigation.
