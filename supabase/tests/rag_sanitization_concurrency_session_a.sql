-- Preview-only two-session test, session A.
BEGIN;
UPDATE public.rag_knowledge_chunks
SET embedding_status = 'processing'
WHERE id = '10000000-0000-4000-8000-000000000401';
-- The next statement takes FOR SHARE on the version inside the trigger.
UPDATE public.rag_knowledge_chunks
SET embedding = array_fill(0.001::real, ARRAY[1536])::vector,
    embedding_model = 'text-embedding-3-small',
    embedding_dimensions = 1536,
    embedding_status = 'ready'
WHERE id = '10000000-0000-4000-8000-000000000401';
SELECT pg_sleep(5);
COMMIT;

