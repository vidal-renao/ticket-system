-- Preview-only two-session test, session B. Start immediately after session A.
BEGIN;
SET LOCAL statement_timeout = '10s';
UPDATE public.rag_knowledge_document_versions
SET sanitization_status = 'rejected',
    approved_for_embedding_at = NULL,
    approved_by = NULL
WHERE id = '10000000-0000-4000-8000-000000000301';
COMMIT;
-- Expected: UPDATE waits for session A, then atomically leaves the chunk stale
-- with a NULL embedding; retrieval returns no row.

