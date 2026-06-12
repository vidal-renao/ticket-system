-- ============================================================
-- RBAC HARDENING MIGRATION
-- Roles final target: admin, employee, customer
-- Compatibility: maps legacy agent -> employee, manager -> admin
-- ============================================================

DO $$ BEGIN
  CREATE TYPE customer_status AS ENUM ('pending', 'active', 'blocked', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS customer_status customer_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

UPDATE profiles
SET role = CASE
  WHEN role = 'agent' THEN 'employee'
  WHEN role = 'manager' THEN 'admin'
  WHEN role IN ('admin', 'employee', 'customer') THEN role
  ELSE 'customer'
END
WHERE role IS DISTINCT FROM CASE
  WHEN role = 'agent' THEN 'employee'
  WHEN role = 'manager' THEN 'admin'
  WHEN role IN ('admin', 'employee', 'customer') THEN role
  ELSE 'customer'
END;

UPDATE profiles
SET customer_status = CASE
  WHEN role = 'customer' AND is_active = FALSE THEN 'blocked'::customer_status
  WHEN role = 'customer' AND customer_status IS NULL THEN 'pending'::customer_status
  ELSE COALESCE(customer_status, 'active'::customer_status)
END;

UPDATE profiles
SET approved_at = COALESCE(approved_at, created_at)
WHERE role <> 'customer'
   OR (role = 'customer' AND customer_status = 'active');

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'employee', 'customer'));

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_customer_status_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_customer_status_role_check
  CHECK (
    (role = 'customer' AND customer_status IN ('pending', 'active', 'blocked', 'archived'))
    OR (role <> 'customer' AND customer_status = 'active')
  );

CREATE INDEX IF NOT EXISTS idx_profiles_org_role
  ON profiles(organization_id, role);

CREATE INDEX IF NOT EXISTS idx_profiles_org_customer_status
  ON profiles(organization_id, customer_status)
  WHERE role = 'customer';

CREATE INDEX IF NOT EXISTS idx_profiles_disabled_at
  ON profiles(disabled_at)
  WHERE disabled_at IS NOT NULL;

-- Optional compatibility view for old SQL snippets during transition.
CREATE OR REPLACE VIEW normalized_profiles AS
SELECT
  p.*,
  CASE
    WHEN p.role = 'agent' THEN 'employee'
    WHEN p.role = 'manager' THEN 'admin'
    ELSE p.role
  END AS normalized_role
FROM profiles p;

-- ============================================================
-- RLS hardening
-- ============================================================

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_own_tickets" ON tickets;
DROP POLICY IF EXISTS "staff_org_tickets" ON tickets;
DROP POLICY IF EXISTS "customers_create_tickets" ON tickets;
DROP POLICY IF EXISTS "staff_update_tickets" ON tickets;
DROP POLICY IF EXISTS "rbac_tickets_select" ON tickets;
DROP POLICY IF EXISTS "rbac_tickets_insert" ON tickets;
DROP POLICY IF EXISTS "rbac_tickets_update" ON tickets;

CREATE POLICY "rbac_tickets_select" ON tickets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = tickets.organization_id
        AND p.disabled_at IS NULL
        AND (
          p.role = 'admin'
          OR (p.role = 'employee' AND (tickets.assigned_to = auth.uid() OR tickets.created_by = auth.uid()))
          OR (p.role = 'customer' AND p.customer_status = 'active' AND tickets.created_by = auth.uid())
        )
    )
  );

CREATE POLICY "rbac_tickets_insert" ON tickets
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = tickets.organization_id
        AND p.disabled_at IS NULL
        AND (
          p.role IN ('admin', 'employee')
          OR (p.role = 'customer' AND p.customer_status = 'active')
        )
    )
  );

CREATE POLICY "rbac_tickets_update" ON tickets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = tickets.organization_id
        AND p.disabled_at IS NULL
        AND (
          p.role = 'admin'
          OR (p.role = 'employee' AND (tickets.assigned_to = auth.uid() OR tickets.created_by = auth.uid()))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = tickets.organization_id
        AND p.disabled_at IS NULL
        AND (
          p.role = 'admin'
          OR (
            p.role = 'employee'
            AND tickets.assigned_to = auth.uid()
            AND tickets.organization_id = p.organization_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "internal_comments_staff_only" ON ticket_comments;
DROP POLICY IF EXISTS "members_create_comments" ON ticket_comments;
DROP POLICY IF EXISTS "rbac_comments_select" ON ticket_comments;
DROP POLICY IF EXISTS "rbac_comments_insert" ON ticket_comments;

CREATE POLICY "rbac_comments_select" ON ticket_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM tickets t
      JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = ticket_comments.ticket_id
        AND p.organization_id = t.organization_id
        AND p.disabled_at IS NULL
        AND (
          p.role = 'admin'
          OR (
            p.role = 'employee'
            AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
          )
          OR (
            p.role = 'customer'
            AND p.customer_status = 'active'
            AND t.created_by = auth.uid()
            AND ticket_comments.is_internal = FALSE
          )
        )
    )
  );

CREATE POLICY "rbac_comments_insert" ON ticket_comments
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM tickets t
      JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = ticket_comments.ticket_id
        AND p.organization_id = t.organization_id
        AND p.disabled_at IS NULL
        AND (
          p.role = 'admin'
          OR (
            p.role = 'employee'
            AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
          )
          OR (
            p.role = 'customer'
            AND p.customer_status = 'active'
            AND t.created_by = auth.uid()
            AND ticket_comments.is_internal = FALSE
          )
        )
    )
  );

DROP POLICY IF EXISTS "managers_read_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "rbac_audit_logs_admin_select" ON audit_logs;

CREATE POLICY "rbac_audit_logs_admin_select" ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.organization_id = audit_logs.organization_id
        AND p.disabled_at IS NULL
    )
  );
