# Security threat model

P0 controls:

- Tenant identity comes only from authenticated profile or fixed trusted deployment configuration; SQL/RPC filters before ranking.
- Service-role access is server-only, purpose-specific and always carries explicit tenant predicates.
- Cross-tenant foreign references are rejected and covered by adversarial tests.
- Approval is mandatory before customer communication, closure, critical priority changes, cross-team reassignment or external action.

Documents are hostile input. Enforce allowlisted MIME plus magic-byte validation, size/page limits, malware scanning, isolated parsing, no macros/scripts/network fetches, HTML sanitization and encrypted tenant-scoped storage. Retrieved instructions never override system/tool policy. Separate evidence from instructions and disallow tool execution sourced from documents.

Deduplicate by content hash; classify and redact/minimize PII before provider submission; record lawful purpose, retention and deletion lineage. Deletion tombstones the document immediately, excludes it from retrieval and schedules physical/vector removal. Versioning is immutable. Model/dimension changes create a new embedding generation and atomic retrieval cutover.

Low confidence or missing evidence yields an abstention. Citations are server-derived. Rate limits, context caps and output schemas mitigate denial/cost abuse. Logs exclude document bodies, prompts containing PII, bearer tokens and provider secrets.

Threat review covers spoofed MIME, poisoned KB, prompt injection, stale embeddings, citation forgery, arbitrary tenant UUID, replayed approvals, confused deputy, service-role leakage and audit tampering.

Phase 4A enforces approved source types and internal visibility. Sanitization approval is represented by status, approver and timestamp, but no sanitizer exists yet. A share lock prevents approval revocation racing a chunk-ready transition; revocation atomically invalidates vectors. Ready content is immutable. The phase performs no upload, extraction, provider call or embedding.

Composite tenant foreign keys protect parent/child integrity independently of RLS. Customers/anon have no table or RPC access. Authenticated retrieval has no organization argument; backend retrieval is revoked from authenticated/anon and accepts organization only as a trusted server parameter.

Ticket System constructs tenant context only from authenticated session/profile inside server-only modules. MCP must derive its separate fixed tenant from validated server configuration; this repository intentionally provides no request-driven or simulated MCP factory.
