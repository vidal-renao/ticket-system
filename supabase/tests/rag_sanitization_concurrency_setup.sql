\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = pg_catalog, public, extensions;
SET LOCAL ROLE service_role;

INSERT INTO public.organizations (id, name, slug) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Organization Alpha', 'alpha');
INSERT INTO public.profiles (id, organization_id, role) VALUES
  ('10000000-0000-4000-8000-000000000011',
   '10000000-0000-4000-8000-000000000001', 'manager');

INSERT INTO public.rag_knowledge_sources
  (id, organization_id, name, source_type, status, created_by)
VALUES (
  '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000001',
  'Concurrency fixture', 'manual', 'processing',
  '10000000-0000-4000-8000-000000000011'
);
UPDATE public.rag_knowledge_sources SET status = 'ready'
WHERE id = '10000000-0000-4000-8000-000000000101';

INSERT INTO public.rag_knowledge_documents
  (id, organization_id, source_id, title, document_type, status, created_by)
VALUES (
  '10000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000101',
  'Concurrency document', 'manual', 'processing',
  '10000000-0000-4000-8000-000000000011'
);
INSERT INTO public.rag_knowledge_document_versions
  (id, organization_id, document_id, version_number, content_hash,
   sanitization_status, ingestion_status, mime_type, size_bytes,
   approved_for_embedding_at, approved_by, created_by)
VALUES (
  '10000000-0000-4000-8000-000000000301',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000201', 1, repeat('a', 64),
  'approved', 'processing', 'text/plain', 100, now(),
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011'
);
INSERT INTO public.rag_knowledge_chunks
  (id, organization_id, document_id, document_version_id, chunk_index,
   content, content_hash, embedding_status)
VALUES (
  '10000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000301',
  0, 'Synthetic concurrency content.', repeat('b', 64), 'processing'
);
UPDATE public.rag_knowledge_documents
SET current_version_id = '10000000-0000-4000-8000-000000000301',
    status = 'ready'
WHERE id = '10000000-0000-4000-8000-000000000201';
COMMIT;
