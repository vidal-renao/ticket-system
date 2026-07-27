-- ============================================================================
-- User identity, customer_type and public reference codes (Phase 4A.14)
-- Additive only. See DECISIONS.md ADR-015 for rationale.
--
-- Rollback (manual, forward-only per ADR-006 — do not run unless reverting
-- this exact migration before it reaches production):
--   DROP TRIGGER IF EXISTS profiles_reference_code_immutable ON public.profiles;
--   DROP TRIGGER IF EXISTS profiles_set_reference_code ON public.profiles;
--   DROP FUNCTION IF EXISTS public.rve_reference_code_immutable();
--   DROP FUNCTION IF EXISTS public.rve_set_reference_code();
--   DROP FUNCTION IF EXISTS public.rve_random_suffix();
--   DROP FUNCTION IF EXISTS public.rve_role_code(text, text);
--   ALTER TABLE public.profiles
--     DROP CONSTRAINT IF EXISTS profiles_reference_code_format_check,
--     DROP CONSTRAINT IF EXISTS profiles_reference_code_key,
--     DROP CONSTRAINT IF EXISTS profiles_customer_type_check,
--     DROP COLUMN IF EXISTS reference_code,
--     DROP COLUMN IF EXISTS customer_type,
--     DROP COLUMN IF EXISTS address, DROP COLUMN IF EXISTS city,
--     DROP COLUMN IF EXISTS postal_code, DROP COLUMN IF EXISTS country,
--     DROP COLUMN IF EXISTS website, DROP COLUMN IF EXISTS contact_person,
--     DROP COLUMN IF EXISTS logo_url;
--   DELETE FROM storage.objects WHERE bucket_id = 'logos';
--   DELETE FROM storage.buckets WHERE id = 'logos';
-- ============================================================================

BEGIN;
SET LOCAL search_path = public, extensions, pg_temp;

-- ----------------------------------------------------------------------------
-- 0. pgcrypto (gen_random_bytes) — Supabase installs this into `extensions`
--    by convention; guarded for idempotency and for the ephemeral CI database.
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. New nullable columns on profiles
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS customer_type   TEXT,
  ADD COLUMN IF NOT EXISTS reference_code  TEXT,
  -- phone is documented in docs/migration_v1_final.sql's original CREATE
  -- TABLE but was never actually present on production's profiles table
  -- (confirmed via information_schema before this migration was applied) --
  -- added here defensively rather than assumed pre-existing.
  ADD COLUMN IF NOT EXISTS phone           TEXT,
  ADD COLUMN IF NOT EXISTS address         TEXT,
  ADD COLUMN IF NOT EXISTS city            TEXT,
  ADD COLUMN IF NOT EXISTS postal_code     TEXT,
  ADD COLUMN IF NOT EXISTS country         TEXT,
  ADD COLUMN IF NOT EXISTS website         TEXT,
  ADD COLUMN IF NOT EXISTS contact_person  TEXT,
  ADD COLUMN IF NOT EXISTS logo_url        TEXT;

-- ----------------------------------------------------------------------------
-- 2. customer_type backfill (evidence-based: a real customers_info.company_name
--    means "company"; its absence means "individual" — a suggestive display
--    name like "Empresa Cliente 1" is NOT treated as evidence on its own).
--    Must happen BEFORE the CHECK constraint below, since existing customer
--    rows currently have customer_type = NULL.
-- ----------------------------------------------------------------------------
UPDATE public.profiles p
SET customer_type = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.customers_info ci
    WHERE ci.id = p.id AND ci.company_name IS NOT NULL AND btrim(ci.company_name) <> ''
  ) THEN 'company'
  ELSE 'individual'
END
WHERE p.role = 'customer' AND p.customer_type IS NULL;

-- ----------------------------------------------------------------------------
-- 3. customer_type CHECK constraint (now satisfiable by every existing row)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_customer_type_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    -- customer_type IS NULL is always allowed -- both as the permanent state
    -- for non-customer roles, and as the transitional state for a customer
    -- profile between the bare row handle_new_user() creates and the app's
    -- follow-up upsert that classifies it individual/company. Once it IS
    -- set, though, it must be a valid value and the profile must actually
    -- be a customer.
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_customer_type_check
      CHECK (
        customer_type IS NULL
        OR (role = 'customer' AND customer_type IN ('individual', 'company'))
      );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Reference-code helper functions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rve_role_code(p_role TEXT, p_customer_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_role = 'admin' THEN 'ADM'
    WHEN p_role = 'manager' THEN 'MGR'
    WHEN p_role = 'agent' THEN 'EMP'
    WHEN p_role = 'customer' AND p_customer_type = 'individual' THEN 'CUS'
    WHEN p_role = 'customer' AND p_customer_type = 'company' THEN 'COM'
    ELSE NULL
  END;
$$;

-- 32-symbol Crockford-style alphabet, excludes 0/O and 1/I.
CREATE OR REPLACE FUNCTION public.rve_random_suffix()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes BYTEA;
  v_out TEXT := '';
  v_idx INTEGER;
  i INTEGER;
BEGIN
  v_bytes := gen_random_bytes(8);
  FOR i IN 0..7 LOOP
    v_idx := (get_byte(v_bytes, i) % length(v_alphabet)) + 1;
    v_out := v_out || substr(v_alphabet, v_idx, 1);
  END LOOP;
  RETURN substr(v_out, 1, 4) || '-' || substr(v_out, 5, 4);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Auto-generation trigger. Leaves reference_code NULL when the role/
--    customer_type combination isn't resolvable yet (e.g. the bare row
--    inserted by handle_new_user() before the app's follow-up upsert sets a
--    real role/customer_type) — a later UPDATE fills it in once resolvable.
--    Never overwrites a caller-supplied value (the backfill below sets its
--    own values explicitly); immutability of an already-set code is enforced
--    by a separate trigger, not here.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rve_set_reference_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_role_code TEXT;
  v_candidate TEXT;
  v_attempt INTEGER := 0;
BEGIN
  IF NEW.reference_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_role_code := public.rve_role_code(NEW.role, NEW.customer_type);
  IF v_role_code IS NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := 'VRE-' || v_role_code || '-' || public.rve_random_suffix();
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE reference_code = v_candidate) THEN
      NEW.reference_code := v_candidate;
      RETURN NEW;
    END IF;
    IF v_attempt >= 20 THEN
      RAISE EXCEPTION 'RVE_REFERENCE_CODE_COLLISION_EXHAUSTED: could not generate a unique reference_code after % attempts', v_attempt;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.rve_reference_code_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.reference_code IS NOT NULL AND NEW.reference_code IS DISTINCT FROM OLD.reference_code THEN
    RAISE EXCEPTION 'RVE_REFERENCE_CODE_IMMUTABLE: reference_code cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER profiles_set_reference_code
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.rve_set_reference_code();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER profiles_reference_code_immutable
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.rve_reference_code_immutable();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 6. Backfill reference_code for every existing profile (explicit loop, not
--    reliant on a no-op UPDATE to fire the trigger above — clearer to test).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  v_role_code TEXT;
  v_candidate TEXT;
  v_attempt INTEGER;
BEGIN
  FOR rec IN
    SELECT id, role, customer_type FROM public.profiles
    WHERE reference_code IS NULL ORDER BY created_at
  LOOP
    v_role_code := public.rve_role_code(rec.role, rec.customer_type);
    IF v_role_code IS NULL THEN
      RAISE EXCEPTION 'RVE_BACKFILL_ROLE_UNRESOLVED: profile % has role=% customer_type=% with no resolvable reference code prefix', rec.id, rec.role, rec.customer_type;
    END IF;

    v_attempt := 0;
    LOOP
      v_attempt := v_attempt + 1;
      v_candidate := 'VRE-' || v_role_code || '-' || public.rve_random_suffix();
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE reference_code = v_candidate) THEN
        UPDATE public.profiles SET reference_code = v_candidate WHERE id = rec.id;
        EXIT;
      END IF;
      IF v_attempt >= 20 THEN
        RAISE EXCEPTION 'RVE_BACKFILL_COLLISION_EXHAUSTED: could not generate a unique reference_code for profile % after % attempts', rec.id, v_attempt;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 7. reference_code constraints (now satisfiable by every row)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_reference_code_key' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_reference_code_key UNIQUE (reference_code);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_reference_code_format_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_reference_code_format_check
      CHECK (
        reference_code IS NULL
        OR reference_code ~ '^VRE-(ADM|MGR|EMP|CUS|COM)-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$'
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_reference_code
  ON public.profiles (reference_code) WHERE reference_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_customer_type
  ON public.profiles (organization_id, customer_type) WHERE role = 'customer';

-- ----------------------------------------------------------------------------
-- 8. Column-level grants — extend the existing self-service-editable set.
--    customer_type and reference_code are intentionally NOT granted: they
--    stay admin/service-role-only, consistent with role/organization_id.
-- ----------------------------------------------------------------------------
GRANT UPDATE (full_name, phone, locale, address, city, postal_code, country, website, contact_person, logo_url)
  ON public.profiles TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. Storage: `logos` bucket, mirroring the existing `avatars` bucket pattern
--    exactly (public read, own-folder-only write via auth.uid()).
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY logos_public_read ON storage.objects
    FOR SELECT USING (bucket_id = 'logos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY logos_own_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY logos_own_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY logos_own_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
