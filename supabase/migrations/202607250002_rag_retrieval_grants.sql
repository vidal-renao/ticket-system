-- Phase 4A retrieval boundary hardening.
-- Applied after the additive v2 model; no data is changed.
BEGIN;

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
