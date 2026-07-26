# Product requirements

## Outcome

Extend Ticket System and the existing MCP service into one intelligent helpdesk. No third application is created. Supabase remains the persistent source of truth.

## MVP

- Manually register approved knowledge sources and document versions.
- Validate, extract, sanitize, chunk and embed documents asynchronously.
- Retrieve only within the authenticated organization.
- Analyze category, priority, urgency, impact, VIP status and SLA risk.
- Draft a grounded solution with immutable citations and an honest evidence gap.
- Require human approval for sensitive mutations and customer communication.
- Expose workflow, RAG, knowledge, SLA and delivery status inside Ticket System.
- Preserve the existing idempotent daily SLA audit delivery.
- Provide a public demo-only architecture view with clearly fictional metrics.

## Non-goals

Automatic indexing of every ticket/comment, autonomous closure, complex n8n deployment, multi-model routing, predictive analytics and production auto-resolution are post-MVP.

## Users and authorization

Customers manage their own tickets. Agents act only on assigned/authorized work. Managers observe their organization and approve configured actions. Admins manage organization configuration, knowledge and approval policy. Platform automation never accepts caller-selected tenant identity.

## Measures

Tenant leakage is zero; every answer exposes grounding state and citations; all sensitive actions have a recorded approval; duplicate events do not duplicate effects; operators can diagnose a failed run from one correlation ID; ungrounded drafts never become automatic actions.

