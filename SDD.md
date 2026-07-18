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
