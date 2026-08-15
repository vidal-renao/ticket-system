\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE service_role;
DELETE FROM public.rag_embedding_jobs
WHERE organization_id = '10000000-0000-4000-8000-000000000001';
UPDATE public.rag_knowledge_documents
SET current_version_id = NULL
WHERE id = '10000000-0000-4000-8000-000000000201';
DELETE FROM public.rag_knowledge_chunks
WHERE id = '10000000-0000-4000-8000-000000000401';
DELETE FROM public.rag_knowledge_document_versions
WHERE id = '10000000-0000-4000-8000-000000000301';
DELETE FROM public.rag_knowledge_documents
WHERE id = '10000000-0000-4000-8000-000000000201';
DELETE FROM public.rag_knowledge_sources
WHERE id = '10000000-0000-4000-8000-000000000101';
DELETE FROM public.hd_profiles
WHERE id = '10000000-0000-4000-8000-000000000011';
DELETE FROM public.organizations
WHERE id = '10000000-0000-4000-8000-000000000001';
COMMIT;
