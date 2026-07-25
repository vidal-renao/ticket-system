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

