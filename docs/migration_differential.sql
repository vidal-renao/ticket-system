-- ============================================================
-- DIFFERENTIAL MIGRATION — AI Helpdesk Ticket System
-- Safe to run multiple times (idempotent)
-- Run in Supabase SQL Editor
-- Author: Vidal Reñao · VIDAL ECOSYSTEM
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS (safe re-run)
-- ============================================================
DO $$ BEGIN CREATE TYPE ticket_status AS ENUM (
  'open','in_progress','pending_customer','pending_third_party','resolved','closed'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE ticket_priority AS ENUM (
  'low','medium','high','critical'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE user_role AS ENUM (
  'customer','agent','manager','admin'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE ticket_source AS ENUM (
  'portal','email','api','phone'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sentiment_type AS ENUM (
  'calm','neutral','frustrated','urgent','angry'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE org_plan AS ENUM (
  'starter','pro','enterprise'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 1. ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  slug                 TEXT UNIQUE NOT NULL,
  plan                 org_plan DEFAULT 'starter',
  logo_url             TEXT,
  primary_color        TEXT DEFAULT '#6366f1',
  support_email        TEXT,
  settings             JSONB DEFAULT '{}',
  data_retention_days  INTEGER DEFAULT 365,
  dpa_signed_at        TIMESTAMPTZ,
  dpa_signed_by        TEXT,
  data_controller_name TEXT,
  data_controller_email TEXT,
  is_active            BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. PROFILES — add missing columns to existing table
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS avatar_url      TEXT,
  ADD COLUMN IF NOT EXISTS role            TEXT NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS department      TEXT,
  ADD COLUMN IF NOT EXISTS phone           TEXT,
  ADD COLUMN IF NOT EXISTS locale          TEXT DEFAULT 'de',
  ADD COLUMN IF NOT EXISTS timezone        TEXT DEFAULT 'Europe/Zurich',
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS data_processing_consent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_ip      INET,
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

-- Enforce valid roles via CHECK constraint (keeps column as TEXT — avoids ALTER TYPE
-- conflicts with RLS policies / partial-run state; TypeScript enforces the union type)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('customer','agent','manager','admin'));
  END IF;
END $$;

-- ============================================================
-- 3. CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  color           TEXT DEFAULT '#6366f1',
  icon            TEXT DEFAULT 'ticket',
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, slug)
);

-- ============================================================
-- 4. SLA POLICIES
-- ============================================================
CREATE TABLE IF NOT EXISTS sla_policies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  priority              ticket_priority NOT NULL,
  first_response_hours  INTEGER NOT NULL,
  resolution_hours      INTEGER NOT NULL,
  business_hours_only   BOOLEAN DEFAULT TRUE,
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, priority)
);

-- ============================================================
-- 5. TICKETS
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1000 INCREMENT 1;

CREATE TABLE IF NOT EXISTS tickets (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number          INTEGER DEFAULT nextval('ticket_number_seq') UNIQUE,
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id            UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_by             UUID NOT NULL REFERENCES profiles(id),
  assigned_to            UUID REFERENCES profiles(id),
  title                  TEXT NOT NULL,
  description            TEXT NOT NULL,
  detected_language      TEXT,
  status                 ticket_status NOT NULL DEFAULT 'open',
  priority               ticket_priority NOT NULL DEFAULT 'medium',
  source                 ticket_source DEFAULT 'portal',
  tags                   TEXT[] DEFAULT '{}',
  sla_policy_id          UUID REFERENCES sla_policies(id),
  sla_first_response_due TIMESTAMPTZ,
  sla_resolution_due     TIMESTAMPTZ,
  first_response_at      TIMESTAMPTZ,
  sla_first_response_met BOOLEAN,
  sla_resolution_met     BOOLEAN,
  sla_breached           BOOLEAN DEFAULT FALSE,
  resolved_at            TIMESTAMPTZ,
  closed_at              TIMESTAMPTZ,
  contains_pii           BOOLEAN DEFAULT FALSE,
  anonymized_at          TIMESTAMPTZ,
  retention_delete_at    TIMESTAMPTZ,
  metadata               JSONB DEFAULT '{}',
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Human-readable ref: TK-1042
CREATE OR REPLACE FUNCTION ticket_ref(t tickets) RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN 'TK-' || LPAD(t.ticket_number::TEXT, 4, '0');
END;
$$;

-- ============================================================
-- 6. TICKET COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES profiles(id),
  content         TEXT NOT NULL,
  is_internal     BOOLEAN DEFAULT FALSE,
  is_ai_generated BOOLEAN DEFAULT FALSE,
  edited_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. TICKET ATTACHMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by  UUID NOT NULL REFERENCES profiles(id),
  file_name    TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  file_size    INTEGER,
  mime_type    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. AI ANALYSIS
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_analysis (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                  UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  suggested_category         TEXT,
  suggested_priority         ticket_priority,
  confidence_score           NUMERIC(5,2),
  summary                    TEXT,
  sentiment                  sentiment_type,
  keywords                   TEXT[] DEFAULT '{}',
  detected_language          TEXT,
  contains_pii_detected      BOOLEAN DEFAULT FALSE,
  smart_response             TEXT,
  estimated_resolution_hours INTEGER,
  reasoning                  TEXT,
  model_used                 TEXT DEFAULT 'claude-sonnet-4-6',
  input_tokens               INTEGER,
  output_tokens              INTEGER,
  processing_time_ms         INTEGER,
  raw_response               JSONB,
  category_accepted          BOOLEAN,
  priority_accepted          BOOLEAN,
  agent_feedback             TEXT,
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (ticket_id)
);

-- ============================================================
-- 9. AUDIT LOGS (DSG/LPD immutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role      user_role,
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     UUID,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Immutability rules (DSG compliance)
DO $$ BEGIN
  CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 10. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticket_id  UUID REFERENCES tickets(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT,
  action_url TEXT,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tickets_org_status   ON tickets(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_org_priority ON tickets(organization_id, priority);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned     ON tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_created_by   ON tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_breached ON tickets(sla_breached) WHERE sla_breached = TRUE;
CREATE INDEX IF NOT EXISTS idx_tickets_created_at   ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_ticket      ON ticket_comments(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_ticket            ON ai_analysis(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_audit_org_action     ON audit_logs(organization_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource       ON audit_logs(resource_type, resource_id);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- Auto-profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at triggers
DO $$ BEGIN CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER comments_updated_at BEFORE UPDATE ON ticket_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SLA due dates on ticket insert
CREATE OR REPLACE FUNCTION calculate_sla_due_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_sla sla_policies%ROWTYPE;
BEGIN
  SELECT * INTO v_sla FROM sla_policies
  WHERE organization_id = NEW.organization_id AND priority = NEW.priority AND is_active = TRUE LIMIT 1;
  IF FOUND THEN
    NEW.sla_policy_id           := v_sla.id;
    NEW.sla_first_response_due  := NEW.created_at + (v_sla.first_response_hours || ' hours')::INTERVAL;
    NEW.sla_resolution_due      := NEW.created_at + (v_sla.resolution_hours || ' hours')::INTERVAL;
  END IF;
  NEW.retention_delete_at := NEW.created_at + (
    SELECT (data_retention_days || ' days')::INTERVAL FROM organizations WHERE id = NEW.organization_id
  );
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER tickets_sla_on_insert BEFORE INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION calculate_sla_due_dates();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Audit log on ticket changes
CREATE OR REPLACE FUNCTION audit_ticket_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_logs (organization_id, actor_id, action, resource_type, resource_id, old_values, new_values)
  VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'ticket.created' WHEN 'UPDATE' THEN 'ticket.updated' ELSE 'ticket.deleted' END,
    'ticket',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER tickets_audit AFTER INSERT OR UPDATE OR DELETE ON tickets FOR EACH ROW EXECUTE FUNCTION audit_ticket_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organizations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_policies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications   ENABLE ROW LEVEL SECURITY;

-- Organizations
DO $$ BEGIN CREATE POLICY "org_members_read_own_org" ON organizations FOR SELECT
  USING (id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "admins_update_own_org" ON organizations FOR UPDATE
  USING (id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Profiles (drop basic ones we added, replace with full schema)
DROP POLICY IF EXISTS "profiles_select_own"   ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON profiles;

DO $$ BEGIN CREATE POLICY "users_read_same_org_profiles" ON profiles FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()) OR id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "users_update_own_profile" ON profiles FOR UPDATE
  USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "admins_manage_profiles" ON profiles FOR ALL
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Categories
DO $$ BEGIN CREATE POLICY "org_members_read_categories" ON categories FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SLA Policies
DO $$ BEGIN CREATE POLICY "org_members_read_sla" ON sla_policies FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tickets
DO $$ BEGIN CREATE POLICY "customers_own_tickets" ON tickets FOR SELECT
  USING (created_by = auth.uid() AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'customer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "staff_org_tickets" ON tickets FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent','manager','admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "customers_create_tickets" ON tickets FOR INSERT
  WITH CHECK (created_by = auth.uid()
    AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "staff_update_tickets" ON tickets FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent','manager','admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ticket Comments
DO $$ BEGIN CREATE POLICY "internal_comments_staff_only" ON ticket_comments FOR SELECT
  USING (is_internal = FALSE
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent','manager','admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "members_create_comments" ON ticket_comments FOR INSERT
  WITH CHECK (author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_id
      AND (t.created_by = auth.uid()
        OR (SELECT organization_id FROM profiles WHERE id = auth.uid()) = t.organization_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AI Analysis (staff only)
DO $$ BEGIN CREATE POLICY "staff_read_ai_analysis" ON ai_analysis FOR SELECT
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent','manager','admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "service_insert_ai_analysis" ON ai_analysis FOR INSERT
  WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Notifications
DO $$ BEGIN CREATE POLICY "users_own_notifications" ON notifications FOR ALL
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Audit Logs (managers + admins read)
DO $$ BEGIN CREATE POLICY "managers_read_audit_logs" ON audit_logs FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager','admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SEED FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION seed_default_categories(org_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO categories (organization_id, name, slug, description, color, icon, sort_order) VALUES
    (org_id, 'Networking', 'networking', 'Connectivity, VPN, WiFi, DNS issues',     '#3b82f6', 'wifi',         1),
    (org_id, 'Hardware',   'hardware',   'Physical equipment, peripherals, devices', '#f59e0b', 'cpu',          2),
    (org_id, 'Software',   'software',   'Applications, OS, licenses, updates',     '#8b5cf6', 'monitor',      3),
    (org_id, 'Security',   'security',   'Access, credentials, incidents, threats', '#ef4444', 'shield-alert', 4),
    (org_id, 'Billing',    'billing',    'Invoices, subscriptions, cost questions',  '#10b981', 'credit-card',  5),
    (org_id, 'Other',      'other',      'General requests and inquiries',           '#6b7280', 'circle-help',  6)
  ON CONFLICT (organization_id, slug) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION seed_default_sla_policies(org_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sla_policies (organization_id, name, priority, first_response_hours, resolution_hours) VALUES
    (org_id, 'Critical SLA', 'critical', 1,  4  ),
    (org_id, 'High SLA',     'high',     4,  24 ),
    (org_id, 'Medium SLA',   'medium',   8,  72 ),
    (org_id, 'Low SLA',      'low',      24, 168)
  ON CONFLICT (organization_id, priority) DO NOTHING;
END;
$$;

-- ============================================================
-- SEED: Vidal Lab organization
-- ============================================================
DO $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Insert org (skip if slug already exists)
  INSERT INTO organizations (name, slug, plan, support_email, data_controller_name, data_controller_email)
  VALUES ('Vidal Lab', 'vidal-lab', 'enterprise', 'support@vidallab.ch', 'Vidal Reñao', 'htcpacoxo31@gmail.com')
  ON CONFLICT (slug) DO NOTHING;

  -- Get org ID
  SELECT id INTO v_org_id FROM organizations WHERE slug = 'vidal-lab';

  -- Link Vidal's profile
  UPDATE profiles
  SET organization_id = v_org_id,
      full_name       = COALESCE(full_name, 'Vidal Reñao'),
      role            = 'admin'
  WHERE id = 'ee677b39-906f-4027-a01c-69024c8c23f5';

  -- Seed categories and SLA for the org
  PERFORM seed_default_categories(v_org_id);
  PERFORM seed_default_sla_policies(v_org_id);
END $$;
