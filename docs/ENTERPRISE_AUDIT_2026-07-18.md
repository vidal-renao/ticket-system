# Enterprise Workflow Audit

Date: 2026-07-18

Scope: customer intake, automatic routing, agent execution, administrator review, ticket retention and tenant user administration.

## Executive assessment

The application has a credible multi-tenant foundation, authenticated role profiles, owner-scoped customer reads, SLA metadata, audit events and a usable operations interface. It is not yet safe to present its current ticket workflow as enterprise-ready.

Overall workflow readiness: **52/100**.

The principal release blockers are authorization drift between screens and Route Handlers, automatic routing that is not driven by the final classification, the absence of a formal administrator approval gate, and unrestricted operational cleanup semantics.

## Remediation status

Implementation completed on 2026-07-18. The forward migration was applied transactionally to the Ticket System Supabase project and the final policy inventory was verified. All critical/high findings in this audit have code and database remediations. Release readiness remains conditional on authenticated post-deployment E2E and the separate two-tenant disposable-database suite.

## Findings

| ID | Severity | Area | Evidence | Required outcome |
| --- | --- | --- | --- | --- |
| WF-01 | Critical | Agent authorization | `lib/ticket-visibility.ts` grants agents access to unassigned tickets by default. `app/[locale]/(app)/queue/page.tsx` displays the unassigned queue and `AssignToMeButton`. | Agents can read and act only on tickets assigned to their own profile. |
| WF-02 | Critical | Field permissions | `app/api/tickets/[id]/route.ts` accepts status, priority, category, assignee and tags from every staff role. An agent may self-assign an unassigned ticket. | Only an administrator can assign/reassign, change routing category or apply an administrative priority override. |
| WF-03 | High | Automatic routing | Ticket assignment runs before AI triage and falls back to any active agent. The later category result does not route the ticket. | Route by a deterministic category/specialty match and load, never to an unrelated specialist. Leave unmatched work in the administrator queue. |
| WF-04 | High | Review workflow | `pending_customer` is presented by the admin action component as “company review”, although the domain defines it as waiting for requester input. Agents can move directly to `resolved`. | A separate pending administrator review contract is required. Agent requests review; admin approves or requests changes. |
| WF-05 | High | Deletion and retention | No single-ticket or bulk cleanup contract exists. A hard delete would remove operational evidence and may cascade related data. | Admin-only recoverable soft deletion, explicit bulk confirmation, audit record and restore path. |
| WF-06 | High | Tenant administration | User listing is organization-scoped, but managers can access it and mutate some users. Service-role updates do not consistently repeat the organization predicate. | Full tenant directory for administrators; manager access read-only if retained; every service-role write includes the tenant predicate. |
| WF-07 | Medium | Agent workspace | The queue is organized around “mine”, specialty suggestions and unassigned work rather than an execution lifecycle. Critical tickets may include work not assigned to the agent. | Agent dashboard groups only assigned work into assigned, in progress, waiting and ready for review. |
| WF-08 | Medium | Customer workspace | Ownership is correctly scoped, but lifecycle presentation is a generic list and does not explain the chain of custody. | Customer sees only their own tickets grouped into received, in progress, waiting, resolved and closed. |
| WF-09 | Medium | Admin workspace | Existing status tabs cover raw storage statuses but not business stages. There is no “ready for OK” queue, trash view or bulk selection. | Operational tabs: new, assigned, in progress, waiting, ready for OK, processed and trash, with counts. |
| WF-10 | Medium | Data model | Assignment source, admin override, review request/decision and recoverable deletion are not first-class fields. | Add forward-only workflow metadata and indexes; do not rewrite historical migrations. |
| WF-11 | Medium | RLS defense in depth | Historical staff policies grant organization-wide ticket updates. Route Handler checks currently carry more responsibility than the database policy. | Narrow database policies where compatible and retain explicit Route Handler authorization. |
| WF-12 | Low | Product consistency | Status/action labels mix English and localized copy; several legacy indigo values bypass semantic design tokens. | One localized vocabulary and the existing Swiss operations token system across all role workspaces. |

## Target operating model

1. A customer creates a ticket in their organization.
2. Deterministic routing rules classify obvious domains; AI may refine classification asynchronously.
3. The router selects only an active agent whose specialty/team matches the category, using the smallest active workload as the tie-breaker.
4. If no specialist matches, the ticket remains unassigned in the administrator intake queue.
5. Only an administrator may override category, priority or assignee. A manual routing decision locks out later automatic reassignment.
6. The assigned agent moves the ticket through assigned, in progress and legitimate waiting states, then requests administrator review.
7. The administrator approves the work to resolved or requests changes, returning it to the assigned agent.
8. The customer sees the result and retains the existing limited reopen right. Closure remains a separate terminal action.
9. Administrator deletion moves tickets to recoverable trash. Permanent retention processing is a separate governed operation.

## Authorization matrix

| Capability | Customer | Agent | Manager | Administrator |
| --- | ---: | ---: | ---: | ---: |
| Create ticket | Own | No | No | Optional internal tooling |
| Read ticket | Own only | Assigned only | Organization read | Organization read |
| Add public comment | Own | Assigned | Organization | Organization |
| Change execution status | No | Assigned, allowed transitions | No | Yes |
| Request admin review | No | Assigned | No | Yes |
| Approve/request changes | No | No | No | Yes |
| Assign/reassign/unassign | No | No | No | Yes |
| Override category/priority | No | No | No | Yes |
| View all tenant users | No | No | Read-only optional | Yes |
| Create/disable users | No | No | No | Yes |
| Delete/restore tickets | No | No | No | Yes |

## Release gates

- Unit tests for routing, role-field permissions, review transitions and deletion scope.
- Integration checks for two tenants and all three requested roles.
- Zero lint warnings, TypeScript errors and test failures.
- Production build succeeds.
- Manual E2E: customer creates software ticket; software agent alone receives it; agent requests review; administrator rejects once and then approves; customer sees resolution.
- Manual E2E: administrator soft-deletes one ticket and a confirmed batch, then restores one; other tenants remain untouched.

## Audit conclusion

The project should continue to use its current Next.js/Supabase architecture. A rewrite is not justified. The enterprise path is a bounded workflow hardening: centralize authorization and routing rules, introduce review and soft-deletion metadata through one forward migration, then reshape the three role dashboards around the same server-enforced contract.
