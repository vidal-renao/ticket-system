\set ON_ERROR_STOP on
SET search_path = pg_catalog, public, extensions;

DO $$
DECLARE
  version_status text;
  chunk_status text;
  chunk_has_embedding boolean;
  backend_matches bigint;
BEGIN
  SELECT sanitization_status
  INTO version_status
  FROM public.rag_knowledge_document_versions
  WHERE id = '10000000-0000-4000-8000-000000000301';

  SELECT embedding_status, embedding IS NOT NULL
  INTO chunk_status, chunk_has_embedding
  FROM public.rag_knowledge_chunks
  WHERE id = '10000000-0000-4000-8000-000000000401';

  SELECT count(*)
  INTO backend_matches
  FROM public.search_rag_knowledge_backend(
    '10000000-0000-4000-8000-000000000001',
    array_fill(0.001::real, ARRAY[1536])::vector, 3, 0
  );

  IF version_status IS DISTINCT FROM 'rejected'
     OR chunk_status IS DISTINCT FROM 'stale'
     OR chunk_has_embedding
     OR backend_matches <> 0 THEN
    RAISE EXCEPTION 'RAG_CONCURRENCY_FINAL_STATE_INVALID';
  END IF;
END;
$$;
