\set ON_ERROR_STOP on
SET search_path = pg_catalog, public, extensions;
BEGIN;
SELECT plan(100);

SELECT has_table('public', 'rag_knowledge_sources', 'sources table');
SELECT has_table('public', 'rag_knowledge_documents', 'documents table');
SELECT has_table('public', 'rag_knowledge_document_versions', 'versions table');
SELECT has_table('public', 'rag_knowledge_chunks', 'chunks table');
SELECT has_table('public', 'rag_embedding_jobs', 'jobs table');
SELECT col_type_is('public', 'rag_knowledge_chunks', 'embedding', 'vector(1536)');

SET LOCAL ROLE service_role;
INSERT INTO public.organizations (id, name, slug) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Organization Alpha', 'alpha'),
  ('20000000-0000-4000-8000-000000000002', 'Organization Beta', 'beta');
INSERT INTO public.profiles (id, organization_id, role) VALUES
  ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', 'manager'),
  ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000001', 'agent'),
  ('10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000001', 'customer'),
  ('10000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000001', 'admin'),
  ('20000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000002', 'manager');

INSERT INTO public.rag_knowledge_sources
  (id, organization_id, name, source_type, status, created_by)
VALUES
  ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000001',
   'Fictional printer manual', 'manual', 'processing', '10000000-0000-4000-8000-000000000011'),
  ('20000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000002',
   'Fictional VPN FAQ', 'faq', 'draft', '20000000-0000-4000-8000-000000000011');
UPDATE public.rag_knowledge_sources SET status = 'ready'
WHERE id = '10000000-0000-4000-8000-000000000101';

INSERT INTO public.rag_knowledge_documents
  (id, organization_id, source_id, title, document_type, status, created_by)
VALUES (
  '10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000101', 'Synthetic printer reset',
  'manual', 'processing', '10000000-0000-4000-8000-000000000011'
);
INSERT INTO public.rag_knowledge_document_versions
  (id, organization_id, document_id, version_number, content_hash,
   sanitization_status, ingestion_status, mime_type, size_bytes,
   approved_for_embedding_at, approved_by, created_by)
VALUES (
  '10000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000201', 1, repeat('a', 64),
  'approved', 'processing', 'text/plain', 100, now(),
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011'
);
INSERT INTO public.rag_knowledge_chunks
  (id, organization_id, document_id, document_version_id, chunk_index,
   content, content_hash, embedding_status)
VALUES (
  '10000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000301',
  0, 'Synthetic printer reset procedure.', repeat('b', 64), 'processing'
);
UPDATE public.rag_knowledge_chunks
SET embedding = array_fill(0.001::real, ARRAY[1536])::vector,
    embedding_model = 'text-embedding-3-small',
    embedding_dimensions = 1536,
    embedding_status = 'ready'
WHERE id = '10000000-0000-4000-8000-000000000401';
UPDATE public.rag_knowledge_document_versions SET ingestion_status = 'ready'
WHERE id = '10000000-0000-4000-8000-000000000301';
UPDATE public.rag_knowledge_documents
SET current_version_id = '10000000-0000-4000-8000-000000000301', status = 'ready'
WHERE id = '10000000-0000-4000-8000-000000000201';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000012', true);
SELECT is((SELECT count(*) FROM public.rag_knowledge_chunks), 1::bigint, 'agent reads current ready chunk');
SELECT is((SELECT count(*) FROM public.rag_knowledge_document_versions), 1::bigint, 'agent reads current approved version');
SELECT is(
  (SELECT count(*) FROM public.search_rag_knowledge_authenticated(
    array_fill(0.001::real, ARRAY[1536])::vector, 8, 0
  )),
  1::bigint,
  'authenticated retrieval is tenant scoped'
);
SELECT throws_ok(
  $$UPDATE public.rag_knowledge_chunks
    SET content = 'Agent mutation', content_hash = repeat('d', 64)$$,
  '42501', 'agent cannot update chunks'
);
SELECT throws_ok(
  $$INSERT INTO public.rag_knowledge_sources
    (organization_id, name, source_type, created_by)
    VALUES (
      '10000000-0000-4000-8000-000000000001',
      'Agent source', 'manual',
      '10000000-0000-4000-8000-000000000012'
    )$$,
  '42501', 'agent cannot insert sources'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000013', true);
SELECT is((SELECT count(*) FROM public.rag_knowledge_chunks), 0::bigint, 'customer cannot read chunks');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is((SELECT count(*) FROM public.rag_knowledge_chunks), 0::bigint, 'missing profile cannot read chunks');
SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000011', true);
SELECT is((SELECT count(*) FROM public.rag_knowledge_sources), 1::bigint, 'manager reads own draft');
SELECT is(
  (SELECT count(*) FROM public.rag_knowledge_sources
   WHERE id = '10000000-0000-4000-8000-000000000101'),
  0::bigint,
  'manager cannot read another tenant'
);
SELECT is(
  (WITH changed AS (
    UPDATE public.rag_knowledge_sources SET name = 'Cross-tenant update'
    WHERE id = '10000000-0000-4000-8000-000000000101'
    RETURNING id
  ) SELECT count(*) FROM changed),
  0::bigint,
  'manager cannot update another tenant'
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000014', true);
SELECT is((SELECT count(*) FROM public.rag_knowledge_sources), 1::bigint,
  'admin reads own tenant sources');
SELECT is(
  (WITH changed AS (
    UPDATE public.rag_knowledge_sources SET name = name
    WHERE id = '10000000-0000-4000-8000-000000000101'
    RETURNING id
  ) SELECT count(*) FROM changed),
  1::bigint,
  'admin manages own tenant source'
);
RESET ROLE;

SELECT throws_ok(
  $$UPDATE public.rag_knowledge_chunks
    SET content = 'Changed', content_hash = repeat('c', 64)
    WHERE id = '10000000-0000-4000-8000-000000000401'$$,
  '23514', 'ready content mutation is rejected'
);
SELECT throws_ok(
  $$UPDATE public.rag_knowledge_chunks
    SET content_hash = repeat('c', 64)
    WHERE id = '10000000-0000-4000-8000-000000000401'$$,
  '23514', 'ready hash mutation is rejected'
);
SELECT throws_ok(
  $$UPDATE public.rag_knowledge_chunks
    SET embedding_model = 'other'
    WHERE id = '10000000-0000-4000-8000-000000000401'$$,
  '23514', 'ready model mutation is rejected'
);
SELECT throws_ok(
  $$UPDATE public.rag_knowledge_chunks
    SET embedding_dimensions = NULL
    WHERE id = '10000000-0000-4000-8000-000000000401'$$,
  '23514', 'ready dimension mutation is rejected'
);
SELECT throws_ok(
  $$UPDATE public.rag_knowledge_chunks
    SET embedding = array_fill(0.002::real, ARRAY[1536])::vector
    WHERE id = '10000000-0000-4000-8000-000000000401'$$,
  '23514', 'ready vector mutation is rejected'
);
SELECT throws_ok(
  $$UPDATE public.rag_knowledge_chunks
    SET document_version_id = gen_random_uuid()
    WHERE id = '10000000-0000-4000-8000-000000000401'$$,
  '23514', 'ready version mutation is rejected'
);
SELECT throws_ok(
  $$UPDATE public.rag_knowledge_chunks
    SET embedding_status = 'processing'
    WHERE id = '10000000-0000-4000-8000-000000000401'$$,
  '23514', 'ready chunk cannot return to processing'
);

-- Each identity column is mutated in isolation (nothing else in the SET
-- clause changes) so each assertion can only be explained by
-- rag_validate_chunk_embedding's RAG_READY_CHUNK_IS_IMMUTABLE guard, not
-- by any other check in the same trigger.
SELECT throws_ok(
  $$UPDATE public.rag_knowledge_chunks
    SET organization_id = '20000000-0000-4000-8000-000000000002'
    WHERE id = '10000000-0000-4000-8000-000000000401'$$,
  '23514', 'RAG_READY_CHUNK_IS_IMMUTABLE', 'ready organization_id mutation is rejected'
);
SELECT throws_ok(
  $$UPDATE public.rag_knowledge_chunks
    SET document_id = '10000000-0000-4000-8000-000000000202'
    WHERE id = '10000000-0000-4000-8000-000000000401'$$,
  '23514', 'RAG_READY_CHUNK_IS_IMMUTABLE', 'ready document_id mutation is rejected'
);
SELECT throws_ok(
  $$UPDATE public.rag_knowledge_chunks
    SET chunk_index = 1
    WHERE id = '10000000-0000-4000-8000-000000000401'$$,
  '23514', 'RAG_READY_CHUNK_IS_IMMUTABLE', 'ready chunk_index mutation is rejected'
);

SELECT is(
  (SELECT count(*) FROM public.search_rag_knowledge_backend(
    '10000000-0000-4000-8000-000000000001',
    array_fill(0.001::real, ARRAY[1536])::vector, 8, 0
  )),
  1::bigint,
  'backend retrieval returns active source'
);
UPDATE public.rag_knowledge_sources SET status = 'archived'
WHERE id = '10000000-0000-4000-8000-000000000101';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000012', true);
SELECT is(
  (SELECT count(*) FROM public.rag_knowledge_chunks
   WHERE id = '10000000-0000-4000-8000-000000000401'),
  0::bigint, 'agent direct SELECT excludes archived source'
);
SELECT is(
  (SELECT count(*) FROM public.search_rag_knowledge_authenticated(
    array_fill(0.001::real, ARRAY[1536])::vector, 8, 0
  )),
  0::bigint, 'authenticated RPC excludes archived source'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.search_rag_knowledge_backend(
    '10000000-0000-4000-8000-000000000001',
    array_fill(0.001::real, ARRAY[1536])::vector, 8, 0
  )),
  0::bigint,
  'backend retrieval excludes archived source'
);
SELECT is(
  (SELECT count(*) FROM public.search_rag_knowledge_backend(
    '20000000-0000-4000-8000-000000000002',
    array_fill(0.001::real, ARRAY[1536])::vector, 8, 0
  )),
  0::bigint,
  'backend retrieval cannot cross tenant'
);
UPDATE public.rag_knowledge_sources SET status = 'processing'
WHERE id = '10000000-0000-4000-8000-000000000101';
UPDATE public.rag_knowledge_sources SET status = 'ready'
WHERE id = '10000000-0000-4000-8000-000000000101';

SELECT throws_ok(
  $$UPDATE public.rag_knowledge_documents
      SET current_version_id = gen_random_uuid()
      WHERE id = '10000000-0000-4000-8000-000000000201';
    SET CONSTRAINTS rag_documents_current_version_fk IMMEDIATE$$,
  '23503', 'invalid current version is rejected'
);

SELECT ok(NOT EXISTS (
  SELECT 1 FROM information_schema.parameters
  WHERE specific_schema = 'public'
    AND specific_name LIKE 'search_rag_knowledge_authenticated_%'
    AND parameter_mode = 'OUT'
    AND parameter_name = 'embedding'
), 'authenticated RPC output omits embedding');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM information_schema.parameters
  WHERE specific_schema = 'public'
    AND specific_name LIKE 'search_rag_knowledge_backend_%'
    AND parameter_mode = 'OUT'
    AND parameter_name = 'embedding'
), 'backend RPC output omits embedding');

-- Independent lifecycle fixtures prevent terminal deletion tests from
-- weakening later archival, supersession and retrieval assertions.
INSERT INTO public.rag_knowledge_sources
  (id, organization_id, name, source_type, status, created_by)
VALUES
  ('10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000001',
   'Supersession fixture', 'manual', 'processing', '10000000-0000-4000-8000-000000000011'),
  ('10000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000001',
   'Source deletion fixture', 'manual', 'processing', '10000000-0000-4000-8000-000000000011'),
  ('10000000-0000-4000-8000-000000000104', '10000000-0000-4000-8000-000000000001',
   'Document deletion fixture', 'manual', 'processing', '10000000-0000-4000-8000-000000000011');
UPDATE public.rag_knowledge_sources SET status = 'ready'
WHERE id IN (
  '10000000-0000-4000-8000-000000000102',
  '10000000-0000-4000-8000-000000000103',
  '10000000-0000-4000-8000-000000000104'
);
INSERT INTO public.rag_knowledge_documents
  (id, organization_id, source_id, title, document_type, status, created_by)
VALUES
  ('10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000102', 'Supersession document',
   'manual', 'processing', '10000000-0000-4000-8000-000000000011'),
  ('10000000-0000-4000-8000-000000000203', '10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000103', 'Source deletion document',
   'manual', 'processing', '10000000-0000-4000-8000-000000000011'),
  ('10000000-0000-4000-8000-000000000204', '10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000104', 'Document deletion document',
   'manual', 'processing', '10000000-0000-4000-8000-000000000011');
INSERT INTO public.rag_knowledge_document_versions
  (id, organization_id, document_id, version_number, content_hash,
   sanitization_status, ingestion_status, mime_type, size_bytes,
   approved_for_embedding_at, approved_by, created_by)
VALUES
  ('10000000-0000-4000-8000-000000000302', '10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000202', 1, repeat('c', 64),
   'approved', 'processing', 'text/plain', 100, now(),
   '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011'),
  ('10000000-0000-4000-8000-000000000303', '10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000203', 1, repeat('d', 64),
   'approved', 'processing', 'text/plain', 100, now(),
   '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011'),
  ('10000000-0000-4000-8000-000000000304', '10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000204', 1, repeat('e', 64),
   'approved', 'processing', 'text/plain', 100, now(),
   '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011');
INSERT INTO public.rag_knowledge_chunks
  (id, organization_id, document_id, document_version_id, chunk_index,
   content, content_hash, embedding_status)
VALUES
  ('10000000-0000-4000-8000-000000000402', '10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000302',
   0, 'Supersession content.', repeat('f', 64), 'processing'),
  ('10000000-0000-4000-8000-000000000403', '10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000203', '10000000-0000-4000-8000-000000000303',
   0, 'Source deletion content.', repeat('1', 64), 'processing'),
  ('10000000-0000-4000-8000-000000000404', '10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000204', '10000000-0000-4000-8000-000000000304',
   0, 'Document deletion content.', repeat('2', 64), 'processing');
UPDATE public.rag_knowledge_chunks
SET embedding = array_fill(0.001::real, ARRAY[1536])::vector,
    embedding_model = 'text-embedding-3-small',
    embedding_dimensions = 1536,
    embedding_status = 'ready'
WHERE id IN (
  '10000000-0000-4000-8000-000000000402',
  '10000000-0000-4000-8000-000000000403',
  '10000000-0000-4000-8000-000000000404'
);
UPDATE public.rag_knowledge_document_versions SET ingestion_status = 'ready'
WHERE id IN (
  '10000000-0000-4000-8000-000000000302',
  '10000000-0000-4000-8000-000000000303',
  '10000000-0000-4000-8000-000000000304'
);
UPDATE public.rag_knowledge_documents
SET current_version_id = CASE id
      WHEN '10000000-0000-4000-8000-000000000202' THEN '10000000-0000-4000-8000-000000000302'::uuid
      WHEN '10000000-0000-4000-8000-000000000203' THEN '10000000-0000-4000-8000-000000000303'::uuid
      ELSE '10000000-0000-4000-8000-000000000304'::uuid
    END,
    status = 'ready'
WHERE id IN (
  '10000000-0000-4000-8000-000000000202',
  '10000000-0000-4000-8000-000000000203',
  '10000000-0000-4000-8000-000000000204'
);

-- A real, existing version row is not enough -- it must belong to the
-- document being updated. Version 303 genuinely exists but belongs to
-- document 203, not 201, isolating rag_documents_current_version_fk's
-- (current_version_id, organization_id, id) -> (id, organization_id,
-- document_id) composite from a plain "does this id exist at all" check.
SELECT throws_ok(
  $$UPDATE public.rag_knowledge_documents
      SET current_version_id = '10000000-0000-4000-8000-000000000303'
      WHERE id = '10000000-0000-4000-8000-000000000201';
    SET CONSTRAINTS rag_documents_current_version_fk IMMEDIATE$$,
  '23503', 'current version belonging to another document is rejected'
);

SET LOCAL ROLE service_role;
INSERT INTO public.rag_knowledge_documents
  (id, organization_id, source_id, title, document_type, status, created_by)
VALUES (
  '20000000-0000-4000-8000-000000000205', '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000101', 'Cross-tenant version fixture',
  'faq', 'processing', '20000000-0000-4000-8000-000000000011'
);
INSERT INTO public.rag_knowledge_document_versions
  (id, organization_id, document_id, version_number, content_hash,
   sanitization_status, ingestion_status, mime_type, size_bytes, created_by)
VALUES (
  '20000000-0000-4000-8000-000000000306', '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000205', 1, repeat('9', 64),
  'pending', 'pending', 'text/plain', 100, '20000000-0000-4000-8000-000000000011'
);
RESET ROLE;
SELECT throws_ok(
  $$UPDATE public.rag_knowledge_documents
      SET current_version_id = '20000000-0000-4000-8000-000000000306'
      WHERE id = '10000000-0000-4000-8000-000000000201';
    SET CONSTRAINTS rag_documents_current_version_fk IMMEDIATE$$,
  '23503', 'current version belonging to another tenant is rejected'
);

UPDATE public.rag_knowledge_documents SET status = 'archived'
WHERE id = '10000000-0000-4000-8000-000000000202';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000012', true);
SELECT is((SELECT count(*) FROM public.rag_knowledge_chunks
  WHERE id = '10000000-0000-4000-8000-000000000402'), 0::bigint,
  'agent direct SELECT excludes archived document');
SELECT is((SELECT count(*) FROM public.search_rag_knowledge_authenticated(
  array_fill(0.001::real, ARRAY[1536])::vector, 20, 0)
  WHERE document_id = '10000000-0000-4000-8000-000000000202'), 0::bigint,
  'authenticated RPC excludes archived document');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.search_rag_knowledge_backend(
  '10000000-0000-4000-8000-000000000001',
  array_fill(0.001::real, ARRAY[1536])::vector, 20, 0)
  WHERE document_id = '10000000-0000-4000-8000-000000000202'), 0::bigint,
  'backend RPC excludes archived document');
UPDATE public.rag_knowledge_documents SET status = 'processing'
WHERE id = '10000000-0000-4000-8000-000000000202';
UPDATE public.rag_knowledge_documents SET status = 'ready'
WHERE id = '10000000-0000-4000-8000-000000000202';

INSERT INTO public.rag_knowledge_document_versions
  (id, organization_id, document_id, version_number, content_hash,
   sanitization_status, ingestion_status, mime_type, size_bytes,
   approved_for_embedding_at, approved_by, created_by)
VALUES (
  '10000000-0000-4000-8000-000000000305', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000202', 2, repeat('3', 64),
  'approved', 'processing', 'text/plain', 100, now(),
  '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011'
);
UPDATE public.rag_knowledge_documents
SET current_version_id = '10000000-0000-4000-8000-000000000305'
WHERE id = '10000000-0000-4000-8000-000000000202';
SELECT ok((SELECT superseded_at IS NOT NULL
  FROM public.rag_knowledge_document_versions
  WHERE id = '10000000-0000-4000-8000-000000000302'),
  'supersession timestamps the former current version');
SELECT is((SELECT ingestion_status
  FROM public.rag_knowledge_document_versions
  WHERE id = '10000000-0000-4000-8000-000000000302'), 'stale',
  'supersession marks the former current version stale');
SELECT ok((SELECT embedding_status = 'stale' AND embedding IS NULL
  FROM public.rag_knowledge_chunks
  WHERE id = '10000000-0000-4000-8000-000000000402'),
  'supersession invalidates the former current version chunks');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000012', true);
SELECT is((SELECT count(*) FROM public.search_rag_knowledge_authenticated(
  array_fill(0.001::real, ARRAY[1536])::vector, 20, 0)
  WHERE document_version_id = '10000000-0000-4000-8000-000000000302'), 0::bigint,
  'authenticated retrieval never returns a superseded, non-current version');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.search_rag_knowledge_backend(
  '10000000-0000-4000-8000-000000000001',
  array_fill(0.001::real, ARRAY[1536])::vector, 20, 0)
  WHERE document_version_id = '10000000-0000-4000-8000-000000000302'), 0::bigint,
  'backend retrieval never returns a superseded, non-current version');

UPDATE public.rag_knowledge_chunks
SET embedding = NULL, embedding_status = 'stale'
WHERE id = '10000000-0000-4000-8000-000000000404';
SELECT is((SELECT embedding_status FROM public.rag_knowledge_chunks
  WHERE id = '10000000-0000-4000-8000-000000000404'), 'stale',
  'direct controlled invalidation marks chunk stale');
SELECT ok((SELECT embedding IS NULL FROM public.rag_knowledge_chunks
  WHERE id = '10000000-0000-4000-8000-000000000404'),
  'direct controlled invalidation clears vector');
UPDATE public.rag_knowledge_document_versions SET ingestion_status = 'processing'
WHERE id = '10000000-0000-4000-8000-000000000304';
UPDATE public.rag_knowledge_chunks SET embedding_status = 'processing'
WHERE id = '10000000-0000-4000-8000-000000000404';
UPDATE public.rag_knowledge_chunks
SET embedding = array_fill(0.001::real, ARRAY[1536])::vector,
    embedding_model = 'text-embedding-3-small',
    embedding_dimensions = 1536,
    embedding_status = 'ready'
WHERE id = '10000000-0000-4000-8000-000000000404';
UPDATE public.rag_knowledge_document_versions SET ingestion_status = 'ready'
WHERE id = '10000000-0000-4000-8000-000000000304';

UPDATE public.rag_knowledge_sources
SET status = 'deleted', deleted_at = now()
WHERE id = '10000000-0000-4000-8000-000000000103';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000012', true);
SELECT is((SELECT count(*) FROM public.rag_knowledge_chunks
  WHERE id = '10000000-0000-4000-8000-000000000403'), 0::bigint,
  'agent direct SELECT excludes deleted source');
SELECT is((SELECT count(*) FROM public.search_rag_knowledge_authenticated(
  array_fill(0.001::real, ARRAY[1536])::vector, 20, 0)
  WHERE document_id = '10000000-0000-4000-8000-000000000203'), 0::bigint,
  'authenticated RPC excludes deleted source');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.search_rag_knowledge_backend(
  '10000000-0000-4000-8000-000000000001',
  array_fill(0.001::real, ARRAY[1536])::vector, 20, 0)
  WHERE document_id = '10000000-0000-4000-8000-000000000203'), 0::bigint,
  'backend RPC excludes deleted source');

UPDATE public.rag_knowledge_documents
SET status = 'deleted', deleted_at = now()
WHERE id = '10000000-0000-4000-8000-000000000204';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000012', true);
SELECT is((SELECT count(*) FROM public.rag_knowledge_chunks
  WHERE id = '10000000-0000-4000-8000-000000000404'), 0::bigint,
  'agent direct SELECT excludes deleted document');
SELECT is((SELECT count(*) FROM public.search_rag_knowledge_authenticated(
  array_fill(0.001::real, ARRAY[1536])::vector, 20, 0)
  WHERE document_id = '10000000-0000-4000-8000-000000000204'), 0::bigint,
  'authenticated RPC excludes deleted document');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.search_rag_knowledge_backend(
  '10000000-0000-4000-8000-000000000001',
  array_fill(0.001::real, ARRAY[1536])::vector, 20, 0)
  WHERE document_id = '10000000-0000-4000-8000-000000000204'), 0::bigint,
  'backend RPC excludes deleted document');

SELECT throws_ok(
  $$SELECT * FROM public.search_rag_knowledge_authenticated(
    array_fill(0.001::real, ARRAY[1536])::vector, 0, 0.5
  )$$,
  '22023', 'match count lower bound'
);
SELECT throws_ok(
  $$SELECT * FROM public.search_rag_knowledge_authenticated(
    array_fill(0.001::real, ARRAY[1536])::vector, 21, 0.5
  )$$,
  '22023', 'match count upper bound'
);
SELECT throws_ok(
  $$SELECT * FROM public.search_rag_knowledge_authenticated(
    array_fill(0.001::real, ARRAY[1536])::vector, 3, 1.1
  )$$,
  '22023', 'threshold bound'
);

-- Full grant matrix for both retrieval RPCs: PUBLIC and anon must be able
-- to execute neither the browser-facing nor the backend-only RPC; the
-- browser-facing RPC additionally excludes plain authenticated only for
-- the backend function (authenticated legitimately executes its own RPC,
-- exercised throughout this file), and only service_role reaches backend.
SELECT ok(NOT has_function_privilege('public',
  'public.search_rag_knowledge_authenticated(vector,integer,double precision)', 'EXECUTE'),
  'PUBLIC cannot execute authenticated retrieval');
SELECT ok(NOT has_function_privilege('anon',
  'public.search_rag_knowledge_authenticated(vector,integer,double precision)', 'EXECUTE'),
  'anon cannot execute authenticated retrieval');
SELECT ok(NOT has_function_privilege('public',
  'public.search_rag_knowledge_backend(uuid,vector,integer,double precision)', 'EXECUTE'),
  'PUBLIC cannot execute backend retrieval');
SELECT ok(NOT has_function_privilege('anon',
  'public.search_rag_knowledge_backend(uuid,vector,integer,double precision)', 'EXECUTE'),
  'anon cannot execute backend retrieval');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.search_rag_knowledge_backend(uuid,vector,integer,double precision)', 'EXECUTE'),
  'authenticated cannot execute backend retrieval');
SELECT ok(has_function_privilege('service_role',
  'public.search_rag_knowledge_backend(uuid,vector,integer,double precision)', 'EXECUTE'),
  'service role executes backend retrieval');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.match_knowledge_chunks(vector,uuid,integer,double precision)', 'EXECUTE'),
  'browser cannot execute legacy retrieval');
SELECT ok(has_function_privilege('service_role',
  'public.match_knowledge_chunks(vector,uuid,integer,double precision)', 'EXECUTE'),
  'legacy service-role compatibility remains');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.rag_validate_chunk_embedding()', 'EXECUTE'),
  'trigger helper is not executable by authenticated');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.rag_invalidate_chunks_on_version_change()', 'EXECUTE'),
  'invalidation helper is not executable by authenticated');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.rag_mark_superseded_chunks_stale()', 'EXECUTE'),
  'supersession helper is not executable by authenticated');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.rag_enforce_state_transition()', 'EXECUTE'),
  'state helper is not executable by authenticated');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.rag_enforce_version_transition()', 'EXECUTE'),
  'version helper is not executable by authenticated');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.rag_validate_embedding_job_retry()', 'EXECUTE'),
  'retry helper is not executable by authenticated');

INSERT INTO public.rag_embedding_jobs
  (id, organization_id, document_id, document_version_id, attempt_number, status)
VALUES (
  '10000000-0000-4000-8000-000000000501', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000301',
  1, 'pending'
);
UPDATE public.rag_embedding_jobs SET status = 'failed', completed_at = now()
WHERE id = '10000000-0000-4000-8000-000000000501';
INSERT INTO public.rag_embedding_jobs
  (id, organization_id, document_id, document_version_id, attempt_number,
   retry_of_job_id, status)
VALUES (
  '10000000-0000-4000-8000-000000000502', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000301',
  2, '10000000-0000-4000-8000-000000000501', 'pending'
);
SELECT is((SELECT count(*) FROM public.rag_embedding_jobs), 2::bigint, 'completed job history and retry coexist');
-- Isolated from rag_jobs_number_uq and the INSERT-only retry trigger by
-- construction: this UPDATE keeps job 501's attempt_number (1) unchanged
-- (so the per-version attempt-number uniqueness is never re-evaluated
-- against a new value) and UPDATE never fires rag_jobs_validate_retry_trg
-- (BEFORE INSERT only). Job 502 (attempt 2) is already 'pending' for the
-- same version, so the only thing that can reject reactivating job 501
-- into 'processing' is rag_jobs_one_active_version_idx.
SELECT throws_ok(
  $$UPDATE public.rag_embedding_jobs
    SET status = 'processing', started_at = now()
    WHERE id = '10000000-0000-4000-8000-000000000501'$$,
  '23505', 'only one active job per version (isolated to the partial unique index)'
);
SELECT throws_ok(
  $$INSERT INTO public.rag_embedding_jobs
    (id, organization_id, document_id, document_version_id, attempt_number,
     retry_of_job_id, status)
    VALUES (
      '10000000-0000-4000-8000-000000000599',
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000201',
      '10000000-0000-4000-8000-000000000301', 3,
      '10000000-0000-4000-8000-000000000599', 'pending'
    )$$,
  '23514', 'RAG_RETRY_REQUIRES_PREVIOUS_TERMINAL_ATTEMPT', 'retry cannot reference itself'
);
SELECT throws_ok(
  $$INSERT INTO public.rag_embedding_jobs
    (id, organization_id, document_id, document_version_id, attempt_number,
     retry_of_job_id, status)
    VALUES (
      gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000201',
      '10000000-0000-4000-8000-000000000301', 3,
      '10000000-0000-4000-8000-000000000501', 'pending'
    )$$,
  '23514', 'RAG_RETRY_REQUIRES_PREVIOUS_TERMINAL_ATTEMPT', 'retry must reference immediately preceding attempt'
);

-- Each predecessor-status/tenant/version scenario below uses its own
-- otherwise job-free document_version (302 or 304) so setting up the
-- predecessor fixture itself never collides with rag_jobs_one_active_version_idx,
-- keeping every rejection attributable to exactly one invariant.
INSERT INTO public.rag_embedding_jobs
  (id, organization_id, document_id, document_version_id, attempt_number, status)
VALUES (
  '10000000-0000-4000-8000-000000000521', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000302',
  1, 'pending'
);
SELECT throws_ok(
  $$INSERT INTO public.rag_embedding_jobs
    (id, organization_id, document_id, document_version_id, attempt_number,
     retry_of_job_id, status)
    VALUES (
      gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000202',
      '10000000-0000-4000-8000-000000000302', 2,
      '10000000-0000-4000-8000-000000000521', 'pending'
    )$$,
  '23514', 'RAG_RETRY_REQUIRES_PREVIOUS_TERMINAL_ATTEMPT', 'retry cannot follow a pending predecessor'
);

INSERT INTO public.rag_embedding_jobs
  (id, organization_id, document_id, document_version_id, attempt_number, status, started_at)
VALUES (
  '10000000-0000-4000-8000-000000000531', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000204', '10000000-0000-4000-8000-000000000304',
  1, 'processing', now()
);
SELECT throws_ok(
  $$INSERT INTO public.rag_embedding_jobs
    (id, organization_id, document_id, document_version_id, attempt_number,
     retry_of_job_id, status)
    VALUES (
      gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000204',
      '10000000-0000-4000-8000-000000000304', 2,
      '10000000-0000-4000-8000-000000000531', 'pending'
    )$$,
  '23514', 'RAG_RETRY_REQUIRES_PREVIOUS_TERMINAL_ATTEMPT', 'retry cannot follow a processing predecessor'
);

-- Job 501 is a genuinely terminal ('failed') predecessor, but these two
-- retries misdescribe which version/tenant it belongs to, so the
-- trigger's own (id, organization_id, document_version_id) lookup finds
-- no row at all -- the same invariant as an outright invalid predecessor.
SELECT throws_ok(
  $$INSERT INTO public.rag_embedding_jobs
    (id, organization_id, document_id, document_version_id, attempt_number,
     retry_of_job_id, status)
    VALUES (
      gen_random_uuid(), '20000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000201',
      '10000000-0000-4000-8000-000000000301', 2,
      '10000000-0000-4000-8000-000000000501', 'pending'
    )$$,
  '23514', 'RAG_RETRY_REQUIRES_PREVIOUS_TERMINAL_ATTEMPT', 'retry predecessor from another tenant is rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.rag_embedding_jobs
    (id, organization_id, document_id, document_version_id, attempt_number,
     retry_of_job_id, status)
    VALUES (
      gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000202',
      '10000000-0000-4000-8000-000000000305', 2,
      '10000000-0000-4000-8000-000000000501', 'pending'
    )$$,
  '23514', 'RAG_RETRY_REQUIRES_PREVIOUS_TERMINAL_ATTEMPT', 'retry predecessor from another document version is rejected'
);

UPDATE public.rag_embedding_jobs
SET status = 'processing', started_at = now()
WHERE id = '10000000-0000-4000-8000-000000000502';
SELECT lives_ok(
  $$UPDATE public.rag_embedding_jobs
    SET status = 'completed', completed_at = now()
    WHERE id = '10000000-0000-4000-8000-000000000502'$$,
  'a retry chained onto a failed predecessor reaches completed'
);
SELECT is(
  (SELECT status FROM public.rag_embedding_jobs
   WHERE id = '10000000-0000-4000-8000-000000000502'),
  'completed', 'embedding job terminal success is completed'
);

-- A retry may equally follow a 'stale' predecessor (a version invalidated
-- out from under an in-flight job), not only a 'failed' one.
INSERT INTO public.rag_embedding_jobs
  (id, organization_id, document_id, document_version_id, attempt_number, status, completed_at)
VALUES (
  '10000000-0000-4000-8000-000000000541', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000203', '10000000-0000-4000-8000-000000000303',
  1, 'stale', now()
);
SELECT lives_ok(
  $$INSERT INTO public.rag_embedding_jobs
    (id, organization_id, document_id, document_version_id, attempt_number,
     retry_of_job_id, status)
    VALUES (
      '10000000-0000-4000-8000-000000000542', '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000203',
      '10000000-0000-4000-8000-000000000303', 2,
      '10000000-0000-4000-8000-000000000541', 'pending'
    )$$,
  'a retry chained onto a stale predecessor is accepted'
);

INSERT INTO public.rag_embedding_jobs
  (id, organization_id, document_id, document_version_id, attempt_number, status)
VALUES (
  '10000000-0000-4000-8000-000000000511', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000305',
  1, 'pending'
);
UPDATE public.rag_embedding_jobs SET status = 'failed', completed_at = now()
WHERE id = '10000000-0000-4000-8000-000000000511';
INSERT INTO public.rag_embedding_jobs
  (id, organization_id, document_id, document_version_id, attempt_number,
   retry_of_job_id, status)
VALUES (
  '10000000-0000-4000-8000-000000000512', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000305',
  2, '10000000-0000-4000-8000-000000000511', 'pending'
);
UPDATE public.rag_embedding_jobs SET status = 'failed', completed_at = now()
WHERE id = '10000000-0000-4000-8000-000000000512';
INSERT INTO public.rag_embedding_jobs
  (id, organization_id, document_id, document_version_id, attempt_number,
   retry_of_job_id, status)
VALUES (
  '10000000-0000-4000-8000-000000000513', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000305',
  3, '10000000-0000-4000-8000-000000000512', 'pending'
);
UPDATE public.rag_embedding_jobs SET status = 'processing', started_at = now()
WHERE id = '10000000-0000-4000-8000-000000000513';
UPDATE public.rag_embedding_jobs SET status = 'completed', completed_at = now()
WHERE id = '10000000-0000-4000-8000-000000000513';
-- No job is active for version 305 at this point (511/512 failed, 513
-- just completed), so rag_jobs_one_active_version_idx cannot be the
-- cause here; attempt_number 4 is also unused for this version, so
-- rag_jobs_number_uq cannot be either -- only the predecessor-status
-- check in the retry trigger can explain the rejection.
SELECT throws_ok(
  $$INSERT INTO public.rag_embedding_jobs
    (id, organization_id, document_id, document_version_id, attempt_number,
     retry_of_job_id, status)
    VALUES (
      gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000202',
      '10000000-0000-4000-8000-000000000305', 4,
      '10000000-0000-4000-8000-000000000513', 'pending'
    )$$,
  '23514', 'RAG_RETRY_REQUIRES_PREVIOUS_TERMINAL_ATTEMPT', 'retry cannot follow a completed predecessor'
);
SELECT is((SELECT count(*) FROM public.rag_embedding_jobs
  WHERE status = 'failed'), 3::bigint, 'multiple failed jobs retain history');
SELECT is((SELECT count(*) FROM public.rag_embedding_jobs
  WHERE status = 'completed'), 2::bigint, 'multiple completed jobs retain history');
SELECT is((SELECT count(*) FROM public.rag_embedding_jobs
  WHERE retry_of_job_id IS NOT NULL), 4::bigint,
  'retry links retain complete history (three prior chains plus the stale-predecessor chain)');
SELECT is((SELECT status FROM public.rag_embedding_jobs
  WHERE id = '10000000-0000-4000-8000-000000000513'), 'completed',
  'multi-attempt retry chain reaches completed terminal state');

UPDATE public.rag_knowledge_document_versions
SET sanitization_status = 'rejected',
    approved_for_embedding_at = NULL,
    approved_by = NULL
WHERE id = '10000000-0000-4000-8000-000000000301';
SELECT is(
  (SELECT embedding_status FROM public.rag_knowledge_chunks
   WHERE id = '10000000-0000-4000-8000-000000000401'),
  'stale', 'sanitization revocation marks ready chunks stale'
);
SELECT ok(
  (SELECT embedding IS NULL FROM public.rag_knowledge_chunks
   WHERE id = '10000000-0000-4000-8000-000000000401'),
  'sanitization revocation clears vector'
);

SELECT throws_ok(
  $$INSERT INTO public.rag_knowledge_documents
    (organization_id, source_id, title, document_type, created_by)
    VALUES (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000101',
      'Cross tenant', 'faq', '10000000-0000-4000-8000-000000000011'
    )$$,
  '23503', 'cross-tenant parent reference is rejected'
);
SELECT has_constraint(
  'public', 'rag_knowledge_chunks', 'rag_chunks_version_org_document_fk',
  'chunk version foreign key exists'
);
SELECT has_constraint(
  'public', 'rag_embedding_jobs', 'rag_jobs_retry_fk',
  'job retry foreign key exists'
);
SELECT has_constraint(
  'public', 'rag_embedding_jobs', 'rag_jobs_retry_ck',
  'job retry check exists'
);
SELECT has_constraint(
  'public', 'rag_knowledge_documents', 'rag_documents_source_org_fk',
  'document source tenant foreign key exists'
);
SELECT has_constraint(
  'public', 'rag_knowledge_document_versions', 'rag_versions_document_org_fk',
  'version document tenant foreign key exists'
);
SELECT has_constraint(
  'public', 'rag_knowledge_chunks', 'rag_chunks_document_org_fk',
  'chunk document tenant foreign key exists'
);
SELECT has_constraint(
  'public', 'rag_embedding_jobs', 'rag_jobs_version_org_document_fk',
  'job version tenant and document foreign key exists'
);
SELECT has_constraint(
  'public', 'rag_knowledge_chunks', 'rag_chunks_embedding_contract_ck',
  'chunk embedding contract check exists'
);
SELECT has_constraint(
  'public', 'rag_embedding_jobs', 'rag_jobs_status_ck',
  'job status check exists'
);
SELECT has_constraint(
  'public', 'rag_knowledge_document_versions', 'rag_versions_approval_ck',
  'version approval check exists'
);

SELECT * FROM finish();
ROLLBACK;
