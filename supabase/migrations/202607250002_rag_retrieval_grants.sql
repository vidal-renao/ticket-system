-- Phase 4A retrieval boundary hardening.
-- Applied after the additive v2 model; no data is changed.
BEGIN;

-- Supabase projects have "extensions" in the platform-wide default
-- search_path, so `vector` resolves there without this; a plain
-- PostgreSQL session (e.g. a disposable CI database) does not carry that
-- convention, so the bare `vector` type references below would otherwise
-- fail to resolve in a fresh session. Matches the SET LOCAL already used
-- by 202607250001_rag_foundation_v2.sql.
SET LOCAL search_path = pg_catalog, public, extensions;

REVOKE ALL ON FUNCTION public.search_rag_knowledge_authenticated(
  vector, integer, double precision
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_rag_knowledge_authenticated(
  vector, integer, double precision
) TO authenticated;

REVOKE ALL ON FUNCTION public.search_rag_knowledge_backend(
  uuid, vector, integer, double precision
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_rag_knowledge_backend(
  uuid, vector, integer, double precision
) TO service_role;

REVOKE ALL ON FUNCTION public.rag_validate_chunk_embedding()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rag_invalidate_chunks_on_version_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rag_mark_superseded_chunks_stale()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rag_enforce_state_transition()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rag_enforce_version_transition()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rag_validate_embedding_job_retry()
  FROM PUBLIC, anon, authenticated;

-- Preserve the legacy contract for its known server-side triage consumer, but
-- close arbitrary organization selection to browser/session roles.
DO $$
BEGIN
  IF to_regprocedure(
    'public.match_knowledge_chunks(vector,uuid,integer,double precision)'
  ) IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.match_knowledge_chunks(
      vector, uuid, integer, double precision
    ) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(
      vector, uuid, integer, double precision
    ) TO service_role;
  END IF;
END;
$$;

COMMIT;
