-- Preview-only two-session test, session A.
BEGIN;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '8s';
UPDATE public.rag_knowledge_chunks
SET embedding = array_fill(0.001::real, ARRAY[1536])::vector,
    embedding_model = 'text-embedding-3-small',
    embedding_dimensions = 1536,
    embedding_status = 'ready'
WHERE id = '10000000-0000-4000-8000-000000000401';
\echo LOCK_ACQUIRED :barrier_id
SELECT pg_sleep(5);
COMMIT;
