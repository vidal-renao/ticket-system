# Changelog

## Unreleased — Live operations console

- Added `/ops`, a manager/admin-only live operations console: KPI ribbon, canonical-status donut, priority and monthly-flow charts, filterable ticket table and a merged lifecycle activity feed, all fed by Supabase Realtime (`postgres_changes` on `tickets`, `ticket_comments`, `ticket_audit_logs`). Agents and customers are redirected to `/dashboard`, which now links to the console.
- Added migration `202608010001_dashboard_realtime.sql`: adds the three tables to the `supabase_realtime` publication (idempotent, additive — the publication is shared with other applications in this project). `REPLICA IDENTITY` is unchanged; the console consumes INSERT/UPDATE only and treats a newly set `deleted_at` as a removal.
- Added `/api/audit`: the only browser-facing door to `public.audit_runs` (a `service_role`-only view), gated to an authenticated manager/admin and scoped to their own organization. Compliance percentages are parsed from the delivered report subject, which is where the pipeline records them.
- Realtime subscribes with the user's JWT, so RLS remains the authorization boundary for the stream; channel drops are retried with backoff and a snapshot resync closes the gap.
- Each `/ops` row links to `/tickets/[id]`; ticket management (close, assign, edit) stays on the existing screen rather than being duplicated in the console.

### Fixed

- Typing in a ticket comment box no longer logs "tried to push 'presence' before joining": the indicator created a new presence channel on every keystroke and pushed to it before the join completed. It now reuses the subscribed channel and only tracks once the channel reports `SUBSCRIBED`.

### Security

- Added the missing `UPDATE` policy on `public.tickets` plus the `UPDATE`/`INSERT` privileges the authenticated role never had. The application was never blocked by this — every ticket write runs server-side with `service_role` after its own role and organization checks — but the database itself was permissive-by-absence. Scope matches the read policy: customers their own tickets, agents their assigned ones, managers/admins the whole organization. No `DELETE` policy: deletion here is an `UPDATE` of `deleted_at`.
- Added `tickets_customer_update_guard`, which keeps a customer's direct writes to priority and metadata, matching what the application already allows.
- Revoked `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on `tickets` and `ticket_comments` from `anon`; no unauthenticated flow writes either table.
- The pre-existing `ticket_comments` INSERT policy is now reachable: the authenticated role had never been granted `INSERT`, so the policy had no effect.
- Fixed `tickets_customer_update_guard` applying the customer rule to every caller. It tested `current_profile_role() <> 'customer'`, which is NULL rather than TRUE on the service_role connection all application writes use, so the restricted branch ran for admins too and any write touching a guarded column failed — commenting (via `applySlaAssessment`) and closing a ticket included. The guard now restricts only a positively identified customer; under service_role, where no end-user identity reaches the database at all, the rule stays where it already lives and is stricter: the API routes, which are also the only layer that can tell a legitimate customer transition (resolution sign-off, reopen) from an illegitimate one.
- Added a `tickets-write-policies` CI job (ephemeral PostgreSQL 17.6 + pgTAP) running 18 assertions over both migrations, exercising the service_role and customer paths that the original JWT-only verification missed.

### Changed

- The application sidebar collapses to an icon rail above `lg` (persisted per device, applied before first paint so it never flashes open) and stays an off-canvas drawer below it. The drawer now closes on Escape, locks background scroll, and is removed from the tab order while off-canvas.

## Unreleased — Phase 4A.14

- Added `profiles.reference_code` (immutable, crypto-random, `VRE-<ADM|MGR|EMP|CUS|COM>-XXXX-XXXX`, collision-retry trigger) and `profiles.customer_type` (`individual`/`company`), plus new self-service profile columns (`address`, `city`, `postal_code`, `country`, `website`, `contact_person`, `logo_url`) and matching column grants.
- Added an additive backfill migration assigning the canonical Vidal Real Estate tenant to the 10 profiles positively identified as legitimate individual customers, excluding 3 ambiguous cross-project accounts.
- Added a `logos` Storage bucket mirroring the existing `avatars` bucket's public/folder-scoped-RLS pattern.
- Added `/api/admin/customers/individual` and `/api/admin/customers/company`: separate onboarding routes, Zod schemas and invitation-based (`inviteUserByEmail`) provisioning for individual vs. company customers, replacing the single generic agent/customer toggle in `CreateUserModal` (now agent-only).
- Extended `/settings` with a self-service personal-details form and (for company customers) a logo upload, rather than duplicating a new profile route.
- Extended the admin user-management panel with individual/company/incomplete-profile filters and reference-code display.
- Added an `identity-foundation` CI job (ephemeral PostgreSQL 17.6 + pgTAP, same isolation model as `rag-foundation`) running 42 real assertions against the new schema.
- See DECISIONS.md ADR-015.

## Unreleased — Phase 4A

- Added an additive, versioned `rag_*` knowledge schema with tenant-safe composite relationships, forced RLS and explicit grants.
- Added separate authenticated and server-only exact-cosine retrieval RPC contracts without changing the legacy RAG table/RPC.
- Added typed knowledge-domain validation, a trusted-tenant repository boundary, synthetic fixtures and schema/security contract tests.
- Added Preview migration, verification and rollback guidance. No migration has been applied.
- Corrected the independent-review findings: ready chunk immutability, atomic approval invalidation, retrieval-grade agent RLS, opaque server-only tenant context, session Supabase adapter, trigger grants, job retry history and fail-fast migration preflight.
- Moved metadata verification outside the migration chain and added an opt-in runner for the real migrations plus synthetic pgTAP/concurrency scenarios. PostgreSQL execution remains pending.
- Updated Next.js from 15.5.20 to the patched 15.5.21 release without a major upgrade.
- Removed inverse chunk/version locking, constrained ready invalidation to vector-clearing `stale`, aligned both retrieval RPCs on active-source predicates, hardened retry ancestry and added positively identified local/Preview concurrency harness modes. These local Phase 4A.8 corrections still require independent review before any Preview execution.
- Finalized the local Preview harness gate: official CLI branch identity is checked before database access, concurrency uses a SQL barrier across three iterations, pgTAP covers 82 lifecycle/job/security assertions, and the application exposes a strict `completed` embedding-job contract. PostgreSQL execution remains pending final independent review.

All notable changes are documented here. This project follows a simple unreleased-first format.

## Unreleased

### Fixed

- Ticket creation for new companies failed with "column updated_at of relation tickets does not exist": a legacy DB-side auto-assignment trigger was dropped (routing is owned by the application layer). `profiles.created_at` was also added to match the code's expectations.
- Photo/logo upload never worked for anyone: the `avatars` storage bucket did not exist, **and** the `authenticated` Postgres role had no UPDATE privilege at all on `profiles` (confirmed via `information_schema`), so even with the bucket present the profile-row write always failed. Fixed both; granted UPDATE scoped to exactly `avatar_url` and `availability_status` (verified by RLS simulation that role/organization_id and other users' rows remain unwritable from the browser).
- Assigning a specialty/team to a new employee silently failed to save whenever the value wasn't one of `hardware/software/networking/security/billing/other` — a stale DB check constraint rejected `vpn`, `email`, `m365` and every custom team name, and the API only logged a warning instead of surfacing the failure. The constraint is dropped (specialty is fuzzy-matched, not an enum); team/specialty are now written in the same call as profile creation instead of a fragile two-step update.
- The `manager` role could never actually be assigned — a separate check constraint only allowed `admin/agent/customer`. Fixed.
- `/team/[id]` always 404'd: the query selected `profiles.department`, a column that never existed in this database. Added the column (nullable, used only as a UI fallback label).
- Ticket-system's audit trail (review approvals, customer confirmations, archiving, cleanup, SLA breach logging) was silently going nowhere: this Supabase project is shared with another app that already owns a same-named but structurally different `audit_logs` table. Ticket-system now writes to its own `ticket_audit_logs` table. This also fixes SLA-breach notifications being re-sent on every cron run instead of once (the dedupe check was reading the wrong table).
- Switching the interface language no longer loses active filters/search or the scroll position.
- The admin ticket table now always shows who each ticket belongs to (company, with the contact underneath; falls back to the creator's name).

### Added

- Smart search on every ticket list (admin cockpit, tickets, agent queue, history): one box matching any criterion — TK-ref in any form, subject, company, contact, agent, category, status, priority — all tokens, any order, accent-insensitive.
- Automatic CIF/NIF: companies onboarded by an admin get a well-formed fiscal identifier (deterministic from the company name, official control-digit algorithm) unless one is provided; company Settings shows CIF/NIF instead of Employee ID (self-healing for existing companies) and the sidebar shows company · sector next to the name.
- Ticket History (`/history`) for all roles: customers see their finished tickets, agents their finished assignments, managers/admins everything, including archived. Admins can archive resolved/closed tickets out of the operational lists (audited, restorable) from the cockpit actions.
- Clear inbox model: Inbox (received), To read (truly unread — cleared when the ticket is opened, not the inbox), Outbox (sent) and Waiting tabs, with sender name/company next to each ticket reference.
- AI triage now receives organization context: the org's active categories (preferred for classification) and the submitting company's name, sector and background, grounding category, priority and the suggested reply.
- Day/Night/Auto theme with a light palette for sunlight readability, plus a brightness slider (soft-light overlay, no layout impact), persisted per device and applied before first paint.
- Backlog inheritance: onboarding a new agent with a specialty/team now immediately hands them every currently-unassigned ticket matching that specialty (e.g. a new VPN/Network specialist inherits any open, unrouted VPN ticket), instead of leaving it unrouted until the next matching ticket arrives. Admin gets a toast with the inherited count.
- Admins can create new routing teams inline from the New Employee form (`+ Create new team…`), backed by `POST /api/teams`.

- Heartbeat-verified presence: the app shell pings `/api/profile/heartbeat` every minute and every "online/busy" status older than 3 minutes is displayed as offline (`lib/presence.ts`, migration `docs/migration_presence_heartbeat.sql`). Stale statuses can no longer masquerade as connected.
- Team member profile page (`/team/[id]`) for managers/admins: live presence, last-seen, current in-progress task, workload stats and the full active queue.
- Admin cockpit drill-down: the Open volume, Critical and SLA breached cards open the filtered ticket list; the Team online card names who is connected and opens the online-only team view (`/team?presence=online`); Team status rows link to each member profile.
- Customer resolution sign-off: after the administrator certifies work as resolved, the company confirms ("all good" → closed, audited as `ticket.customer_confirmed`) or reopens within 48h; unanswered resolutions auto-close after 48h via the SLA cron (`ticket.auto_closed`).
- Administrator notifications when an agent submits work for review and when a new ticket lands unrouted in the intake queue.

### Changed

- Inactivity sign-out extended to 30 minutes with the 2-minute warning countdown retained; the timed-out profile is marked offline before redirecting to login.
- Manager/admin dashboard KPI cards deep-link to the corresponding filtered admin views; the team availability panel shows heartbeat-verified presence and links to member profiles.
- Ticket chain of custody now displays six stages ending in "Customer OK".
- App shell navigation switches to the sidebar at `lg` (1024px) instead of `xl`, the mobile bell opens the inbox, and main pages use tighter padding on small screens.
- The AI support chat fallback for customers now uses heartbeat-verified agent presence.
- Team directory shows real presence with last-seen labels, sorts online members first and fixes the Companies section never rendering (customers were excluded from the query).

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

- Rebuilt employee/company provisioning as an accessible, viewport-bounded dialog with background lock, focus management, internal scrolling and fixed actions.
- Reworked administration controls for narrow screens and replaced the clipped mobile user table with action-complete directory cards.
- Contained dense ticket operations in an explicit horizontal viewport instead of allowing administrative controls to render off-screen.
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
