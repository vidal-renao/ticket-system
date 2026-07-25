-- Opt-in metadata/security harness for a disposable Supabase Preview Branch.
-- Requires pgTAP. It reads schema metadata only and never production content.
BEGIN;
SELECT plan(16);

SELECT has_extension('vector', 'pgvector is installed');
SELECT has_table('public', 'rag_knowledge_sources');
SELECT has_table('public', 'rag_knowledge_documents');
SELECT has_table('public', 'rag_knowledge_document_versions');
SELECT has_table('public', 'rag_knowledge_chunks');
SELECT has_table('public', 'rag_embedding_jobs');
SELECT has_column('public', 'rag_knowledge_chunks', 'embedding');
SELECT col_type_is('public', 'rag_knowledge_chunks', 'embedding', 'vector(1536)');
SELECT has_function('public', 'search_rag_knowledge_authenticated');
SELECT has_function('public', 'search_rag_knowledge_backend');
SELECT row_security_is('public', 'rag_knowledge_sources', true);
SELECT row_security_is('public', 'rag_knowledge_documents', true);
SELECT row_security_is('public', 'rag_knowledge_document_versions', true);
SELECT row_security_is('public', 'rag_knowledge_chunks', true);
SELECT row_security_is('public', 'rag_embedding_jobs', true);
SELECT policies_are(
  'public',
  'rag_knowledge_chunks',
  ARRAY['rag_chunks_lead_manage', 'rag_chunks_staff_read']
);

SELECT * FROM finish();
ROLLBACK;
