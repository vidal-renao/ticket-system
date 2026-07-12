BEGIN;

CREATE OR REPLACE FUNCTION public.current_profile_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT role::text
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_profile_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  full_name,
  avatar_url,
  department,
  phone,
  locale,
  timezone,
  data_processing_consent,
  consent_given_at,
  consent_ip,
  marketing_consent,
  updated_at
) ON public.profiles TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'availability_status'
  ) THEN
    GRANT UPDATE (availability_status) ON public.profiles TO authenticated;
  END IF;
END $$;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "users_read_same_org_profiles" ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "admins_manage_profiles" ON public.profiles;

CREATE POLICY "profiles_read_authorized" ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR (
      organization_id = public.current_profile_org_id()
      AND public.current_profile_role() IN ('agent', 'manager', 'admin')
    )
  );

CREATE POLICY "profiles_update_safe_self_fields" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND organization_id IS NOT DISTINCT FROM public.current_profile_org_id()
    AND role IS NOT DISTINCT FROM public.current_profile_role()
  );

DROP POLICY IF EXISTS "internal_comments_staff_only" ON public.ticket_comments;
DROP POLICY IF EXISTS "members_create_comments" ON public.ticket_comments;
DROP POLICY IF EXISTS "ticket_comments_read_authorized" ON public.ticket_comments;
DROP POLICY IF EXISTS "ticket_comments_create_authorized" ON public.ticket_comments;

CREATE POLICY "ticket_comments_read_authorized" ON public.ticket_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tickets AS ticket
      WHERE ticket.id = ticket_comments.ticket_id
        AND (
          ticket.created_by = auth.uid()
          OR (
            ticket.organization_id = public.current_profile_org_id()
            AND public.current_profile_role() IN ('agent', 'manager', 'admin')
          )
        )
        AND (
          ticket_comments.is_internal = FALSE
          OR public.current_profile_role() IN ('agent', 'manager', 'admin')
        )
    )
  );

CREATE POLICY "ticket_comments_create_authorized" ON public.ticket_comments
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.tickets AS ticket
      WHERE ticket.id = ticket_comments.ticket_id
        AND (
          ticket.created_by = auth.uid()
          OR (
            ticket.organization_id = public.current_profile_org_id()
            AND public.current_profile_role() IN ('agent', 'manager', 'admin')
          )
        )
    )
    AND (
      ticket_comments.is_internal = FALSE
      OR public.current_profile_role() IN ('agent', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "members_read_attachments" ON public.ticket_attachments;
DROP POLICY IF EXISTS "ticket_attachments_read_authorized" ON public.ticket_attachments;

CREATE POLICY "ticket_attachments_read_authorized" ON public.ticket_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tickets AS ticket
      WHERE ticket.id = ticket_attachments.ticket_id
        AND (
          ticket.created_by = auth.uid()
          OR (
            ticket.organization_id = public.current_profile_org_id()
            AND public.current_profile_role() IN ('agent', 'manager', 'admin')
          )
        )
    )
  );

DROP POLICY IF EXISTS "staff_read_ai_analysis" ON public.ai_analysis;
DROP POLICY IF EXISTS "service_insert_ai_analysis" ON public.ai_analysis;
DROP POLICY IF EXISTS "ai_analysis_read_authorized" ON public.ai_analysis;

CREATE POLICY "ai_analysis_read_authorized" ON public.ai_analysis
  FOR SELECT
  USING (
    public.current_profile_role() IN ('agent', 'manager', 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.tickets AS ticket
      WHERE ticket.id = ai_analysis.ticket_id
        AND ticket.organization_id = public.current_profile_org_id()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.ai_analysis FROM authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.match_knowledge_chunks(vector,uuid,integer,double precision)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.match_knowledge_chunks(vector, uuid, integer, double precision)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(vector, uuid, integer, double precision)
      TO service_role;
  END IF;
END $$;

COMMIT;
