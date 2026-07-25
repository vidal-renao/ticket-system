\set ON_ERROR_STOP on
SET search_path = pg_catalog, public, extensions;
BEGIN;
SELECT plan(32);

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
SELECT throws_ok(
  $$INSERT INTO public.rag_embedding_jobs
    (id, organization_id, document_id, document_version_id, attempt_number,
     retry_of_job_id, status)
    VALUES (
      gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000201',
      '10000000-0000-4000-8000-000000000301', 3,
      '10000000-0000-4000-8000-000000000502', 'processing'
    )$$,
  '23505', 'only one active job per version'
);

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

SELECT * FROM finish();
ROLLBACK;
