-- ============================================================
-- PHASE 1 MIGRATION — Employee IDs, Constraints & Auto-Routing
-- Safe to run multiple times (idempotent)
-- Run AFTER migration_differential.sql + migration_schema_consistency.sql
-- Author: Vidal Reñao · VIDAL ECOSYSTEM · 2026
-- ============================================================

-- ============================================================
-- 1. PROFILES — add missing columns
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS employee_id   TEXT,
  ADD COLUMN IF NOT EXISTS company_code  TEXT;

-- availability_status + specialty already added by migration_schema_consistency.sql
-- Guarantee they exist here too (idempotent)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS specialty          TEXT,
  ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'offline';

-- ── CHECK constraints ────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_specialty_check'
      AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_specialty_check
      CHECK (specialty IS NULL OR specialty IN (
        'hardware','software','networking','security','billing','other'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_availability_status_check'
      AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_availability_status_check
      CHECK (availability_status IN ('online','offline','busy'));
  END IF;
END $$;

-- Backfill any NULLs before applying NOT NULL / DEFAULT
UPDATE profiles
SET availability_status = 'offline'
WHERE availability_status IS NULL;

ALTER TABLE profiles
  ALTER COLUMN availability_status SET DEFAULT 'offline';

-- UNIQUE on employee_id (skip if duplicates exist — run cleanup first if needed)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_employee_id_key'
      AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_employee_id_key UNIQUE (employee_id);
  END IF;
END $$;

-- ── indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_availability
  ON profiles(organization_id, availability_status)
  WHERE availability_status = 'online';

CREATE INDEX IF NOT EXISTS idx_profiles_specialty
  ON profiles(organization_id, specialty);

CREATE INDEX IF NOT EXISTS idx_profiles_employee_id
  ON profiles(employee_id)
  WHERE employee_id IS NOT NULL;

-- ============================================================
-- 2. EMPLOYEE ID AUTO-GENERATION
-- ============================================================

-- Sequence: one global counter (EMP-0001 … EMP-9999+)
CREATE SEQUENCE IF NOT EXISTS employee_id_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION generate_employee_id()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_next INTEGER;
BEGIN
  v_next := nextval('employee_id_seq');
  RETURN 'EMP-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- Trigger: set employee_id on INSERT when not supplied
CREATE OR REPLACE FUNCTION trg_set_employee_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.employee_id IS NULL THEN
    NEW.employee_id := generate_employee_id();
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER profiles_set_employee_id
    BEFORE INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION trg_set_employee_id();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill existing profiles that have no employee_id
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM profiles WHERE employee_id IS NULL ORDER BY created_at
  LOOP
    UPDATE profiles
    SET employee_id = generate_employee_id()
    WHERE id = rec.id;
  END LOOP;
END $$;

-- ============================================================
-- 3. AUTO-ROUTING FUNCTION
-- ============================================================

-- Maps ticket category name → specialty value
CREATE OR REPLACE FUNCTION category_to_specialty(p_category TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE lower(trim(p_category))
    WHEN 'networking' THEN 'networking'
    WHEN 'hardware'   THEN 'hardware'
    WHEN 'software'   THEN 'software'
    WHEN 'security'   THEN 'security'
    WHEN 'billing'    THEN 'billing'
    ELSE 'other'
  END;
END;
$$;

-- Core routing logic
CREATE OR REPLACE FUNCTION assign_ticket_to_agent(p_ticket_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ticket         tickets%ROWTYPE;
  v_org_id         UUID;
  v_category       TEXT;
  v_specialty      TEXT;
  v_agent_id       UUID;
  v_agent_name     TEXT;
  v_already_assigned BOOLEAN;
BEGIN
  -- Load ticket
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Skip if already assigned
  IF v_ticket.assigned_to IS NOT NULL THEN RETURN; END IF;

  v_org_id := v_ticket.organization_id;

  -- Resolve category from ai_analysis (preferred) or tickets.category_id
  SELECT COALESCE(
    (SELECT a.suggested_category FROM ai_analysis a WHERE a.ticket_id = p_ticket_id LIMIT 1),
    (SELECT c.slug FROM categories c WHERE c.id = v_ticket.category_id LIMIT 1),
    'other'
  ) INTO v_category;

  v_specialty := category_to_specialty(v_category);

  -- ── 1st preference: specialist with fewest open tickets ──
  SELECT p.id, p.full_name
  INTO   v_agent_id, v_agent_name
  FROM   profiles p
  LEFT JOIN tickets t
    ON t.assigned_to = p.id
    AND t.status IN ('open','in_progress','pending_customer','pending_third_party')
  WHERE  p.organization_id    = v_org_id
    AND  p.role               IN ('agent','manager')
    AND  p.availability_status = 'online'
    AND  p.is_active           = TRUE
    AND  p.specialty           = v_specialty
  GROUP BY p.id, p.full_name
  ORDER BY COUNT(t.id) ASC
  LIMIT 1;

  -- ── 2nd preference: any online agent (any specialty) ──
  IF v_agent_id IS NULL THEN
    SELECT p.id, p.full_name
    INTO   v_agent_id, v_agent_name
    FROM   profiles p
    LEFT JOIN tickets t
      ON t.assigned_to = p.id
      AND t.status IN ('open','in_progress','pending_customer','pending_third_party')
    WHERE  p.organization_id    = v_org_id
      AND  p.role               IN ('agent','manager')
      AND  p.availability_status = 'online'
      AND  p.is_active           = TRUE
    GROUP BY p.id, p.full_name
    ORDER BY COUNT(t.id) ASC
    LIMIT 1;
  END IF;

  -- ── Assign + notify ──────────────────────────────────────
  IF v_agent_id IS NOT NULL THEN
    UPDATE tickets
    SET assigned_to = v_agent_id,
        status      = 'in_progress',
        updated_at  = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO notifications (user_id, ticket_id, type, title, message, action_url)
    VALUES (
      v_agent_id,
      p_ticket_id,
      'ticket_assigned',
      'New ticket assigned',
      'A ' || v_category || ' ticket has been assigned to you.',
      '/tickets/' || p_ticket_id
    );

  ELSE
    -- No agent online → notify all admins in the org
    INSERT INTO notifications (user_id, ticket_id, type, title, message, action_url)
    SELECT
      p.id,
      p_ticket_id,
      'unassigned_ticket',
      'Ticket unassigned — no agents online',
      'Ticket #' || v_ticket.ticket_number || ' (' || v_category || ') has no available agent.',
      '/tickets/' || p_ticket_id
    FROM profiles p
    WHERE p.organization_id = v_org_id
      AND p.role = 'admin'
      AND p.is_active = TRUE;
  END IF;
END;
$$;

-- ============================================================
-- 4. TRIGGERS — call assign_ticket_to_agent automatically
-- ============================================================

-- After ticket INSERT (fires immediately on portal/API creation)
CREATE OR REPLACE FUNCTION trg_auto_assign_on_ticket_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assign_ticket_to_agent(NEW.id);
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER tickets_auto_assign
    AFTER INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION trg_auto_assign_on_ticket_insert();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- After ai_analysis INSERT (re-run routing with category from AI)
CREATE OR REPLACE FUNCTION trg_auto_assign_on_ai_analysis()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only route if ticket still unassigned
  IF EXISTS (SELECT 1 FROM tickets WHERE id = NEW.ticket_id AND assigned_to IS NULL) THEN
    PERFORM assign_ticket_to_agent(NEW.ticket_id);
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER ai_analysis_auto_assign
    AFTER INSERT ON ai_analysis
    FOR EACH ROW EXECUTE FUNCTION trg_auto_assign_on_ai_analysis();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 5. RLS — service role can call assign_ticket_to_agent
--    (SECURITY DEFINER already bypasses RLS inside the function)
--    Notifications insert must be allowed for the function's role.
-- ============================================================

DO $$ BEGIN
  CREATE POLICY "service_insert_notifications" ON notifications FOR INSERT
    WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ============================================================
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'profiles'::regclass AND contype = 'c';
--
-- SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema = 'public'
--   AND routine_name IN ('assign_ticket_to_agent','generate_employee_id','category_to_specialty');
--
-- SELECT * FROM profiles WHERE employee_id IS NULL;  -- should return 0 rows
