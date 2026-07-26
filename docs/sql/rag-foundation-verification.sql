-- Read-only verification for a disposable Supabase Preview Branch.
-- This file is deliberately outside supabase/migrations.
SELECT extension.extname, extension.extversion, namespace.nspname AS extension_schema
FROM pg_extension extension
JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
WHERE extension.extname = 'vector';

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

SELECT relation.relname AS table_name,
       constraint_definition.conname AS constraint_name,
       constraint_definition.contype AS constraint_type,
       pg_get_constraintdef(constraint_definition.oid) AS definition
FROM pg_constraint constraint_definition
JOIN pg_class relation ON relation.oid = constraint_definition.conrelid
JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relname LIKE 'rag_%'
ORDER BY relation.relname, constraint_definition.conname;

SELECT event_object_table AS table_name,
       trigger_name,
       action_timing,
       event_manipulation,
       action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table LIKE 'rag_%'
ORDER BY event_object_table, trigger_name, event_manipulation;

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'rag_%'
ORDER BY tablename, policyname;

SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name LIKE '%rag_knowledge%'
ORDER BY routine_name;

SELECT namespace.nspname AS function_schema,
       procedure.proname AS function_name,
       pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
       owner.rolname AS owner,
       procedure.prosecdef AS security_definer,
       procedure.proacl AS grants
FROM pg_proc procedure
JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
JOIN pg_roles owner ON owner.oid = procedure.proowner
WHERE namespace.nspname = 'public'
  AND (
    procedure.proname LIKE 'search_rag_%'
    OR procedure.proname LIKE 'rag_%'
    OR procedure.proname = 'match_knowledge_chunks'
  )
ORDER BY procedure.proname, identity_arguments;

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name LIKE 'rag_%'
ORDER BY table_name, grantee, privilege_type;
