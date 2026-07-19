-- ============================================================
-- AI-POWERED HELPDESK TICKET SYSTEM — Supabase Schema
-- Stack: PostgreSQL + RLS + Supabase Auth
-- Compliance: DSG/LPD (Swiss Data Protection Act)
-- Author: Vidal Reñao · VIDAL ECOSYSTEM
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE ticket_status AS ENUM (
  'open',
  'in_progress',
  'pending_customer',
  'pending_third_party',
  'resolved',
  'closed'
);

CREATE TYPE ticket_priority AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

CREATE TYPE user_role AS ENUM (
  'customer',    -- End user / employee
  'agent',       -- Helpdesk technician
  'manager',     -- Team lead / supervisor
  'admin'        -- System administrator
);

CREATE TYPE ticket_source AS ENUM (
  'portal',
  'email',
  'api',
  'phone'
);

CREATE TYPE sentiment_type AS ENUM (
  'calm',
  'neutral',
  'frustrated',
  'urgent',
  'angry'
);

CREATE TYPE org_plan AS ENUM (
  'starter',   -- Up to 3 agents, 100 tickets/month
  'pro',       -- Up to 15 agents, unlimited tickets
  'enterprise' -- Unlimited, SLA guarantees, dedicated support
);

-- ============================================================
-- 1. ORGANIZATIONS (Multi-tenant)
-- ============================================================

CREATE TABLE organizations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  slug                    TEXT UNIQUE NOT NULL,                -- URL-safe identifier
  plan                    org_plan DEFAULT 'starter',
  logo_url                TEXT,
  primary_color           TEXT DEFAULT '#6366f1',             -- Brand color for portal
  support_email           TEXT,
  settings                JSONB DEFAULT '{}',                 -- Feature flags, custom config

  -- DSG/LPD Compliance fields
  data_retention_days     INTEGER DEFAULT 365,                -- Auto-delete after N days
  dpa_signed_at           TIMESTAMPTZ,                        -- Data Processing Agreement
  dpa_signed_by           TEXT,
  data_controller_name    TEXT,                               -- Legal entity responsible
  data_controller_email   TEXT,

  is_active               BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. PROFILES (Extends auth.users)
-- ============================================================

CREATE TABLE profiles (
  id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id         UUID REFERENCES organizations(id) ON DELETE SET NULL,
  full_name               TEXT,
  avatar_url              TEXT,
  role                    user_role NOT NULL DEFAULT 'customer',
  department              TEXT,                               -- e.g. "IT", "Finance", "HR"
  phone                   TEXT,
  locale                  TEXT DEFAULT 'de',                  -- de, fr, it, en (CH languages)
  timezone                TEXT DEFAULT 'Europe/Zurich',
  is_active               BOOLEAN DEFAULT TRUE,

  -- DSG/LPD: Explicit consent tracking
  data_processing_consent BOOLEAN DEFAULT FALSE,
  consent_given_at        TIMESTAMPTZ,
  consent_ip              INET,                               -- IP at consent time
  marketing_consent       BOOLEAN DEFAULT FALSE,

  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 3. CATEGORIES
-- ============================================================

CREATE TABLE categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,    -- 'Networking', 'Hardware', 'Software', 'Billing', 'Security', 'Other'
  slug            TEXT NOT NULL,    -- 'networking', 'hardware', etc.
  description     TEXT,
  color           TEXT DEFAULT '#6366f1',    -- Hex for UI badge
  icon            TEXT DEFAULT 'ticket',     -- Lucide icon name
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, slug)
);

-- Default categories (applied per org on creation)
-- INSERT via trigger or seed script

-- ============================================================
-- 4. SLA POLICIES
-- ============================================================

CREATE TABLE sla_policies (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,                      -- e.g. "Standard", "VIP", "Critical"
  priority                ticket_priority NOT NULL,
  first_response_hours    INTEGER NOT NULL,                   -- Time to first reply
  resolution_hours        INTEGER NOT NULL,                   -- Time to full resolution
  business_hours_only     BOOLEAN DEFAULT TRUE,               -- Count only Mon-Fri 08:00-18:00 CET
  is_active               BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, priority)
);

-- ============================================================
-- 5. TICKETS (Core entity)
-- ============================================================

CREATE SEQUENCE ticket_number_seq START 1000 INCREMENT 1;

CREATE TABLE tickets (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number           INTEGER DEFAULT nextval('ticket_number_seq') UNIQUE,
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id             UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_by              UUID NOT NULL REFERENCES profiles(id),
  assigned_to             UUID REFERENCES profiles(id),

  -- Content
  title                   TEXT NOT NULL,
  description             TEXT NOT NULL,
  detected_language       TEXT,                               -- 'de', 'fr', 'it', 'en'

  -- Status & Priority (may be overridden by agent after AI suggestion)
  status                  ticket_status NOT NULL DEFAULT 'open',
  priority                ticket_priority NOT NULL DEFAULT 'medium',
  source                  ticket_source DEFAULT 'portal',
  tags                    TEXT[] DEFAULT '{}',

  -- SLA Tracking
  sla_policy_id           UUID REFERENCES sla_policies(id),
  sla_first_response_due  TIMESTAMPTZ,
  sla_resolution_due      TIMESTAMPTZ,
  first_response_at       TIMESTAMPTZ,                        -- Actual first agent response
  sla_first_response_met  BOOLEAN,
  sla_resolution_met      BOOLEAN,
  sla_breached            BOOLEAN DEFAULT FALSE,

  -- Lifecycle timestamps
  resolved_at             TIMESTAMPTZ,
  closed_at               TIMESTAMPTZ,

  -- DSG/LPD
  contains_pii            BOOLEAN DEFAULT FALSE,              -- Flagged by AI or agent
  anonymized_at           TIMESTAMPTZ,                        -- Null = not yet anonymized
  retention_delete_at     TIMESTAMPTZ,                        -- Calculated from org policy

  -- Metadata
  metadata                JSONB DEFAULT '{}',                 -- Extensible custom fields

  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Human-readable ticket ID view: TK-1042
CREATE OR REPLACE FUNCTION ticket_ref(t tickets) RETURNS TEXT AS $$
  SELECT 'TK-' || LPAD(t.ticket_number::TEXT, 4, '0');
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- 6. TICKET COMMENTS
-- ============================================================

CREATE TABLE ticket_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES profiles(id),
  content         TEXT NOT NULL,
  is_internal     BOOLEAN DEFAULT FALSE,      -- Internal notes: hidden from customer
  is_ai_generated BOOLEAN DEFAULT FALSE,      -- Marks AI smart_response suggestions
  edited_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. TICKET ATTACHMENTS
-- ============================================================

CREATE TABLE ticket_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by     UUID NOT NULL REFERENCES profiles(id),
  file_name       TEXT NOT NULL,
  storage_path    TEXT NOT NULL,              -- Supabase Storage path
  file_url        TEXT NOT NULL,
  file_size       INTEGER,                    -- Bytes
  mime_type       TEXT,
  -- DSG/LPD: attachments purged with ticket
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. AI ANALYSIS (Core differentiator)
-- ============================================================

CREATE TABLE ai_analysis (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  -- AI Classification Output
  suggested_category          TEXT,                           -- AI-suggested category name
  suggested_priority          ticket_priority,                -- AI-suggested priority
  confidence_score            NUMERIC(5,2),                   -- 0.00 - 100.00

  -- Content Analysis
  summary                     TEXT,                           -- 1-2 sentence summary
  sentiment                   sentiment_type,                 -- Emotional tone detected
  keywords                    TEXT[] DEFAULT '{}',
  detected_language           TEXT,                           -- 'de', 'fr', 'it', 'en'
  contains_pii_detected       BOOLEAN DEFAULT FALSE,          -- AI flagged potential PII

  -- Agent Assistance
  smart_response              TEXT,                           -- Suggested reply (same language)
  estimated_resolution_hours  INTEGER,
  reasoning                   TEXT,                           -- Why this priority/category

  -- Model Metadata (for auditing & cost tracking)
  model_used                  TEXT DEFAULT 'claude-sonnet-4-6',
  input_tokens                INTEGER,
  output_tokens               INTEGER,
  processing_time_ms          INTEGER,
  raw_response                JSONB,                          -- Full Claude JSON (debug)

  -- Agent Feedback (for future fine-tuning)
  category_accepted           BOOLEAN,                        -- Did agent keep the suggestion?
  priority_accepted           BOOLEAN,
  agent_feedback              TEXT,                           -- Optional agent comment on AI

  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (ticket_id)
);

-- ============================================================
-- 9. AUDIT LOGS (DSG/LPD — mandatory)
-- ============================================================

CREATE TABLE ticket_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role      user_role,
  action          TEXT NOT NULL,              -- 'ticket.created', 'ticket.closed', 'data.exported', 'user.login'
  resource_type   TEXT NOT NULL,              -- 'ticket', 'profile', 'attachment', 'ai_analysis'
  resource_id     UUID,
  old_values      JSONB,                      -- Previous state (for updates)
  new_values      JSONB,                      -- New state
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs are immutable — no UPDATE or DELETE allowed (DSG compliance)
CREATE RULE ticket_audit_logs_no_update AS ON UPDATE TO ticket_audit_logs DO INSTEAD NOTHING;
CREATE RULE ticket_audit_logs_no_delete AS ON DELETE TO ticket_audit_logs DO INSTEAD NOTHING;

-- ============================================================
-- 10. NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticket_id   UUID REFERENCES tickets(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,          -- 'ticket.assigned', 'ticket.updated', 'sla.warning', 'sla.breached', 'comment.added'
  title       TEXT NOT NULL,
  message     TEXT,
  action_url  TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES (Performance)
-- ============================================================

-- Tickets: most common query patterns
CREATE INDEX idx_tickets_org_status    ON tickets(organization_id, status);
CREATE INDEX idx_tickets_org_priority  ON tickets(organization_id, priority);
CREATE INDEX idx_tickets_assigned      ON tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_tickets_created_by    ON tickets(created_by);
CREATE INDEX idx_tickets_sla_breached  ON tickets(sla_breached) WHERE sla_breached = TRUE;
CREATE INDEX idx_tickets_created_at    ON tickets(created_at DESC);

-- Comments
CREATE INDEX idx_comments_ticket       ON ticket_comments(ticket_id, created_at DESC);

-- AI Analysis
CREATE INDEX idx_ai_ticket             ON ai_analysis(ticket_id);

-- Notifications: unread fast fetch
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- Audit logs: compliance queries
CREATE INDEX idx_audit_org_action      ON ticket_audit_logs(organization_id, action, created_at DESC);
CREATE INDEX idx_audit_resource        ON ticket_audit_logs(resource_type, resource_id);

-- ============================================================
-- TRIGGERS: auto updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON ticket_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TRIGGER: Calculate SLA due dates on ticket creation
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_sla_due_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_sla sla_policies%ROWTYPE;
BEGIN
  SELECT * INTO v_sla
  FROM sla_policies
  WHERE organization_id = NEW.organization_id
    AND priority = NEW.priority
    AND is_active = TRUE
  LIMIT 1;

  IF FOUND THEN
    NEW.sla_policy_id := v_sla.id;
    NEW.sla_first_response_due := NEW.created_at + (v_sla.first_response_hours || ' hours')::INTERVAL;
    NEW.sla_resolution_due     := NEW.created_at + (v_sla.resolution_hours    || ' hours')::INTERVAL;
  END IF;

  -- DSG/LPD: Set retention delete date
  NEW.retention_delete_at := NEW.created_at + (
    SELECT (data_retention_days || ' days')::INTERVAL
    FROM organizations WHERE id = NEW.organization_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_sla_on_insert
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION calculate_sla_due_dates();

-- Recalculate SLA if priority changes
CREATE OR REPLACE FUNCTION recalculate_sla_on_priority_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.priority != OLD.priority THEN
    PERFORM calculate_sla_due_dates();
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- TRIGGER: Audit log on ticket changes
-- ============================================================

CREATE OR REPLACE FUNCTION audit_ticket_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO ticket_audit_logs (organization_id, actor_id, action, resource_type, resource_id, old_values, new_values)
  VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    auth.uid(),
    CASE TG_OP
      WHEN 'INSERT' THEN 'ticket.created'
      WHEN 'UPDATE' THEN 'ticket.updated'
      WHEN 'DELETE' THEN 'ticket.deleted'
    END,
    'ticket',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER tickets_audit
  AFTER INSERT OR UPDATE OR DELETE ON tickets
  FOR EACH ROW EXECUTE FUNCTION audit_ticket_changes();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_can_read_own_org" ON organizations
  FOR SELECT USING (
    id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "admins_can_update_own_org" ON organizations
  FOR UPDATE USING (
    id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_same_org_profiles" ON profiles
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR id = auth.uid()
  );

CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "admins_manage_profiles" ON profiles
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager')
  );

-- Categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_categories" ON categories
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- Tickets
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Customers: only own tickets
CREATE POLICY "customers_own_tickets" ON tickets
  FOR SELECT USING (
    created_by = auth.uid()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'customer'
  );

-- Agents/Managers/Admins: all tickets in their org
CREATE POLICY "staff_org_tickets" ON tickets
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent', 'manager', 'admin')
  );

CREATE POLICY "customers_create_tickets" ON tickets
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "staff_update_tickets" ON tickets
  FOR UPDATE USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent', 'manager', 'admin')
  );

-- Ticket Comments
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

-- Internal notes: only agents/managers/admins
CREATE POLICY "internal_comments_staff_only" ON ticket_comments
  FOR SELECT USING (
    is_internal = FALSE
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent', 'manager', 'admin')
  );

CREATE POLICY "members_create_comments" ON ticket_comments
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_id
      AND (t.created_by = auth.uid()
        OR (SELECT organization_id FROM profiles WHERE id = auth.uid()) = t.organization_id)
    )
  );

-- AI Analysis: staff only (customers never see raw AI output)
ALTER TABLE ai_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_ai_analysis" ON ai_analysis
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent', 'manager', 'admin')
  );

-- Notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- Audit Logs: managers and admins can read (not customers)
ALTER TABLE ticket_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers_read_ticket_audit_logs" ON ticket_audit_logs
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager', 'admin')
  );

-- ============================================================
-- SEED: Default categories (global template)
-- ============================================================

-- Called after org creation to populate default categories
CREATE OR REPLACE FUNCTION seed_default_categories(org_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO categories (organization_id, name, slug, description, color, icon, sort_order) VALUES
    (org_id, 'Networking',  'networking', 'Connectivity, VPN, WiFi, DNS issues',    '#3b82f6', 'wifi',          1),
    (org_id, 'Hardware',    'hardware',   'Physical equipment, peripherals, devices','#f59e0b', 'cpu',           2),
    (org_id, 'Software',    'software',   'Applications, OS, licenses, updates',    '#8b5cf6', 'monitor',       3),
    (org_id, 'Security',    'security',   'Access, credentials, incidents, threats','#ef4444', 'shield-alert',  4),
    (org_id, 'Billing',     'billing',    'Invoices, subscriptions, cost questions', '#10b981', 'credit-card',   5),
    (org_id, 'Other',       'other',      'General requests and inquiries',          '#6b7280', 'circle-help',   6);
END;
$$;

-- Seed default SLA policies per org
CREATE OR REPLACE FUNCTION seed_default_sla_policies(org_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sla_policies (organization_id, name, priority, first_response_hours, resolution_hours) VALUES
    (org_id, 'Critical SLA', 'critical', 1,   4  ),  -- 1h response, 4h resolve
    (org_id, 'High SLA',     'high',     4,   24 ),  -- 4h response, 24h resolve
    (org_id, 'Medium SLA',   'medium',   8,   72 ),  -- 8h response, 3 days resolve
    (org_id, 'Low SLA',      'low',      24,  168);  -- 24h response, 7 days resolve
END;
$$;
