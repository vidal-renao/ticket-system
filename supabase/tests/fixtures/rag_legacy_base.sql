\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = pg_catalog, public, extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$$;

-- A real Supabase project grants USAGE on "extensions" to these roles as
-- part of its own platform bootstrap (so vector/pgcrypto/etc. types and
-- functions are usable by client-facing roles); a plain PostgreSQL
-- session does not carry that convention, and without it PostgreSQL
-- reports the type as not existing at all rather than a permission
-- error once a non-superuser role tries to resolve something in that
-- schema (confirmed in real execution: "type vector does not exist"
-- under SET LOCAL ROLE authenticated).
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL
);

CREATE TABLE public.hd_profiles (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id),
  role text NOT NULL CHECK (role IN ('customer', 'agent', 'manager', 'admin'))
);

CREATE OR REPLACE FUNCTION public.current_profile_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT organization_id FROM public.hd_profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT role FROM public.hd_profiles WHERE id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_profile_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;

CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  title text NOT NULL,
  content text NOT NULL,
  embedding vector(1536),
  is_active boolean NOT NULL DEFAULT true
);

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector(1536),
  org_id uuid,
  match_count integer DEFAULT 3,
  match_threshold double precision DEFAULT 0.5
)
RETURNS TABLE (id uuid, title text, content text, category text, similarity double precision)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT chunk.id, chunk.title, chunk.content, NULL::text,
         (1 - (chunk.embedding <=> query_embedding))::double precision
  FROM public.knowledge_chunks chunk
  WHERE chunk.organization_id = org_id
    AND chunk.is_active
    AND chunk.embedding IS NOT NULL
    AND 1 - (chunk.embedding <=> query_embedding) >= match_threshold
  ORDER BY chunk.embedding <=> query_embedding, chunk.id
  LIMIT match_count;
$$;

GRANT ALL ON public.organizations, public.hd_profiles, public.knowledge_chunks TO service_role;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(
  vector, uuid, integer, double precision
) TO authenticated, service_role;

