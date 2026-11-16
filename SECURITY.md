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

## Identity, Reference Codes and Onboarding (Phase 4A.14)

- Every profile carries an immutable, server-generated `reference_code` (`VRE-<ADM|MGR|EMP|CUS|COM>-XXXX-XXXX`, crypto-random via `pgcrypto.gen_random_bytes`, collision-retry, ambiguity-free alphabet). It is never accepted from a client, never editable via any form, and a database trigger blocks any `UPDATE` that changes an already-set value, for every role including `service_role`.
- `profiles.customer_type` (`individual`/`company`) has no `UPDATE` grant for `authenticated` — converting a customer between types is a future, explicit, service-role-only operation, not a self-service action.
- `organization_id`, `role`, `customer_type` and `reference_code` are never read from a request body by `/api/admin/customers/individual` or `/api/admin/customers/company`; both routes resolve the canonical tenant server-side via `organizations.slug = 'vidal-real-estate'` and impose role/type unconditionally. See DECISIONS.md ADR-015.
- Self-service profile edits (`/settings`) are restricted at the database column-grant level to `full_name, phone, locale, address, city, postal_code, country, website, contact_person, logo_url` — email, role, tenant, customer_type and reference_code have no `UPDATE` grant for `authenticated`, so a tampered client request cannot widen what it can change.
- Company logos use a new `logos` Storage bucket, deliberately mirroring the existing `avatars` bucket's already-reviewed pattern (public read, folder-scoped RLS keyed to `auth.uid()`) rather than a new mechanism. Upload also verifies the real file signature (magic bytes) client-side before upload, since `File.type` is client-asserted and not authoritative.
- New customer onboarding uses `supabase.auth.admin.inviteUserByEmail` — no admin ever sees a temporary password for a customer account (agent/employee onboarding is unchanged and still uses an admin-set temporary password).

## Access and Recovery Links (Phase 0, ADR-016)

- A link that signs somebody in is treated as a credential. Onboarding and administrator password reset deliver it by email only.
- An administrator receives the link only when the email could not be sent **and** `ADMIN_LINK_HANDOFF` is exactly `"true"`. It is never issued for an account linked to an existing login. Keep the flag `false` in production.
- "Email failed" is: for password reset, `sendEmail()` did not deliver; for onboarding, Supabase Auth refused the invitation because it could not send the mail (rate limit or SMTP error). Later bounces are not detectable.
- Every issuance is written to the server log as `[audit] access link issued` with actor, target, organization, type and outcome. The link and email addresses are never logged. A queryable admin audit table is not implemented yet.

## Multi-Tenancy

- Prefer session clients and RLS.
- Service clients bypass RLS and require explicit tenant/owner predicates.
- Child resources inherit access from the parent ticket.
- Apply `docs/migration_security_hardening.sql` followed by `docs/migration_enterprise_ticket_workflow.sql`, then test with at least two tenants before production promotion.
- `hd_customers_info` RLS is organization-scoped (migration `202611160002`): staff read only their own organization's customers, only that organization's admin writes or deletes, a customer reaches only their own row.
- Customers are creator-scoped, agents are assignee-scoped, and only administrators can route, approve or soft-delete tickets.

## Data and AI

Do not send secrets, credentials or unnecessary personal data to AI providers. PII scrubbing is a risk-reduction control, not a guarantee. Define provider retention, DPA, region and deletion behavior operationally.

Phase 4A permits only approved manuals, procedures, FAQs, knowledge articles and manually selected, reviewed, anonymized resolutions. Names, contact details, addresses, credentials, tokens, confidential material and unnecessary personal data are prohibited from embedding input. Sanitization itself is not implemented. The schema records approval evidence, rejects mutation of ready chunk identity/content/model, and permits only a controlled ready-to-stale transition that clears the vector. Retrieval independently revalidates active source, current document, approved version and ready chunk state; approval revocation invalidates child chunks idempotently without cross-row locking.

The new RAG tables use composite organization foreign keys as well as forced RLS. Agents can directly read only current, approved, ready, non-deleted retrieval content. Managers/admins manage drafts/history only in their organization. Customers and `anon` receive no effective access. Trigger helpers are revoked from browser roles. Service-role remains server-only and every backend query must include an explicit tenant predicate derived outside request/tool input.

Source/document archive or soft deletion is enforced as immediate retrieval exclusion, not as a synchronous descendant rewrite. Keeping child chunks physically unchanged avoids lock amplification while every authorized retrieval path still checks parent lifecycle state. Exact fixture cleanup and later compaction are separate operational concerns; neither weakens the retrieval invariant.


### AI endpoint controls (Phase 0, ADR-017)

- `/api/translate`, `/api/ai/wiki-chat` and `translateText` require an active profile with an organization; the organization and user are read from the caller's own `hd_profiles` row.
- Input is bounded before the provider is called: text ≤ 5000 characters; chat ≤ 20 messages and ≤ 12000 characters, roles `user`/`assistant` only.
- Rate limit and quota are implemented in PostgreSQL (`hd_ai_usage`, `hd_consume_ai_quota`): 30 requests/hour and 200/day per user, 1000/day per organization, shared by the three endpoints. Excess requests get 429 with `Retry-After`. The store fails closed (503).
- Not covered: ticket triage and staff "suggest reply" calls, which have their own paths and no quota yet.

## Logging

Logs must not include tokens, passwords, cookies, authorization headers, service keys or full ticket content. Use stable request/event identifiers and generic client errors.

## Missing Production Controls

- Durable rate limiting for auth, registration and webhook routes, and for the AI paths outside the three interactive endpoints (triage, suggest reply). The interactive AI endpoints are rate limited since Phase 0.
- A queryable audit trail for administrator account actions (link issuance is currently a structured log line).
- Automated secret scanning and SAST in CI.
- Disposable-database RLS integration tests.
- Documented incident response, retention execution and access review cadence.

## Reporting

Do not open a public issue for a suspected vulnerability containing exploit details or customer data. Contact the repository owner privately with affected route, reproduction, impact and suggested mitigation.
