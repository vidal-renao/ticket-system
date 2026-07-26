# Workflow orchestration

Main flow: ticket-created event → classification → SLA computation → VIP detection → retrieval → grounded draft → confidence/policy gate → human approval if required → assignment/update/notification → completion audit.

Workflow states are `queued`, `running`, `waiting_for_approval`, `completed`, `failed`, `cancelled`, `delivery_unknown`. They never replace ticket status. Each step appends an event and owns a deterministic idempotency key such as `organization:event:workflow-version:step`.

Retries use exponential backoff with jitter only for classified transient failures. Permanent validation/auth failures stop immediately. Exhausted steps enter a durable dead-letter view with redacted cause and manual replay; replay creates a new attempt linked to the original run. Leases and optimistic versioning prevent concurrent step execution. Cancellation is checked between steps. Compensation revokes pending intents or records a follow-up; irreversible external effects are never “rolled back” fictionally.

MVP recommendation: an internal durable orchestrator backed by Supabase state and Vercel-triggered workers/scheduler. GitHub Actions remains limited to simple administrative schedules and the existing Audit workflow stays disabled. n8n is deferred until integration volume justifies its security/operations boundary.

| Criterion | GitHub Actions | n8n | Internal |
|---|---:|---:|---:|
| Security/control | medium | medium | high |
| Idempotency | low | medium | high |
| Observability | medium | high | high |
| Initial cost | high value | medium | medium |
| Maintenance | low | medium/high | high |
| Scaling | low/medium | medium | high |
| Local development | low | high | high |
| MCP integration | medium | high | high |
| Human approvals | low | high | high |

Staging may trial n8n for non-sensitive integration adapters. Future production chooses it only after threat model, tenancy and operational ownership review.

