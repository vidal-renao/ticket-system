-- Phase 4A: additive, versioned, multi-tenant RAG foundation.
-- Legacy public.knowledge_chunks and public.match_knowledge_chunks are intentionally untouched.
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- Required by composite tenant-safe foreign keys. profiles.id is already
-- unique; this adds an explicit organization-aware candidate key.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_organization_rag_uq UNIQUE (id, organization_id);

CREATE TABLE IF NOT EXISTS public.rag_knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  source_type text NOT NULL,
  visibility text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT rag_sources_org_fk FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT rag_sources_creator_org_fk FOREIGN KEY (created_by, organization_id)
    REFERENCES public.profiles(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT rag_sources_id_org_uq UNIQUE (id, organization_id),
  CONSTRAINT rag_sources_name_org_uq UNIQUE (organization_id, name),
  CONSTRAINT rag_sources_name_ck CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT rag_sources_type_ck CHECK (
    source_type IN ('manual', 'procedure', 'faq', 'knowledge_article', 'approved_resolution')
  ),
  CONSTRAINT rag_sources_visibility_ck CHECK (visibility = 'internal'),
  CONSTRAINT rag_sources_status_ck CHECK (
    status IN ('draft', 'processing', 'ready', 'failed', 'archived', 'deleted')
  ),
  CONSTRAINT rag_sources_deleted_ck CHECK (
    (status = 'deleted' AND deleted_at IS NOT NULL) OR status <> 'deleted'
  )
);

CREATE TABLE IF NOT EXISTS public.rag_knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  source_id uuid NOT NULL,
  title text NOT NULL,
  document_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  current_version_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT rag_documents_source_org_fk FOREIGN KEY (source_id, organization_id)
    REFERENCES public.rag_knowledge_sources(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT rag_documents_creator_org_fk FOREIGN KEY (created_by, organization_id)
    REFERENCES public.profiles(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT rag_documents_id_org_uq UNIQUE (id, organization_id),
  CONSTRAINT rag_documents_title_ck CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  CONSTRAINT rag_documents_type_ck CHECK (
    document_type IN ('manual', 'procedure', 'faq', 'knowledge_article', 'approved_resolution')
  ),
  CONSTRAINT rag_documents_status_ck CHECK (
    status IN ('draft', 'processing', 'ready', 'failed', 'archived', 'deleted')
  ),
  CONSTRAINT rag_documents_deleted_ck CHECK (
    (status = 'deleted' AND deleted_at IS NOT NULL) OR status <> 'deleted'
  )
);

CREATE TABLE IF NOT EXISTS public.rag_knowledge_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version_number integer NOT NULL,
  content_hash text NOT NULL,
  sanitization_status text NOT NULL DEFAULT 'pending',
  ingestion_status text NOT NULL DEFAULT 'pending',
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  approved_for_embedding_at timestamptz,
  approved_by uuid,
  audit_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT rag_versions_document_org_fk FOREIGN KEY (document_id, organization_id)
    REFERENCES public.rag_knowledge_documents(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT rag_versions_creator_org_fk FOREIGN KEY (created_by, organization_id)
    REFERENCES public.profiles(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT rag_versions_approver_org_fk FOREIGN KEY (approved_by, organization_id)
    REFERENCES public.profiles(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT rag_versions_id_org_document_uq UNIQUE (id, organization_id, document_id),
  CONSTRAINT rag_versions_number_uq UNIQUE (organization_id, document_id, version_number),
  CONSTRAINT rag_versions_number_ck CHECK (version_number > 0),
  CONSTRAINT rag_versions_hash_ck CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT rag_versions_sanitization_ck CHECK (
    sanitization_status IN ('pending', 'approved', 'rejected', 'failed')
  ),
  CONSTRAINT rag_versions_ingestion_ck CHECK (
    ingestion_status IN ('pending', 'processing', 'ready', 'failed', 'stale')
  ),
  CONSTRAINT rag_versions_mime_ck CHECK (
    mime_type IN ('text/plain', 'text/markdown', 'text/html', 'application/pdf')
  ),
  CONSTRAINT rag_versions_size_ck CHECK (size_bytes BETWEEN 1 AND 52428800),
  CONSTRAINT rag_versions_approval_ck CHECK (
    (sanitization_status = 'approved'
      AND approved_for_embedding_at IS NOT NULL
      AND approved_by IS NOT NULL)
    OR
    (sanitization_status <> 'approved'
      AND approved_for_embedding_at IS NULL
      AND approved_by IS NULL)
  ),
  CONSTRAINT rag_versions_lifecycle_ck CHECK (
    NOT (superseded_at IS NOT NULL AND ingestion_status NOT IN ('stale', 'failed'))
  )
);

ALTER TABLE public.rag_knowledge_documents
  ADD CONSTRAINT rag_documents_current_version_fk
  FOREIGN KEY (current_version_id, organization_id, id)
  REFERENCES public.rag_knowledge_document_versions(id, organization_id, document_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS public.rag_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_version_id uuid NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  token_count integer,
  page_number integer,
  section text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536),
  embedding_model text,
  embedding_dimensions integer,
  embedding_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT rag_chunks_document_org_fk FOREIGN KEY (document_id, organization_id)
    REFERENCES public.rag_knowledge_documents(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT rag_chunks_version_org_document_fk
    FOREIGN KEY (document_version_id, organization_id, document_id)
    REFERENCES public.rag_knowledge_document_versions(id, organization_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT rag_chunks_id_org_uq UNIQUE (id, organization_id),
  CONSTRAINT rag_chunks_position_uq UNIQUE (organization_id, document_version_id, chunk_index),
  CONSTRAINT rag_chunks_hash_version_uq UNIQUE (organization_id, document_version_id, content_hash),
  CONSTRAINT rag_chunks_index_ck CHECK (chunk_index >= 0),
  CONSTRAINT rag_chunks_content_ck CHECK (char_length(btrim(content)) BETWEEN 1 AND 16000),
  CONSTRAINT rag_chunks_hash_ck CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT rag_chunks_token_ck CHECK (token_count IS NULL OR token_count BETWEEN 1 AND 8192),
  CONSTRAINT rag_chunks_page_ck CHECK (page_number IS NULL OR page_number > 0),
  CONSTRAINT rag_chunks_embedding_status_ck CHECK (
    embedding_status IN ('pending', 'processing', 'ready', 'failed', 'stale')
  ),
  CONSTRAINT rag_chunks_embedding_contract_ck CHECK (
    (
      embedding_status = 'ready'
      AND embedding IS NOT NULL
      AND embedding_model = 'text-embedding-3-small'
      AND embedding_dimensions = 1536
      AND deleted_at IS NULL
    )
    OR
    (
      embedding_status <> 'ready'
      AND embedding IS NULL
      AND (embedding_dimensions IS NULL OR embedding_dimensions = 1536)
    )
  )
);

CREATE TABLE IF NOT EXISTS public.rag_embedding_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_version_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code text,
  last_error_message_sanitized text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rag_jobs_version_org_document_fk
    FOREIGN KEY (document_version_id, organization_id, document_id)
    REFERENCES public.rag_knowledge_document_versions(id, organization_id, document_id)
    ON DELETE RESTRICT,
  CONSTRAINT rag_jobs_id_org_uq UNIQUE (id, organization_id),
  CONSTRAINT rag_jobs_active_version_uq UNIQUE (organization_id, document_version_id),
  CONSTRAINT rag_jobs_status_ck CHECK (
    status IN ('pending', 'processing', 'ready', 'failed', 'stale')
  ),
  CONSTRAINT rag_jobs_attempt_ck CHECK (attempt_count BETWEEN 0 AND 10),
  CONSTRAINT rag_jobs_error_code_ck CHECK (
    last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 80
  ),
  CONSTRAINT rag_jobs_error_message_ck CHECK (
    last_error_message_sanitized IS NULL
    OR char_length(last_error_message_sanitized) <= 500
  ),
  CONSTRAINT rag_jobs_timestamps_ck CHECK (
    (status <> 'processing' OR started_at IS NOT NULL)
    AND (status NOT IN ('ready', 'failed') OR completed_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.rag_knowledge_chunks IS
  'Phase 4A v2 sanitized chunks. Legacy knowledge_chunks remains compatible and separate.';
COMMENT ON COLUMN public.rag_knowledge_chunks.content IS
  'Sanitized, approved content only; raw uploads and PII are prohibited.';
COMMENT ON COLUMN public.rag_embedding_jobs.last_error_message_sanitized IS
  'Bounded operational summary; never document content, stack traces, credentials or PII.';

CREATE INDEX IF NOT EXISTS rag_sources_org_status_idx
  ON public.rag_knowledge_sources (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS rag_documents_org_status_idx
  ON public.rag_knowledge_documents (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS rag_versions_org_document_status_idx
  ON public.rag_knowledge_document_versions (organization_id, document_id, ingestion_status)
  WHERE deleted_at IS NULL AND superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS rag_chunks_retrieval_filter_idx
  ON public.rag_knowledge_chunks
  (organization_id, document_id, document_version_id, embedding_status, id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS rag_jobs_org_status_schedule_idx
  ON public.rag_embedding_jobs (organization_id, status, scheduled_at);

-- Phase 4A intentionally uses exact cosine search. Add ANN only after Preview
-- data volume, filtered recall and latency are measured.

CREATE OR REPLACE FUNCTION public.rag_validate_chunk_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  approved boolean;
BEGIN
  IF NEW.embedding_status = 'ready' THEN
    SELECT (
      sanitization_status = 'approved'
      AND approved_for_embedding_at IS NOT NULL
      AND approved_by IS NOT NULL
      AND ingestion_status = 'ready'
      AND superseded_at IS NULL
      AND deleted_at IS NULL
    )
    INTO approved
    FROM public.rag_knowledge_document_versions
    WHERE id = NEW.document_version_id
      AND document_id = NEW.document_id
      AND organization_id = NEW.organization_id;

    IF approved IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'RAG_VERSION_NOT_APPROVED_FOR_EMBEDDING';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rag_chunks_validate_embedding_trg
  ON public.rag_knowledge_chunks;
CREATE TRIGGER rag_chunks_validate_embedding_trg
BEFORE INSERT OR UPDATE OF embedding, embedding_status, embedding_model, embedding_dimensions
ON public.rag_knowledge_chunks
FOR EACH ROW EXECUTE FUNCTION public.rag_validate_chunk_embedding();

CREATE OR REPLACE FUNCTION public.rag_mark_superseded_chunks_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id
     AND OLD.current_version_id IS NOT NULL THEN
    UPDATE public.rag_knowledge_document_versions
    SET superseded_at = COALESCE(superseded_at, now()),
        ingestion_status = CASE WHEN ingestion_status = 'failed' THEN 'failed' ELSE 'stale' END
    WHERE id = OLD.current_version_id
      AND document_id = NEW.id
      AND organization_id = NEW.organization_id;

    UPDATE public.rag_knowledge_chunks
    SET embedding = NULL,
        embedding_status = 'stale'
    WHERE document_version_id = OLD.current_version_id
      AND document_id = NEW.id
      AND organization_id = NEW.organization_id
      AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rag_documents_supersede_version_trg
  ON public.rag_knowledge_documents;
CREATE TRIGGER rag_documents_supersede_version_trg
AFTER UPDATE OF current_version_id ON public.rag_knowledge_documents
FOR EACH ROW EXECUTE FUNCTION public.rag_mark_superseded_chunks_stale();

CREATE OR REPLACE FUNCTION public.search_rag_knowledge_authenticated(
  query_embedding vector(1536),
  match_count integer DEFAULT 3,
  match_threshold double precision DEFAULT 0.5
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  document_version_id uuid,
  document_title text,
  section text,
  page_number integer,
  content text,
  similarity double precision,
  content_hash text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF match_count < 1 OR match_count > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RAG_MATCH_COUNT_OUT_OF_RANGE';
  END IF;
  IF match_threshold < 0 OR match_threshold > 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RAG_THRESHOLD_OUT_OF_RANGE';
  END IF;

  RETURN QUERY
  SELECT c.id, c.document_id, c.document_version_id, d.title, c.section,
         c.page_number, c.content,
         (1 - (c.embedding <=> query_embedding))::double precision,
         c.content_hash
  FROM public.rag_knowledge_chunks c
  JOIN public.rag_knowledge_documents d
    ON d.id = c.document_id AND d.organization_id = c.organization_id
  JOIN public.rag_knowledge_document_versions v
    ON v.id = c.document_version_id
   AND v.document_id = c.document_id
   AND v.organization_id = c.organization_id
  WHERE c.organization_id = public.current_profile_org_id()
    AND public.current_profile_role() IN ('agent', 'manager', 'admin')
    AND d.current_version_id = v.id
    AND d.status = 'ready' AND d.deleted_at IS NULL
    AND v.sanitization_status = 'approved'
    AND v.ingestion_status = 'ready'
    AND v.approved_for_embedding_at IS NOT NULL
    AND v.superseded_at IS NULL AND v.deleted_at IS NULL
    AND c.embedding_status = 'ready'
    AND c.embedding IS NOT NULL AND c.deleted_at IS NULL
    AND 1 - (c.embedding <=> query_embedding) >= match_threshold
  ORDER BY c.embedding <=> query_embedding, c.id
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_rag_knowledge_backend(
  trusted_organization_id uuid,
  query_embedding vector(1536),
  match_count integer DEFAULT 3,
  match_threshold double precision DEFAULT 0.5
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  document_version_id uuid,
  document_title text,
  section text,
  page_number integer,
  content text,
  similarity double precision,
  content_hash text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF trusted_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RAG_ORGANIZATION_REQUIRED';
  END IF;
  IF match_count < 1 OR match_count > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RAG_MATCH_COUNT_OUT_OF_RANGE';
  END IF;
  IF match_threshold < 0 OR match_threshold > 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RAG_THRESHOLD_OUT_OF_RANGE';
  END IF;

  RETURN QUERY
  SELECT c.id, c.document_id, c.document_version_id, d.title, c.section,
         c.page_number, c.content,
         (1 - (c.embedding <=> query_embedding))::double precision,
         c.content_hash
  FROM public.rag_knowledge_chunks c
  JOIN public.rag_knowledge_documents d
    ON d.id = c.document_id AND d.organization_id = c.organization_id
  JOIN public.rag_knowledge_document_versions v
    ON v.id = c.document_version_id
   AND v.document_id = c.document_id
   AND v.organization_id = c.organization_id
  WHERE c.organization_id = trusted_organization_id
    AND d.current_version_id = v.id
    AND d.status = 'ready' AND d.deleted_at IS NULL
    AND v.sanitization_status = 'approved'
    AND v.ingestion_status = 'ready'
    AND v.approved_for_embedding_at IS NOT NULL
    AND v.superseded_at IS NULL AND v.deleted_at IS NULL
    AND c.embedding_status = 'ready'
    AND c.embedding IS NOT NULL AND c.deleted_at IS NULL
    AND 1 - (c.embedding <=> query_embedding) >= match_threshold
  ORDER BY c.embedding <=> query_embedding, c.id
  LIMIT match_count;
END;
$$;

ALTER TABLE public.rag_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_knowledge_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rag_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_knowledge_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rag_knowledge_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_knowledge_document_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rag_knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_knowledge_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rag_embedding_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_embedding_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY rag_sources_staff_read ON public.rag_knowledge_sources
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('agent', 'manager', 'admin')
  AND deleted_at IS NULL
);
CREATE POLICY rag_sources_lead_manage ON public.rag_knowledge_sources
FOR ALL TO authenticated
USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
)
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);

CREATE POLICY rag_documents_staff_read ON public.rag_knowledge_documents
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('agent', 'manager', 'admin')
  AND deleted_at IS NULL
);
CREATE POLICY rag_documents_lead_manage ON public.rag_knowledge_documents
FOR ALL TO authenticated
USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
)
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);

CREATE POLICY rag_versions_staff_read ON public.rag_knowledge_document_versions
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('agent', 'manager', 'admin')
  AND deleted_at IS NULL
);
CREATE POLICY rag_versions_lead_manage ON public.rag_knowledge_document_versions
FOR ALL TO authenticated
USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
)
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);

CREATE POLICY rag_chunks_staff_read ON public.rag_knowledge_chunks
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('agent', 'manager', 'admin')
  AND deleted_at IS NULL
);
CREATE POLICY rag_chunks_lead_manage ON public.rag_knowledge_chunks
FOR ALL TO authenticated
USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
)
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);

CREATE POLICY rag_jobs_lead_read ON public.rag_embedding_jobs
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);
CREATE POLICY rag_jobs_lead_manage ON public.rag_embedding_jobs
FOR ALL TO authenticated
USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
)
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);

REVOKE ALL ON public.rag_knowledge_sources FROM PUBLIC, anon;
REVOKE ALL ON public.rag_knowledge_documents FROM PUBLIC, anon;
REVOKE ALL ON public.rag_knowledge_document_versions FROM PUBLIC, anon;
REVOKE ALL ON public.rag_knowledge_chunks FROM PUBLIC, anon;
REVOKE ALL ON public.rag_embedding_jobs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.rag_knowledge_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rag_knowledge_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rag_knowledge_document_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rag_knowledge_chunks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rag_embedding_jobs TO authenticated;
GRANT ALL ON public.rag_knowledge_sources TO service_role;
GRANT ALL ON public.rag_knowledge_documents TO service_role;
GRANT ALL ON public.rag_knowledge_document_versions TO service_role;
GRANT ALL ON public.rag_knowledge_chunks TO service_role;
GRANT ALL ON public.rag_embedding_jobs TO service_role;

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

COMMIT;
