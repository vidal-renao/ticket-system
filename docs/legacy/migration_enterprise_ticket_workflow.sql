BEGIN;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS review_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routing_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_review_status_check'
      AND conrelid = 'public.tickets'::regclass
  ) THEN
    ALTER TABLE public.tickets
      ADD CONSTRAINT tickets_review_status_check
      CHECK (review_status IN ('not_requested', 'pending', 'approved', 'changes_requested'));
  END IF;
END $$;

UPDATE public.tickets
SET assigned_at = COALESCE(assigned_at, created_at)
WHERE assigned_to IS NOT NULL
  AND assigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_org_live_stage
  ON public.tickets (organization_id, status, review_status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_agent_live_stage
  ON public.tickets (assigned_to, status, review_status, created_at DESC)
  WHERE deleted_at IS NULL AND assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_org_trash
  ON public.tickets (organization_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

DROP POLICY IF EXISTS "customers_own_tickets" ON public.tickets;
DROP POLICY IF EXISTS "staff_org_tickets" ON public.tickets;
DROP POLICY IF EXISTS "staff_update_tickets" ON public.tickets;
DROP POLICY IF EXISTS "Staff can view all tickets" ON public.tickets;
DROP POLICY IF EXISTS "customer_own_tickets_select" ON public.tickets;
DROP POLICY IF EXISTS "tickets_read_enterprise_scope" ON public.tickets;

CREATE POLICY "tickets_read_enterprise_scope" ON public.tickets
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id = public.current_profile_org_id()
    AND (
      (public.current_profile_role() = 'customer' AND created_by = auth.uid())
      OR (public.current_profile_role() = 'agent' AND assigned_to = auth.uid())
      OR public.current_profile_role() IN ('manager', 'admin')
    )
  );

-- All ticket mutations go through authenticated server routes. This prevents a
-- browser Supabase client from bypassing field-level workflow authorization.
REVOKE UPDATE, DELETE ON public.tickets FROM authenticated;

DROP POLICY IF EXISTS "ticket_comments_read_authorized" ON public.ticket_comments;
DROP POLICY IF EXISTS "ticket_comments_create_authorized" ON public.ticket_comments;
DROP POLICY IF EXISTS "authenticated can insert comments" ON public.ticket_comments;
DROP POLICY IF EXISTS "customer_see_own_ticket_comments" ON public.ticket_comments;
DROP POLICY IF EXISTS "internal_comments_staff_only" ON public.ticket_comments;
DROP POLICY IF EXISTS "members_create_comments" ON public.ticket_comments;
DROP POLICY IF EXISTS "org members can read comments" ON public.ticket_comments;
DROP POLICY IF EXISTS "staff_see_org_comments" ON public.ticket_comments;

CREATE POLICY "ticket_comments_read_authorized" ON public.ticket_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tickets AS ticket
      WHERE ticket.id = ticket_comments.ticket_id
        AND ticket.deleted_at IS NULL
        AND ticket.organization_id = public.current_profile_org_id()
        AND (
          (public.current_profile_role() = 'customer' AND ticket.created_by = auth.uid())
          OR (public.current_profile_role() = 'agent' AND ticket.assigned_to = auth.uid())
          OR public.current_profile_role() IN ('manager', 'admin')
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
        AND ticket.deleted_at IS NULL
        AND ticket.organization_id = public.current_profile_org_id()
        AND (
          (public.current_profile_role() = 'customer' AND ticket.created_by = auth.uid())
          OR (public.current_profile_role() = 'agent' AND ticket.assigned_to = auth.uid())
          OR public.current_profile_role() IN ('manager', 'admin')
        )
    )
    AND (
      ticket_comments.is_internal = FALSE
      OR public.current_profile_role() IN ('agent', 'manager', 'admin')
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.ticket_comments FROM authenticated;

DROP POLICY IF EXISTS "profiles_read_authorized" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "users_read_same_org_profiles" ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "profiles_read_authorized" ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR (
      organization_id = public.current_profile_org_id()
      AND public.current_profile_role() IN ('manager', 'admin')
    )
    OR (
      organization_id = public.current_profile_org_id()
      AND public.current_profile_role() = 'agent'
      AND EXISTS (
        SELECT 1
        FROM public.tickets AS ticket
        WHERE ticket.assigned_to = auth.uid()
          AND ticket.deleted_at IS NULL
          AND (ticket.created_by = profiles.id OR ticket.assigned_to = profiles.id)
      )
    )
  );

REVOKE UPDATE, DELETE ON public.profiles FROM authenticated;

DROP POLICY IF EXISTS "ai_analysis_read_authorized" ON public.ai_analysis;
DROP POLICY IF EXISTS "staff_read_ai_analysis" ON public.ai_analysis;
CREATE POLICY "ai_analysis_read_authorized" ON public.ai_analysis
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tickets AS ticket
      WHERE ticket.id = ai_analysis.ticket_id
        AND ticket.deleted_at IS NULL
        AND ticket.organization_id = public.current_profile_org_id()
        AND (
          (public.current_profile_role() = 'agent' AND ticket.assigned_to = auth.uid())
          OR public.current_profile_role() IN ('manager', 'admin')
        )
    )
  );

DO $$
BEGIN
  IF to_regclass('public.ticket_attachments') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ticket_attachments_read_authorized" ON public.ticket_attachments;
    CREATE POLICY "ticket_attachments_read_authorized" ON public.ticket_attachments
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.tickets AS ticket
          WHERE ticket.id = ticket_attachments.ticket_id
            AND ticket.deleted_at IS NULL
            AND ticket.organization_id = public.current_profile_org_id()
            AND (
              (public.current_profile_role() = 'customer' AND ticket.created_by = auth.uid())
              OR (public.current_profile_role() = 'agent' AND ticket.assigned_to = auth.uid())
              OR public.current_profile_role() IN ('manager', 'admin')
            )
        )
      );
  END IF;
END $$;

COMMIT;
