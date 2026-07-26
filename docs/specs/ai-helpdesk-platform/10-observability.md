# Observability

Use structured events with `timestamp`, environment, service, organization pseudonymous key, correlation/run/trace/ticket IDs, step, outcome, duration and safe error code. Do not log bodies, secrets, raw embeddings or PII.

Metrics: workflow throughput/state age/retries/dead letters; retrieval latency/candidate count/top score/abstention; generation latency/tokens/cost/grounded rate; ingestion backlog/failures/staleness; approval wait/accept/reject; SLA compliance; audit delivery states and reconciliation.

Traces join inbound event, MCP call, database operation, provider request (provider ID only), approval and effect. Alerts cover tenant-scope invariant failures, service-role authorization failures, stalled runs, elevated provider errors, ingestion backlog, delivery_unknown and scheduler absence.

Operational audit records schema/prompt/model/embedding versions and immutable evidence IDs. Retention differs for security audit, operational telemetry and document content. Dashboards must surface partial provider outages without implying healthy completion.

