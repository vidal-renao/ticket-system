# Spec-Driven Development

Meaningful features and changes to authorization, data, lifecycle, integrations or UI flows follow this sequence:

## Context

Describe the existing behavior, actors, code paths and data involved.

## Problem

State the user or operational problem without prescribing implementation.

## Requirements

List observable outcomes, authorization rules, error states and acceptance criteria.

## Constraints

Record compatibility, tenant isolation, privacy, migration, performance and rollout constraints.

## Design

Define changed boundaries, contracts, schema, threat considerations and alternatives rejected.

## Implementation

Split work into reviewable changes. Include migrations and feature flags where rollback requires them.

## Validation

Map each requirement to unit, integration, component, E2E or manual verification. Record actual results and unresolved risk.

A specification may be a focused issue or document; it must exist before coding for changes with cross-module or production-data impact.

---

# Active Specification: Enterprise Stabilization

Status: implemented; external integration gate pending
Owner: Senior Software Development
Started: 2026-07-18

## Context

HelpDesk AI is a multi-tenant support product. Ticket reads and mutations currently mix session clients and service-role clients. The customer experience, staff queue, comments, lifecycle, SLA, notifications and AI automation all depend on a consistent ticket authorization contract.

## Problem

Customer ticket access is scoped to an organization but not consistently to the ticket creator. Reopening bypasses the canonical lifecycle and does not correctly reset resolution SLA state. Existing tests do not cover either contract.

The application also collapses two operational waiting reasons into one, contains unverified product claims, and lacks a documented visual system suitable for a credible commercial release.

## Requirements

1. A customer can read or mutate only tickets where `created_by` equals the authenticated profile ID.
2. An agent can access only tickets assigned to their profile; the enterprise chain-of-custody specification below supersedes the former optional unassigned queue.
3. Managers and admins can access tickets only in their organization.
4. Every service-role mutation includes explicit organization and ownership/assignment predicates appropriate to the actor.
5. Reopening is allowed only from `resolved` or `closed`; customers may reopen only their own resolved ticket within 48 hours.
6. A reopened ticket enters `in_progress`, clears terminal timestamps and receives a new resolution deadline from the active SLA policy.
7. Authorization and lifecycle behavior are covered by deterministic unit tests.
8. Public errors remain generic and operational logs contain no ticket content or secrets.
9. `pending_customer` and `pending_third_party` remain distinct in lifecycle mapping, filters and active-work counters.
10. AI priority changes recalculate SLA deadlines only when a human has not already changed the priority.
11. Public copy avoids unverified compliance, residency, accuracy and customer-result claims.
12. Core product surfaces use accessible, responsive semantic design tokens.

## Constraints

- No historical migration is edited to represent a production change.
- Existing legacy database status values remain compatible.
- Service-role usage remains available only where RLS cannot yet express the operation, with explicit predicates.
- Schema changes require a new idempotent migration and are outside this first stabilization slice.

## Design

- Add a pure `canProfileAccessTicket` policy and make query scoping and point lookups share it.
- Scope customer queries by both `organization_id` and `created_by`.
- Reuse `resolveTicketAccess` in customer Server Actions.
- Add a pure SLA reopen patch builder so deadline behavior is testable without Supabase.
- Export shared active/waiting status sets to remove divergent route and UI lists.
- Apply a Swiss operations control-room system: graphite surfaces, signal blue, SLA amber, mint success and a restrained pulse-line signature.
- Keep Route Handlers responsible for HTTP mapping; domain rules remain in `lib/`.

## Validation

- Production role E2E exposed legacy schema drift: `tickets.metadata` was missing and PostgREST rejected the admin ticket list selection. `docs/migration_ticket_metadata_compat.sql` restores the documented JSONB compatibility column while workflow and authorization remain first-class fields.
- Unit: customer owner/non-owner, agent assigned/unassigned/foreign, manager tenant boundary — passed.
- Unit: valid and invalid lifecycle transitions and reopened SLA deadline calculation — passed.
- Unit: explicit customer/third-party waiting-state round trips and AI priority/SLA rules — passed.
- Static: ESLint with zero warnings and TypeScript — passed on 2026-07-18.
- Application: 21 Vitest tests and a 72-page Next.js production build — passed on 2026-07-18.
- Visual: desktop and 384 px mobile landing review, no horizontal overflow or console errors — passed on 2026-07-18.
- Dependency gate: no high or critical advisories; two moderate transitive PostCSS advisories remain upstream.
- Remaining external validation: two-tenant RLS integration suite against disposable Supabase.

---

# Active Specification: Enterprise Ticket Chain of Custody

Status: deployed and production E2E verified; external tenant-isolation gate pending
Owner: Senior Software Development
Started: 2026-07-18
Audit: `docs/ENTERPRISE_AUDIT_2026-07-18.md`

## Context

The product already stores tenant-scoped tickets, profiles, categories, teams, SLA state and audit events. Customers have an owner-scoped ticket list. Agents currently have optional access to unassigned work and may claim it. Ticket routing occurs before asynchronous AI classification, and the staff PATCH route exposes administrative fields to agents.

## Problem

There is no enforceable chain of custody from customer intake through specialist execution to administrator approval. UI labels, visibility helpers and mutation permissions disagree. “Waiting for customer” is incorrectly reused as an internal review state, and operational cleanup has no recoverable or audited design.

## Requirements

1. Customers create and access only their own tickets inside their organization.
2. Agents access only tickets assigned to their profile and cannot self-assign.
3. Automatic routing selects only an active specialist matching the ticket category/team; unmatched tickets remain unassigned for admin triage.
4. Only administrators assign, reassign or unassign tickets and override category or priority.
5. An administrator override prevents later automatic reassignment.
6. Agents may start assigned work, enter/leave legitimate waiting states and request administrator review.
7. An agent cannot resolve, close, delete or administratively reroute a ticket.
8. Administrator review has explicit pending, approved and changes-requested outcomes without overloading customer waiting states.
9. Admin tabs expose new, assigned, in progress, waiting, ready for OK, processed and trash queues with tenant-scoped counts.
10. Agent and customer workspaces group only their visible tickets by business stage.
11. Administrators can view every profile and customer record in their tenant and are the only role that can create, change role or disable users.
12. Administrators can soft-delete one ticket or a confirmed batch, inspect trash and restore tickets. No UI operation permanently destroys ticket history.
13. Every service-role query and mutation includes explicit organization plus actor-specific predicates.
14. Routing, field permissions, review decisions and deletion/restoration emit audit events without ticket content.

## Constraints

- Preserve the existing storage status enum and the distinct meanings of `pending_customer` and `pending_third_party`.
- Add workflow metadata only through a new idempotent forward migration.
- Existing tickets remain readable after rollout and receive safe defaults.
- Public registration remains customer-only.
- The service-role key never reaches browser code.
- Bulk operations are tenant-bound, recoverable and require explicit confirmation.
- The UI continues the existing Swiss operations control-room design and semantic tokens.

## Design

- Keep operational status and review decision separate. Add `review_status` (`not_requested`, `pending`, `approved`, `changes_requested`) plus request/review actor timestamps.
- Add `routing_override`, `assigned_by` and `assigned_at`. Automatic routing may update only unassigned tickets where `routing_override = false`; every admin assignment decision sets the override.
- Add `deleted_at` and `deleted_by`. Standard queries exclude deleted tickets; trash queries include only deleted tickets.
- Put pure role/field/transition rules in `lib/ticket-workflow.ts` and pure specialist selection in `lib/ticket-routing.ts`.
- Expose dedicated review and deletion Route Handlers rather than overloading the generic ticket PATCH contract.
- Treat “ready for OK” as `review_status = pending`; admin approval atomically sets review approved and status resolved. A change request returns the ticket to in progress.
- Use the ticket detail as the visible chain-of-custody surface, showing intake, routing, execution, review and resolution milestones.

## Implementation

1. Add domain rules, migration and generated-equivalent TypeScript types.
2. Harden ticket visibility and field-level mutation permissions.
3. Replace generic fallback assignment with category/specialty load-balanced routing.
4. Add review, soft-delete, restore and bulk-delete endpoints with audit events.
5. Rebuild admin status controls and add safe cleanup controls.
6. Rebuild agent and customer stage views and remove self-assignment.
7. Harden tenant user administration and align documentation.

## Validation

- Unit: strict owner/assignee/admin access matrix â€” passed.
- Unit: exact-specialty routing, load balancing and no-match behavior â€” passed.
- Unit: role-specific patch fields, review decisions and business-stage projection â€” passed.
- Application: zero-warning ESLint, TypeScript and 29 Vitest tests â€” passed on 2026-07-18.
- Database: forward migration applied; final RLS inventory contains only the intended enterprise ticket/comment/profile/AI policies â€” passed on 2026-07-18.
- Build and CI: clean `npm ci`, lint, TypeScript, 29 Vitest tests, Next.js production build and high-severity audit gate passed in GitHub Actions run `29659316815` on 2026-07-18.
- Production schema compatibility: the authenticated admin E2E exposed a missing legacy `tickets.metadata` column; `docs/migration_ticket_metadata_compat.sql` was applied as an additive, idempotent migration and the admin inventory recovered.
- Production role E2E: customer `TK-0068` creation was automatically classified as Software and assigned to the least-loaded matching `software` specialist; the agent saw only the assigned task, started it and submitted it for admin review; the admin approved it as resolved and moved the disposable test ticket to recoverable trash. Passed on 2026-07-18.
- Production administration E2E: active/new/assigned/in-progress/waiting/ready/processed/trash views, single-ticket cleanup, team workload and the complete tenant user directory were exercised with authenticated demo roles.
- Remaining external validation: automated two-tenant RLS integration suite against a disposable Supabase project.

---

# Active Specification: Responsive Administration Workspace

Status: implemented; visual and CI validation pending
Owner: Senior Software Development
Started: 2026-07-19

## Context

Administrator account provisioning uses one modal from both the ticket operations page and user directory. The existing fixed, vertically centered panel is taller than short mobile viewports and clips its own form because the panel uses `overflow-hidden` without a scrollable content region. Administrative action rows and the user directory table also exceed narrow viewports.

## Requirements

1. Employee and company forms remain fully usable at 320 px width and short 667 px viewports.
2. Modal header and actions remain visible while only the form body scrolls.
3. Opening a modal locks background scroll, moves focus into the form, traps keyboard focus and supports Escape/explicit close.
4. Every form control has a programmatic label and password visibility is keyboard accessible.
5. Administrative header actions wrap without increasing document width.
6. The mobile user directory presents readable cards with all edit and activation actions visible.
7. Dense ticket operations use an explicit contained horizontal viewport rather than clipping content.
8. Desktop density and the existing Swiss operations visual system remain intact.

## Design

- Treat account creation as an identity-provisioning dossier: one restrained signal-blue control line, concise operational copy and a two-column desktop field grid.
- Render the mobile modal as a bottom sheet bounded by `100dvh`; use a flex column with a scrollable body and fixed header/footer.
- Replace the user table below the medium breakpoint with action-complete directory cards; retain the dense table on larger screens.
- Keep workflow tabs intentionally horizontally scrollable because their sequence is meaningful and preserve their active-state semantics with `aria-pressed`.

## Validation

- Pending: production-equivalent desktop and 390 x 667 mobile visual checks for both account types.
- Pending: keyboard focus, Escape, background lock and internal-scroll verification.
- Pending: ESLint, TypeScript, Vitest and production build.

---

# Active Specification: User Identity, Profile Management and Admin Onboarding

Status: implemented; production migration/backfill/deploy pending
Owner: Senior Software Development
Started: 2026-07-27

## Context

Profiles had no public, non-sequential identifier (the existing `employee_id` is a globally sequential `EMP-0001`-style counter applied to every role, not a per-role public code) and no distinction between an individual customer and a company customer — every admin-created "customer" was implicitly treated as a company. Admin onboarding used one generic modal with an internal agent/customer toggle, and customer accounts were provisioned with an admin-visible temporary password rather than an email invitation. See DECISIONS.md ADR-015 for the full rationale and ADR-003 for the invitation gap this closes.

## Requirements

1. Every profile gets an immutable, server-generated `VRE-<ADM|MGR|EMP|CUS|COM>-XXXX-XXXX` reference code, never client- or admin-supplied.
2. `customer_type` (`individual`/`company`) distinguishes the two customer kinds; not self-service-editable.
3. New customer onboarding uses two separate routes/schemas/API endpoints (individual vs. company), never a single generic form, and always resolves the canonical Vidal Real Estate tenant server-side.
4. New customer accounts are provisioned by email invitation, not an admin-visible temporary password.
5. Self-service profile editing (name, phone, locale, address, company contact/website, avatar/logo) stays column-grant-restricted; email, role, tenant, customer_type and reference_code are never editable through it.
6. Existing users are backfilled: customer_type from `customers_info` evidence, reference codes for all 25 existing profiles, and canonical tenant assignment for the profiles positively identified as legitimate.

## Constraints

- Additive migrations only; forward-only per ADR-006.
- No duplicate profile-editing surface: extend the existing `/settings` page rather than build a new `/dashboard/profile`.
- No duplicate Storage mechanism: the new `logos` bucket mirrors the existing `avatars` bucket's already-reviewed public/folder-scoped-RLS pattern.
- Real PostgreSQL execution (ephemeral CI, `identity-foundation` job) required before production, matching the `rag-foundation` job's isolation model.

## Design

- `reference_code`/`customer_type` live on `profiles`, generated by a `BEFORE INSERT OR UPDATE` trigger that resolves a role/type-derived prefix and a crypto-random ambiguity-free suffix, with a bounded collision-retry loop; a separate trigger blocks any change to an already-set `reference_code`.
- `customer_type IS NULL` is a valid transitional state (matching `handle_new_user()`'s bare insert, which can never supply it) — only a non-NULL value is constrained to a valid customer_type + role=customer combination.
- Canonical tenant resolved server-side via `organizations.slug = 'vidal-real-estate'`, never a frontend-hardcoded UUID.
- `/api/admin/customers/individual` and `/api/admin/customers/company`: independent Zod schemas, independent routes, both invite via `supabase.auth.admin.inviteUserByEmail` and impose role/customer_type/organization_id/reference_code server-side only.
- `CreateUserModal` narrowed to agent-only; the admin panel gained dedicated "New Individual Customer" / "New Company" actions routing to the new pages.

## Implementation

- Migrations: `202607270001_user_identity_onboarding.sql` (schema, triggers, grants, `logos` bucket), `202607270002_user_identity_backfill_organization.sql` (tenant backfill for the 10 evidence-based legitimate profiles).
- `lib/organizations.ts`, `lib/validation/security.ts` (new schemas), `app/api/admin/customers/{individual,company}/route.ts`, `components/admin/{IndividualCustomerForm,CompanyCustomerForm}.tsx`, `components/settings/{PersonalDetailsForm,LogoUpload}.tsx`.

## Validation

- 42 real pgTAP assertions, `identity-foundation` CI job (ephemeral PostgreSQL 17.6).
- Vitest: Zod contract tests proving role/organization_id/customer_type/reference_code cannot be injected through any of the new schemas.
- Pending: production migration application, backfill count verification, Vercel production deploy and non-destructive smoke tests.
