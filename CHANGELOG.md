# Changelog

All notable changes are documented here. This project follows a simple unreleased-first format.

## Unreleased

### Fixed

- Ticket creation for new companies failed with "column updated_at of relation tickets does not exist": a legacy DB-side auto-assignment trigger was dropped (routing is owned by the application layer). `profiles.created_at` was also added to match the code's expectations.
- Photo/logo upload never worked: the `avatars` storage bucket did not exist. Created with public read and per-user write policies — companies, employees and admins can now set their picture in Settings.
- Switching the interface language no longer loses active filters/search or the scroll position.
- The admin ticket table now always shows who each ticket belongs to (company, with the contact underneath; falls back to the creator's name).

### Added

- Smart search on every ticket list (admin cockpit, tickets, agent queue, history): one box matching any criterion — TK-ref in any form, subject, company, contact, agent, category, status, priority — all tokens, any order, accent-insensitive.
- Automatic CIF/NIF: companies onboarded by an admin get a well-formed fiscal identifier (deterministic from the company name, official control-digit algorithm) unless one is provided; company Settings shows CIF/NIF instead of Employee ID (self-healing for existing companies) and the sidebar shows company · sector next to the name.
- Ticket History (`/history`) for all roles: customers see their finished tickets, agents their finished assignments, managers/admins everything, including archived. Admins can archive resolved/closed tickets out of the operational lists (audited, restorable) from the cockpit actions.
- Clear inbox model: Inbox (received), To read (truly unread — cleared when the ticket is opened, not the inbox), Outbox (sent) and Waiting tabs, with sender name/company next to each ticket reference.
- AI triage now receives organization context: the org's active categories (preferred for classification) and the submitting company's name, sector and background, grounding category, priority and the suggested reply.
- Day/Night/Auto theme with a light palette for sunlight readability, plus a brightness slider (soft-light overlay, no layout impact), persisted per device and applied before first paint.

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
