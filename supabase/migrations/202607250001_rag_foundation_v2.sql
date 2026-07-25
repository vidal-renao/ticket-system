-- Phase 4A: additive, versioned, multi-tenant RAG foundation.
-- Legacy public.knowledge_chunks and public.match_knowledge_chunks are intentionally untouched.
BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Fail fast instead of accepting partial or conflicting v2 objects.
DO $preflight$
DECLARE
  object_name text;
BEGIN
  IF to_regclass('public.organizations') IS NULL
     OR to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'RAG_PREFLIGHT_MISSING_CORE_TABLES';
  END IF;
  IF to_regprocedure('public.current_profile_org_id()') IS NULL
     OR to_regprocedure('public.current_profile_role()') IS NULL THEN
    RAISE EXCEPTION 'RAG_PREFLIGHT_MISSING_IDENTITY_HELPERS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'RAG_PREFLIGHT_MISSING_SUPABASE_ROLES';
  END IF;

  FOREACH object_name IN ARRAY ARRAY[
    'rag_knowledge_sources',
    'rag_knowledge_documents',
    'rag_knowledge_document_versions',
    'rag_knowledge_chunks',
    'rag_embedding_jobs'
  ] LOOP
    IF to_regclass('public.' || object_name) IS NOT NULL THEN
      RAISE EXCEPTION 'RAG_PREFLIGHT_UNEXPECTED_V2_OBJECT: %', object_name;
    END IF;
  END LOOP;
END;
$preflight$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

DO $vector_preflight$
DECLARE
  vector_schema text;
BEGIN
  SELECT namespace.nspname
  INTO vector_schema
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'vector';

  IF vector_schema IS NULL THEN
    RAISE EXCEPTION 'RAG_PREFLIGHT_VECTOR_EXTENSION_MISSING';
  END IF;
  IF vector_schema NOT IN ('public', 'extensions') THEN
    RAISE EXCEPTION 'RAG_PREFLIGHT_UNSUPPORTED_VECTOR_SCHEMA: %', vector_schema;
  END IF;
END;
$vector_preflight$;

-- Required by composite tenant-safe foreign keys. profiles.id is already
-- unique, so duplicates are impossible. Reuse an equivalent unique index when
-- present; otherwise create the minimal candidate key required by composite FKs.
DO $profiles_key$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_definition
    JOIN pg_class relation ON relation.oid = index_definition.indrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'profiles'
      AND index_definition.indisunique
      AND index_definition.indpred IS NULL
      AND index_definition.indexprs IS NULL
      AND (
        SELECT array_agg(attribute.attname::text ORDER BY key_position.ordinality)
        FROM unnest(index_definition.indkey)
          WITH ORDINALITY AS key_position(attribute_number, ordinality)
        JOIN pg_attribute attribute
          ON attribute.attrelid = relation.oid
         AND attribute.attnum = key_position.attribute_number
      ) = ARRAY['id', 'organization_id']
  ) THEN
    CREATE UNIQUE INDEX profiles_id_organization_rag_uq_idx
      ON public.profiles (id, organization_id);
  END IF;
END;
$profiles_key$;

CREATE TABLE public.rag_knowledge_sources (
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

CREATE TABLE public.rag_knowledge_documents (
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

CREATE TABLE public.rag_knowledge_document_versions (
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

CREATE TABLE public.rag_knowledge_chunks (
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

CREATE TABLE public.rag_embedding_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_version_id uuid NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  retry_of_job_id uuid,
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
  CONSTRAINT rag_jobs_id_org_version_uq
    UNIQUE (id, organization_id, document_version_id),
  CONSTRAINT rag_jobs_attempt_uq
    UNIQUE (organization_id, document_version_id, attempt_number),
  CONSTRAINT rag_jobs_retry_fk
    FOREIGN KEY (retry_of_job_id, organization_id, document_version_id)
    REFERENCES public.rag_embedding_jobs(id, organization_id, document_version_id)
    ON DELETE RESTRICT,
  CONSTRAINT rag_jobs_attempt_number_ck CHECK (attempt_number > 0),
  CONSTRAINT rag_jobs_retry_ck CHECK (
    (attempt_number = 1 AND retry_of_job_id IS NULL)
    OR (attempt_number > 1 AND retry_of_job_id IS NOT NULL)
  ),
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

CREATE INDEX rag_sources_org_status_idx
  ON public.rag_knowledge_sources (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX rag_documents_org_status_idx
  ON public.rag_knowledge_documents (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX rag_versions_org_document_status_idx
  ON public.rag_knowledge_document_versions (organization_id, document_id, ingestion_status)
  WHERE deleted_at IS NULL AND superseded_at IS NULL;
CREATE INDEX rag_chunks_retrieval_filter_idx
  ON public.rag_knowledge_chunks
  (organization_id, document_id, document_version_id, embedding_status, id)
  WHERE deleted_at IS NULL;
CREATE INDEX rag_jobs_org_status_schedule_idx
  ON public.rag_embedding_jobs (organization_id, status, scheduled_at);
CREATE UNIQUE INDEX rag_jobs_one_active_version_idx
  ON public.rag_embedding_jobs (organization_id, document_version_id)
  WHERE status IN ('pending', 'processing');

-- Phase 4A intentionally uses exact cosine search. Add ANN only after Preview
-- data volume, filtered recall and latency are measured.

CREATE OR REPLACE FUNCTION public.rag_validate_chunk_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  version_sanitization text;
  version_ingestion text;
  version_approved_at timestamptz;
  version_approved_by uuid;
  version_superseded_at timestamptz;
  version_deleted_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.embedding_status = 'ready'
       AND (
         NEW.content IS DISTINCT FROM OLD.content
         OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
         OR NEW.embedding_model IS DISTINCT FROM OLD.embedding_model
         OR NEW.embedding_dimensions IS DISTINCT FROM OLD.embedding_dimensions
         OR NEW.document_version_id IS DISTINCT FROM OLD.document_version_id
         OR NEW.document_id IS DISTINCT FROM OLD.document_id
         OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
         OR NEW.chunk_index IS DISTINCT FROM OLD.chunk_index
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'RAG_READY_CHUNK_IS_IMMUTABLE';
    END IF;

    IF (NEW.content IS DISTINCT FROM OLD.content)
       <> (NEW.content_hash IS DISTINCT FROM OLD.content_hash) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'RAG_CONTENT_AND_HASH_MUST_CHANGE_TOGETHER';
    END IF;

    IF NEW.embedding_status <> 'ready'
       AND (
         NEW.content IS DISTINCT FROM OLD.content
         OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
         OR NEW.embedding_model IS DISTINCT FROM OLD.embedding_model
         OR NEW.embedding_dimensions IS DISTINCT FROM OLD.embedding_dimensions
       ) THEN
      NEW.embedding := NULL;
      NEW.embedding_status := 'pending';
    END IF;
  END IF;

  IF NEW.embedding_status = 'ready' THEN
    IF TG_OP = 'INSERT' OR OLD.embedding_status <> 'processing' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'RAG_READY_REQUIRES_PROCESSING';
    END IF;

    -- FOR SHARE conflicts with concurrent sanitization UPDATE while allowing
    -- concurrent readers. FOR KEY SHARE would not block a non-key status update.
    SELECT sanitization_status, ingestion_status, approved_for_embedding_at,
           approved_by, superseded_at, deleted_at
    INTO version_sanitization, version_ingestion, version_approved_at,
         version_approved_by, version_superseded_at, version_deleted_at
    FROM public.rag_knowledge_document_versions
    WHERE id = NEW.document_version_id
      AND document_id = NEW.document_id
      AND organization_id = NEW.organization_id
    FOR SHARE;

    IF version_sanitization IS DISTINCT FROM 'approved'
       OR version_ingestion IS DISTINCT FROM 'processing'
       OR version_approved_at IS NULL
       OR version_approved_by IS NULL
       OR version_superseded_at IS NOT NULL
       OR version_deleted_at IS NOT NULL THEN
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
BEFORE INSERT OR UPDATE
ON public.rag_knowledge_chunks
FOR EACH ROW EXECUTE FUNCTION public.rag_validate_chunk_embedding();

CREATE OR REPLACE FUNCTION public.rag_invalidate_chunks_on_version_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.sanitization_status = 'approved'
     AND NEW.sanitization_status <> 'approved' THEN
    UPDATE public.rag_knowledge_chunks
    SET embedding = NULL,
        embedding_status = 'stale'
    WHERE organization_id = NEW.organization_id
      AND document_id = NEW.document_id
      AND document_version_id = NEW.id
      AND embedding_status IN ('processing', 'ready')
      AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rag_versions_invalidate_chunks_trg
  ON public.rag_knowledge_document_versions;
CREATE TRIGGER rag_versions_invalidate_chunks_trg
AFTER UPDATE OF sanitization_status
ON public.rag_knowledge_document_versions
FOR EACH ROW EXECUTE FUNCTION public.rag_invalidate_chunks_on_version_change();

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

CREATE OR REPLACE FUNCTION public.rag_enforce_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RAG_ORGANIZATION_IS_IMMUTABLE';
  END IF;
  IF TG_TABLE_NAME IN ('rag_knowledge_sources', 'rag_knowledge_documents')
     AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RAG_CREATOR_IS_IMMUTABLE';
  END IF;
  IF TG_TABLE_NAME = 'rag_embedding_jobs'
     AND (
       NEW.document_id IS DISTINCT FROM OLD.document_id
       OR NEW.document_version_id IS DISTINCT FROM OLD.document_version_id
       OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
       OR NEW.retry_of_job_id IS DISTINCT FROM OLD.retry_of_job_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RAG_JOB_IDENTITY_IS_IMMUTABLE';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'deleted' AND NEW.status <> 'deleted' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RAG_DELETED_STATE_IS_TERMINAL';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'ready'
     AND OLD.status NOT IN ('processing', 'ready') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RAG_READY_REQUIRES_PROCESSING';
  END IF;

  IF TG_TABLE_NAME = 'rag_embedding_jobs'
     AND TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status = 'pending' AND NEW.status IN ('processing', 'failed', 'stale'))
       OR (OLD.status = 'processing' AND NEW.status IN ('ready', 'failed', 'stale'))
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RAG_INVALID_JOB_TRANSITION';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER rag_sources_state_transition_trg
BEFORE UPDATE ON public.rag_knowledge_sources
FOR EACH ROW EXECUTE FUNCTION public.rag_enforce_state_transition();
CREATE TRIGGER rag_documents_state_transition_trg
BEFORE UPDATE ON public.rag_knowledge_documents
FOR EACH ROW EXECUTE FUNCTION public.rag_enforce_state_transition();
CREATE TRIGGER rag_jobs_state_transition_trg
BEFORE UPDATE ON public.rag_embedding_jobs
FOR EACH ROW EXECUTE FUNCTION public.rag_enforce_state_transition();

CREATE OR REPLACE FUNCTION public.rag_enforce_version_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RAG_VERSION_IDENTITY_IS_IMMUTABLE';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.sanitization_status = 'approved'
     AND OLD.sanitization_status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RAG_APPROVAL_REQUIRES_PENDING';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.ingestion_status = 'ready'
     AND OLD.ingestion_status NOT IN ('processing', 'ready') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RAG_READY_REQUIRES_PROCESSING';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RAG_DELETED_VERSION_IS_TERMINAL';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rag_versions_state_transition_trg
BEFORE UPDATE ON public.rag_knowledge_document_versions
FOR EACH ROW EXECUTE FUNCTION public.rag_enforce_version_transition();

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

CREATE POLICY rag_sources_agent_read ON public.rag_knowledge_sources
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() = 'agent'
  AND status = 'ready'
  AND deleted_at IS NULL
);
CREATE POLICY rag_sources_lead_read ON public.rag_knowledge_sources
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);
CREATE POLICY rag_sources_lead_manage ON public.rag_knowledge_sources
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
  AND created_by = auth.uid()
);
CREATE POLICY rag_sources_lead_update ON public.rag_knowledge_sources
FOR UPDATE TO authenticated
USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
)
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);

CREATE POLICY rag_documents_agent_read ON public.rag_knowledge_documents
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() = 'agent'
  AND status = 'ready'
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.rag_knowledge_sources source
    WHERE source.id = rag_knowledge_documents.source_id
      AND source.organization_id = rag_knowledge_documents.organization_id
      AND source.status = 'ready'
      AND source.deleted_at IS NULL
  )
);
CREATE POLICY rag_documents_lead_read ON public.rag_knowledge_documents
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);
CREATE POLICY rag_documents_lead_manage ON public.rag_knowledge_documents
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
  AND created_by = auth.uid()
);
CREATE POLICY rag_documents_lead_update ON public.rag_knowledge_documents
FOR UPDATE TO authenticated
USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
)
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);

CREATE POLICY rag_versions_agent_read ON public.rag_knowledge_document_versions
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() = 'agent'
  AND sanitization_status = 'approved'
  AND ingestion_status = 'ready'
  AND approved_for_embedding_at IS NOT NULL
  AND superseded_at IS NULL
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.rag_knowledge_documents document
    JOIN public.rag_knowledge_sources source
      ON source.id = document.source_id
     AND source.organization_id = document.organization_id
    WHERE document.id = rag_knowledge_document_versions.document_id
      AND document.organization_id = rag_knowledge_document_versions.organization_id
      AND document.current_version_id = rag_knowledge_document_versions.id
      AND document.status = 'ready'
      AND document.deleted_at IS NULL
      AND source.status = 'ready'
      AND source.deleted_at IS NULL
  )
);
CREATE POLICY rag_versions_lead_read ON public.rag_knowledge_document_versions
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);
CREATE POLICY rag_versions_lead_manage ON public.rag_knowledge_document_versions
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
  AND created_by = auth.uid()
);
CREATE POLICY rag_versions_lead_update ON public.rag_knowledge_document_versions
FOR UPDATE TO authenticated
USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
)
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);

CREATE POLICY rag_chunks_agent_read ON public.rag_knowledge_chunks
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() = 'agent'
  AND embedding_status = 'ready'
  AND embedding IS NOT NULL
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.rag_knowledge_documents document
    JOIN public.rag_knowledge_sources source
      ON source.id = document.source_id
     AND source.organization_id = document.organization_id
    JOIN public.rag_knowledge_document_versions version
      ON version.id = rag_knowledge_chunks.document_version_id
     AND version.document_id = document.id
     AND version.organization_id = document.organization_id
    WHERE document.id = rag_knowledge_chunks.document_id
      AND document.organization_id = rag_knowledge_chunks.organization_id
      AND document.current_version_id = version.id
      AND document.status = 'ready'
      AND document.deleted_at IS NULL
      AND source.status = 'ready'
      AND source.deleted_at IS NULL
      AND version.sanitization_status = 'approved'
      AND version.ingestion_status = 'ready'
      AND version.approved_for_embedding_at IS NOT NULL
      AND version.superseded_at IS NULL
      AND version.deleted_at IS NULL
  )
);
CREATE POLICY rag_chunks_lead_read ON public.rag_knowledge_chunks
FOR SELECT TO authenticated USING (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);
CREATE POLICY rag_chunks_lead_manage ON public.rag_knowledge_chunks
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);
CREATE POLICY rag_chunks_lead_update ON public.rag_knowledge_chunks
FOR UPDATE TO authenticated
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
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.current_profile_org_id()
  AND public.current_profile_role() IN ('manager', 'admin')
);
CREATE POLICY rag_jobs_lead_update ON public.rag_embedding_jobs
FOR UPDATE TO authenticated
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

COMMIT;
