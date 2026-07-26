-- Preview-only two-session test, session B. Start immediately after session A.
BEGIN;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '8s';
SET LOCAL search_path = pg_catalog, public, extensions;
UPDATE public.rag_knowledge_document_versions
SET sanitization_status = 'rejected',
    approved_for_embedding_at = NULL,
    approved_by = NULL
WHERE id = '10000000-0000-4000-8000-000000000301';
COMMIT;
-- This waits for session A's chunk row without creating a reverse dependency.
