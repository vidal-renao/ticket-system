-- Read-only verification for a disposable Supabase Preview Branch.
-- Run after 202607250001_rag_foundation_v2.sql. It returns metadata only.
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'rag_%'
ORDER BY table_name;

SELECT table_name, column_name, udt_schema, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name LIKE 'rag_%'
ORDER BY table_name, ordinal_position;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename LIKE 'rag_%'
ORDER BY tablename, indexname;

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'rag_%'
ORDER BY tablename, policyname;

SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name LIKE '%rag_knowledge%'
ORDER BY routine_name;
