# Testing strategy

Unit tests cover chunking determinism, hashes, confidence/policy gates, state transitions, idempotency and error classification. Contract tests validate every MCP input/output/error schema and backward compatibility.

Database tests prove RLS and explicit service-role predicates with two organizations, cross-tenant IDs, joins, RPCs and deleted/superseded content. Migration tests run from empty and representative prior schema and verify rollback/runbook assumptions.

RAG tests use curated multilingual gold sets for recall, citation correctness, grounding, abstention, stale versions and prompt injection. No production PII enters fixtures. Provider adapters use recorded/synthetic responses; live evaluations are isolated and budgeted.

Workflow tests exercise duplicate/out-of-order events, concurrency, lease expiry, transient/permanent errors, dead letters, cancellation, approval expiry and external delivery ambiguity. UI accessibility and role-based end-to-end tests cover each dashboard state.

Release gates: zero tenant leaks, zero fabricated citations in adversarial suite, deterministic duplicate handling, approval bypass impossible, acceptable retrieval/latency baseline and documented rollback rehearsal.

Phase 4A adds unit/static coverage and an opt-in Preview pgTAP harness. The Preview matrix must include Alpha/Beta cross-parent FK rejection, agent write denial, customer read denial, manager/admin own-tenant management, authenticated/backend retrieval isolation, obsolete-version exclusion, invalid dimension/threshold/count rejection and proof that outputs omit vectors. Static tests are supporting evidence, not a substitute for PostgreSQL execution.

