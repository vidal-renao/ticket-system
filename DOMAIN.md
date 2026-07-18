# Domain Model

## Entities

| Entity | Invariant |
| --- | --- |
| Organization | Tenant root; owns operational configuration and data |
| Profile | One Auth identity, one role and at most one organization |
| Ticket | Belongs to one organization and creator; has status and priority |
| Comment | Belongs to one ticket; internal comments are staff-only |
| Attachment | Access is inherited from its ticket |
| SLA policy | Defines response and resolution targets by organization/priority |
| AI analysis | Immutable analysis linked to one ticket; staff-only within tenant |
| Notification | Belongs to exactly one user |
| Audit log | Records significant organization-scoped mutations |

## Roles

| Role | Core permissions |
| --- | --- |
| `customer` | Own tickets and public comments only |
| `agent` | Only tickets explicitly assigned to the authenticated agent |
| `manager` | Organization-wide read-only oversight, analytics and audit visibility |
| `admin` | Organization-wide routing, approval, cleanup, configuration and user administration |

Roles and organization membership are server-controlled. A user cannot change either through profile self-service.

## Ticket Lifecycle

Active statuses include `open`, `in_progress`, `pending_customer` and `pending_third_party`. Resolved/closed states end active SLA processing. Reopening must verify ownership or staff authority, preserve history and recalculate applicable SLA data.

`review_status` is an orthogonal approval state. Agents request review from `in_progress`; only administrators may approve work to `resolved` or return it to `in_progress` with `changes_requested`. Waiting statuses retain their external dependency meanings.

`routing_override` records that an administrator has taken control of category/assignment so asynchronous automation cannot replace that decision. `deleted_at` and `deleted_by` implement recoverable cleanup; permanent destruction is a separate retention concern.

## Rules

- Ticket tenant is derived from the creator's authenticated profile.
- Customers never access another customer's ticket, even in the same organization.
- Internal comments never reach customers.
- Assignment targets must be active agents in the same organization.
- Category and SLA references must belong to the ticket organization.
- AI output cannot directly send a customer reply without human confirmation.
