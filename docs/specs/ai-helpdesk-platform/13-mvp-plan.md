# Phased implementation plan

Each phase requires security review, tests, acceptance criteria, rollback and stop-condition evidence.

| Phase | Scope and dependency | Migration/rollback |
|---|---|---|
| 4A | Tenant-safe RAG schema/RLS/RPC; owner decisions | additive tables; disable feature/drop only after retention review |
| 4B | Manual document ingestion and jobs; 4A | storage/jobs; pause workers and tombstone |
| 4C | Retrieval service and evaluations; 4B | traces; switch retrieval generation off |
| 4D | Grounded MCP read tools; 4C | contracts/traces; feature flag |
| 5A | Workflow run/event model; 4D | additive state; stop consumers |
| 5B | Human approvals; 5A | approval records; deny actions |
| 5C | Internal orchestration; 5B | leases/dead letters; pause scheduler |
| 6A | Operational dashboard; 5C | read models optional; hide route |
| 6B | Knowledge management UI; 4B | none beyond prior; disable writes |
| 6C | RAG observability/evaluation; 4C | telemetry; disable export |
| 7 | Controlled staging with synthetic data | isolated environment; destroy staging only |
| 8 | Production canary and expansion | flags/generations; revert canary |
| 9 | Static public architecture landing | no production dependency; remove route |

Every phase documents scope, dependencies, migrations, threat changes, unit/contract/RLS/e2e tests, measurable acceptance and rollback rehearsal. A failed tenant, citation or approval invariant is an immediate stop.

Phase 4A.8 local corrections remove inverse locking and strengthen retrieval, invalidation, retry integrity and disposable-target verification. They are not independently reviewed or PostgreSQL-verified. Independent review remains mandatory before Preview execution; Phase 4B is not authorized.
