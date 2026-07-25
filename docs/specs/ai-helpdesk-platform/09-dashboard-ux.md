# Dashboard UX

Private navigation adds Operations with organization-scoped views:

- Overview: open, compliant, overdue, at-risk and VIP tickets; active/failed workflows; recent audits.
- SLA: compliance by company, priority, agent and period; trend and breach drill-down.
- Workflow Runs: state, trigger, ticket, duration, current step, retries, error, approval and correlation ID.
- RAG: queries, confidence, retrieved documents/citations, latency, abstentions, human feedback and optional token/cost.
- Knowledge Base: source/document/version, ingestion state, chunks, embedding profile, last sync, errors and controlled reindex.
- Audit Delivery: pending/sending/sent/failed/delivery_unknown, provider message ID and reconciliation.
- Security & Health: MCP, Supabase, scheduler/workers and incomplete configuration without secret values.

Default pages favor exceptions and actionable queues. Filters persist in the URL; every metric exposes its definition and time range. Empty, loading, stale, partial and permission-denied states are explicit. Correlation IDs link ticket, workflow, retrieval, approval and delivery traces.

The public portfolio is a separate read-only presentation using hard-coded demo data and “fictional” labels. It diagrams Ticket → MCP → RAG/pgvector → Human approval → Action → Audit/dashboard and has no production queries or internal identifiers.

