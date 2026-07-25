# Testing strategy

Unit tests cover chunking determinism, hashes, confidence/policy gates, state transitions, idempotency and error classification. Contract tests validate every MCP input/output/error schema and backward compatibility.

Database tests prove RLS and explicit service-role predicates with two organizations, cross-tenant IDs, joins, RPCs and deleted/superseded content. Migration tests run from empty and representative prior schema and verify rollback/runbook assumptions.

RAG tests use curated multilingual gold sets for recall, citation correctness, grounding, abstention, stale versions and prompt injection. No production PII enters fixtures. Provider adapters use recorded/synthetic responses; live evaluations are isolated and budgeted.

Workflow tests exercise duplicate/out-of-order events, concurrency, lease expiry, transient/permanent errors, dead letters, cancellation, approval expiry and external delivery ambiguity. UI accessibility and role-based end-to-end tests cover each dashboard state.

Release gates: zero tenant leaks, zero fabricated citations in adversarial suite, deterministic duplicate handling, approval bypass impossible, acceptable retrieval/latency baseline and documented rollback rehearsal.

Phase 4A adds unit/static coverage and a migration-driven opt-in disposable-database harness. Local mode requires loopback and a guarded database suffix; Preview mode requires an independently verified project ref that matches the connection. The runner applies the real migrations, exercises Alpha/Beta roles, authenticated and backend RPCs, archival, grants, constraints, ready-content immutability, approval invalidation and job history, then proves re-execution fails fast. It also orchestrates two real connections and fails on deadlock, statement timeout or an invalid committed state. Static/mocked tests remain supporting evidence; PostgreSQL execution is still pending.
