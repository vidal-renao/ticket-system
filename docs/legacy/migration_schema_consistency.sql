-- ============================================================
-- SCHEMA CONSISTENCY PATCH
-- Adds tables/columns referenced by the application but absent
-- from the base migrations in some environments.
-- Safe to run after migration_v1_final.sql or migration_differential.sql.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Teams used for agent specialization and ticket auto-assignment.
CREATE TABLE IF NOT EXISTS teams (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

-- CREATE TABLE IF NOT EXISTS does not add missing columns when the table
-- already exists, so guarantee every column before indexes and policies use it.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE teams
SET is_active = TRUE
WHERE is_active IS NULL;

UPDATE teams
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE teams
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN is_active SET DEFAULT TRUE,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'teams'::regclass
      AND contype = 'p'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM teams
    WHERE id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM teams
    GROUP BY id
    HAVING COUNT(*) > 1
  ) THEN
    ALTER TABLE teams
      ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'teams'::regclass
      AND contype = 'u'
  AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'teams'::regclass AND attname = 'organization_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'teams'::regclass AND attname = 'name')
      ]::SMALLINT[]
  )
  AND NOT EXISTS (
    SELECT 1
    FROM teams
    GROUP BY organization_id, name
    HAVING COUNT(*) > 1
  ) THEN
    ALTER TABLE teams
      ADD CONSTRAINT teams_organization_id_name_key UNIQUE (organization_id, name);
  END IF;
END $$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS team_id UUID,
  ADD COLUMN IF NOT EXISTS specialty TEXT,
  ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'offline';

UPDATE profiles
SET availability_status = CASE
  WHEN role IN ('agent', 'manager', 'admin') AND is_active THEN 'online'
  ELSE 'offline'
END
WHERE availability_status IS NULL;

ALTER TABLE profiles
  ALTER COLUMN availability_status SET DEFAULT 'offline';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'profiles'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'profiles'::regclass AND attname = 'team_id')
      ]::SMALLINT[]
      AND confrelid = 'teams'::regclass
  )
  AND EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'teams'::regclass
      AND contype IN ('p', 'u')
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'teams'::regclass AND attname = 'id')
      ]::SMALLINT[]
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_team_id_fkey
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sla_policies (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  priority             ticket_priority NOT NULL,
  first_response_hours INTEGER     NOT NULL,
  resolution_hours     INTEGER     NOT NULL,
  business_hours_only  BOOLEAN     DEFAULT TRUE,
  is_active            BOOLEAN     DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, priority)
);

ALTER TABLE sla_policies
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS priority ticket_priority,
  ADD COLUMN IF NOT EXISTS first_response_hours INTEGER,
  ADD COLUMN IF NOT EXISTS resolution_hours INTEGER,
  ADD COLUMN IF NOT EXISTS business_hours_only BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- SLA compatibility columns used by the lifecycle-aware application layer.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS response_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_agent_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_response_breached BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sla_resolution_breached BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sla_first_response_due TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_resolution_due TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_first_response_met BOOLEAN,
  ADD COLUMN IF NOT EXISTS sla_resolution_met BOOLEAN,
  ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sla_policy_id UUID REFERENCES sla_policies(id);

UPDATE tickets
SET
  response_due_at = COALESCE(response_due_at, sla_first_response_due),
  resolution_due_at = COALESCE(resolution_due_at, sla_resolution_due),
  first_agent_response_at = COALESCE(first_agent_response_at, first_response_at),
  sla_response_breached = COALESCE(sla_response_breached, FALSE),
  sla_resolution_breached = COALESCE(sla_resolution_breached, FALSE),
  sla_breached = COALESCE(
    sla_breached,
    COALESCE(sla_response_breached, FALSE) OR COALESCE(sla_resolution_breached, FALSE),
    FALSE
  );

ALTER TABLE tickets
  ALTER COLUMN sla_response_breached SET DEFAULT FALSE,
  ALTER COLUMN sla_resolution_breached SET DEFAULT FALSE,
  ALTER COLUMN sla_breached SET DEFAULT FALSE;

-- Company/customer profile data used by admin, inbox, team and settings pages.
CREATE TABLE IF NOT EXISTS customers_info (
  id               UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  company_name     TEXT        NOT NULL,
  industry         TEXT        DEFAULT '',
  business_details TEXT        DEFAULT '',
  tax_id           TEXT        DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customers_info
  ADD COLUMN IF NOT EXISTS id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS industry TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_details TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS tax_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE customers_info
SET company_name = ''
WHERE company_name IS NULL;

ALTER TABLE customers_info
  ALTER COLUMN company_name SET DEFAULT '',
  ALTER COLUMN company_name SET NOT NULL,
  ALTER COLUMN industry SET DEFAULT '',
  ALTER COLUMN business_details SET DEFAULT '',
  ALTER COLUMN tax_id SET DEFAULT '',
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'customers_info'::regclass
      AND contype = 'p'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM customers_info
    WHERE id IS NULL
  ) THEN
    ALTER TABLE customers_info
      ADD CONSTRAINT customers_info_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- Minimal event log support for lifecycle and assignment tracking.
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role      TEXT,
  action          TEXT        NOT NULL,
  resource_type   TEXT        NOT NULL,
  resource_id     UUID,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS resource_type TEXT,
  ADD COLUMN IF NOT EXISTS resource_id UUID,
  ADD COLUMN IF NOT EXISTS old_values JSONB,
  ADD COLUMN IF NOT EXISTS new_values JSONB,
  ADD COLUMN IF NOT EXISTS ip_address INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE audit_logs
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT NOW();

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticket_id   UUID        REFERENCES tickets(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  message     TEXT,
  action_url  TEXT,
  is_read     BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE notifications
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN is_read SET DEFAULT FALSE,
  ALTER COLUMN created_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_teams_org_active
  ON teams(organization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_profiles_team_id
  ON profiles(team_id)
  WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_info_company
  ON customers_info(company_name);

CREATE INDEX IF NOT EXISTS idx_audit_org_action
  ON audit_logs(organization_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_resource
  ON audit_logs(resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_tickets_sla_response_due
  ON tickets(response_due_at)
  WHERE response_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_sla_resolution_due
  ON tickets(resolution_due_at)
  WHERE resolution_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_sla_response_breached
  ON tickets(sla_response_breached)
  WHERE sla_response_breached = TRUE;

CREATE INDEX IF NOT EXISTS idx_tickets_sla_resolution_breached
  ON tickets(sla_resolution_breached)
  WHERE sla_resolution_breached = TRUE;

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, is_read, created_at DESC)
  WHERE is_read = FALSE;

-- Generic updated_at trigger function required by the triggers below.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER customers_info_updated_at
    BEFORE UPDATE ON customers_info
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_read_teams" ON teams;
CREATE POLICY "org_members_read_teams" ON teams FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "managers_manage_teams" ON teams;
CREATE POLICY "managers_manage_teams" ON teams FOR ALL
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager', 'admin')
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager', 'admin')
  );

DROP POLICY IF EXISTS "customers_manage_own_info" ON customers_info;
CREATE POLICY "customers_manage_own_info" ON customers_info FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "staff_read_org_customer_info" ON customers_info;
CREATE POLICY "staff_read_org_customer_info" ON customers_info FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles customer_profile
      WHERE customer_profile.id = customers_info.id
        AND customer_profile.organization_id = (
          SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    )
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent', 'manager', 'admin')
  );

DROP POLICY IF EXISTS "admins_manage_org_customer_info" ON customers_info;
CREATE POLICY "admins_manage_org_customer_info" ON customers_info FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM profiles customer_profile
      WHERE customer_profile.id = customers_info.id
        AND customer_profile.organization_id = (
          SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    )
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles customer_profile
      WHERE customer_profile.id = customers_info.id
        AND customer_profile.organization_id = (
          SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    )
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "managers_read_audit_logs" ON audit_logs;
CREATE POLICY "managers_read_audit_logs" ON audit_logs FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager', 'admin')
  );

DROP POLICY IF EXISTS "users_own_notifications" ON notifications;
CREATE POLICY "users_own_notifications" ON notifications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
