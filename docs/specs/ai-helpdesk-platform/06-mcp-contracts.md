# MCP contracts

The current eight tools remain compatibility contracts: `create_ticket`, `get_ticket_status`, `list_tickets`, `prioritize_incident`, `suggest_solution`, `update_ticket_status`, `generate_report`, `get_sla_audit_report`. Read-only: get/list/report/audit. Mutating: create/prioritize/suggest (comment/status side effect)/update.

Target contracts (names provisional):

| Contract | Mode | Purpose | Approval |
|---|---|---|---|
| retrieve_knowledge | read | tenant-scoped candidates and trace ID | no |
| draft_grounded_solution | read | answer/evidence/gaps; persists audit trace only | no customer effect |
| analyze_ticket | read/record | structured analysis and SLA/VIP signals | no |
| get_ticket_context | read | authorized ticket context | no |
| request_ticket_action | write-intent | creates pending approval/action | usually |
| decide_ticket_action | write | authorized approval decision | role/policy |
| get_workflow_run | read | run/events/errors | no |
| get_rag_trace | read | retrieval/generation/citations | staff only |

All schemas are strict and versioned. Inputs omit `organization_id`; trusted MCP deployment context supplies it. Outputs include `schema_version`, `correlation_id`, `trace_id`, `result`, and structured `error {code,message,retryable,details_safe}`.

Every contract defines least-privilege role, ticket visibility, idempotency key for writes, bounded timeout, per-tenant/tool rate limit, redacted audit entry and side effects. Read calls target 10 seconds; embedding/generation uses asynchronous jobs rather than extending tool deadlines. Approval binds action type, target, payload hash and expiry. A retry with the same key returns the prior result.

