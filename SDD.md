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
2. An agent can access their assigned tickets and, only where explicitly requested, unassigned tickets in the same organization.
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

- Unit: customer owner/non-owner, agent assigned/unassigned/foreign, manager tenant boundary — passed.
- Unit: valid and invalid lifecycle transitions and reopened SLA deadline calculation — passed.
- Unit: explicit customer/third-party waiting-state round trips and AI priority/SLA rules — passed.
- Static: ESLint with zero warnings and TypeScript — passed on 2026-07-18.
- Application: 21 Vitest tests and a 72-page Next.js production build — passed on 2026-07-18.
- Visual: desktop and 384 px mobile landing review, no horizontal overflow or console errors — passed on 2026-07-18.
- Dependency gate: no high or critical advisories; two moderate transitive PostCSS advisories remain upstream.
- Remaining external validation: two-tenant RLS integration suite against disposable Supabase.
