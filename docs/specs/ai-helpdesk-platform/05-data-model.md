# Data model

Proposed schema; no migration is applied in Phase 3.

| Entity | Essential fields |
|---|---|
| knowledge_sources | id, organization_id, type, name, policy, status, owner_id, timestamps |
| knowledge_documents | id, organization_id, source_id, title, classification, status, retention |
| knowledge_document_versions | id, organization_id, document_id, version, content_hash, mime, storage_ref, extraction metadata, immutable timestamps |
| knowledge_chunks | id, organization_id, version_id, chunk_index, location, content, content_hash, embedding, model, dimension, active/superseded/deleted |
| embedding_jobs | id, organization_id, version_id, status, attempts, idempotency_key, model/dimension, error |
| retrieval_runs | id, organization_id, ticket_id?, query_hash, filters, candidate IDs/scores, timings, model |
| rag_answers | id, organization_id, retrieval_run_id, answer, confidence, grounded, gaps, recommendation, generation/prompt versions |
| rag_citations | id, organization_id, answer_id, chunk_id, relevance, ordinal |
| workflow_runs | id, organization_id, ticket_id?, type, state, idempotency_key, correlation_id, timestamps |
| workflow_events | id, organization_id, run_id, sequence, type, payload_redacted, occurred_at |
| human_approvals | id, organization_id, run_id, action_type, payload_hash, state, requested/decided actors and times, reason |

Use UUIDs, UTC timestamps, constrained enums/checks and append-only event/audit rows. Unique keys cover `(organization_id, source_id, external_ref)`, `(organization_id, document_id, version)`, chunk hash/version/index and workflow/job idempotency. Vector dimension is tied to an embedding profile; incompatible model changes use parallel columns/tables or reindex generations, never silent mixing.

Every RLS policy derives organization membership from `auth.uid()`. Service-role queries additionally require explicit organization predicates. Storage paths are tenant-scoped and signed.

