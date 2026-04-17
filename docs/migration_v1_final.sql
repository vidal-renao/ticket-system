-- ============================================================
-- MIGRATION V1 FINAL — AI Helpdesk Ticket System
-- Compliance: Swiss DSG/nDSG · Author: Vidal Reñao · VIDAL ECOSYSTEM
-- Idempotent: safe to run multiple times on any clean Supabase project
-- Execution order: Run this single file in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";          -- pgvector: enable in Dashboard → Database → Extensions first

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN CREATE TYPE ticket_status AS ENUM (
  'open', 'in_progress', 'pending_customer', 'pending_third_party', 'resolved', 'closed'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE ticket_priority AS ENUM (
  'low', 'medium', 'high', 'critical'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE user_role AS ENUM (
  'customer', 'agent', 'manager', 'admin'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE ticket_source AS ENUM (
  'portal', 'email', 'api', 'phone'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE sentiment_type AS ENUM (
  'calm', 'neutral', 'frustrated', 'urgent', 'angry'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE org_plan AS ENUM (
  'starter', 'pro', 'enterprise'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 1. ORGANIZATIONS (Multi-tenant root)
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  slug                  TEXT        UNIQUE NOT NULL,
  plan                  org_plan    DEFAULT 'starter',
  logo_url              TEXT,
  primary_color         TEXT        DEFAULT '#6366f1',
  support_email         TEXT,
  settings              JSONB       DEFAULT '{}',        -- Feature flags: pii_scrubbing_enabled, etc.
  -- DSG/LPD compliance
  data_retention_days   INTEGER     DEFAULT 365,
  dpa_signed_at         TIMESTAMPTZ,
  dpa_signed_by         TEXT,
  data_controller_name  TEXT,
  data_controller_email TEXT,
  is_active             BOOLEAN     DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. PROFILES (extends auth.users — all app-specific fields)
-- NOTE: role stored as TEXT + CHECK to avoid ALTER TYPE conflicts
--       on partial-run states. TypeScript enforces UserRole union.
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id                       UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id          UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  full_name                TEXT,
  avatar_url               TEXT,
  role                     TEXT        NOT NULL DEFAULT 'customer'
                                       CHECK (role IN ('customer', 'agent', 'manager', 'admin')),
  department               TEXT,
  phone                    TEXT,
  locale                   TEXT        DEFAULT 'de',         -- CH: de, fr, it, en
  timezone                 TEXT        DEFAULT 'Europe/Zurich',
  is_active                BOOLEAN     DEFAULT TRUE,
  -- DSG/LPD: explicit consent tracking
  data_processing_consent  BOOLEAN     DEFAULT FALSE,
  consent_given_at         TIMESTAMPTZ,
  consent_ip               INET,
  marketing_consent        BOOLEAN     DEFAULT FALSE,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  slug            TEXT        NOT NULL,
  description     TEXT,
  color           TEXT        DEFAULT '#6366f1',
  icon            TEXT        DEFAULT 'ticket',
  sort_order      INTEGER     DEFAULT 0,
  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, slug)
);

-- ============================================================
-- 4. SLA POLICIES
-- ============================================================
CREATE TABLE IF NOT EXISTS sla_policies (
  id                   UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID            REFERENCES organizations(id) ON DELETE CASCADE,
  name                 TEXT            NOT NULL,
  priority             ticket_priority NOT NULL,
  first_response_hours INTEGER         NOT NULL,
  resolution_hours     INTEGER         NOT NULL,
  business_hours_only  BOOLEAN         DEFAULT TRUE,
  is_active            BOOLEAN         DEFAULT TRUE,
  created_at           TIMESTAMPTZ     DEFAULT NOW(),
  UNIQUE (organization_id, priority)
);

-- ============================================================
-- 5. TICKETS (core entity)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1000 INCREMENT 1;

CREATE TABLE IF NOT EXISTS tickets (
  id                     UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number          INTEGER         DEFAULT nextval('ticket_number_seq') UNIQUE,
  organization_id        UUID            NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id            UUID            REFERENCES categories(id) ON DELETE SET NULL,
  created_by             UUID            NOT NULL REFERENCES profiles(id),
  assigned_to            UUID            REFERENCES profiles(id),
  -- Content
  title                  TEXT            NOT NULL,
  description            TEXT            NOT NULL,
  detected_language      TEXT,
  -- Status & Priority
  status                 ticket_status   NOT NULL DEFAULT 'open',
  priority               ticket_priority NOT NULL DEFAULT 'medium',
  source                 ticket_source   DEFAULT 'portal',
  tags                   TEXT[]          DEFAULT '{}',
  -- SLA tracking
  sla_policy_id          UUID            REFERENCES sla_policies(id),
  sla_first_response_due TIMESTAMPTZ,
  sla_resolution_due     TIMESTAMPTZ,
  first_response_at      TIMESTAMPTZ,
  sla_first_response_met BOOLEAN,
  sla_resolution_met     BOOLEAN,
  sla_breached           BOOLEAN         DEFAULT FALSE,
  -- Lifecycle
  resolved_at            TIMESTAMPTZ,
  closed_at              TIMESTAMPTZ,
  -- DSG/LPD
  contains_pii           BOOLEAN         DEFAULT FALSE,
  anonymized_at          TIMESTAMPTZ,
  retention_delete_at    TIMESTAMPTZ,
  -- Extensible
  metadata               JSONB           DEFAULT '{}',
  created_at             TIMESTAMPTZ     DEFAULT NOW(),
  updated_at             TIMESTAMPTZ     DEFAULT NOW()
);

-- Human-readable ref: TK-1042
CREATE OR REPLACE FUNCTION ticket_ref(t tickets) RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
BEGIN RETURN 'TK-' || LPAD(t.ticket_number::TEXT, 4, '0'); END;
$$;

-- ============================================================
-- 6. TICKET COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_comments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id       UUID        NOT NULL REFERENCES profiles(id),
  content         TEXT        NOT NULL,
  is_internal     BOOLEAN     DEFAULT FALSE,      -- Hidden from customers
  is_ai_generated BOOLEAN     DEFAULT FALSE,
  edited_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. TICKET ATTACHMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by  UUID        NOT NULL REFERENCES profiles(id),
  file_name    TEXT        NOT NULL,
  storage_path TEXT        NOT NULL,
  file_url     TEXT        NOT NULL,
  file_size    INTEGER,
  mime_type    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. AI ANALYSIS (INSERT-only audit trail — never UPDATE)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_analysis (
  id                         UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                  UUID            NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  -- AI classification
  suggested_category         TEXT,
  suggested_priority         ticket_priority,
  confidence_score           NUMERIC(5,2),
  -- Content analysis
  summary                    TEXT,
  sentiment                  sentiment_type,
  keywords                   TEXT[]          DEFAULT '{}',
  detected_language          TEXT,
  contains_pii_detected      BOOLEAN         DEFAULT FALSE,
  -- Agent assistance
  smart_response             TEXT,
  estimated_resolution_hours INTEGER,
  reasoning                  TEXT,
  -- Model telemetry (cost tracking + audit)
  model_used                 TEXT            DEFAULT 'claude-sonnet-4-6',
  input_tokens               INTEGER,
  output_tokens              INTEGER,
  processing_time_ms         INTEGER,
  raw_response               JSONB,
  -- Agent feedback (future fine-tuning)
  category_accepted          BOOLEAN,
  priority_accepted          BOOLEAN,
  agent_feedback             TEXT,
  created_at                 TIMESTAMPTZ     DEFAULT NOW(),
  UNIQUE (ticket_id)
);

-- ============================================================
-- 9. AUDIT LOGS (DSG/LPD — immutable INSERT-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role      TEXT,                              -- TEXT (not enum) for log durability
  action          TEXT        NOT NULL,              -- 'ticket.created', 'data.exported', etc.
  resource_type   TEXT        NOT NULL,
  resource_id     UUID,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Immutability — DSG Art. 10 compliance
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
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticket_id  UUID        REFERENCES tickets(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  message    TEXT,
  action_url TEXT,
  is_read    BOOLEAN     DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 11. KNOWLEDGE CHUNKS (RAG — pgvector 1536-dim)
-- OpenAI text-embedding-3-small model
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  content         TEXT        NOT NULL CHECK (char_length(content) > 0),
  source          TEXT        NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('manual', 'resolved_ticket', 'documentation')),
  category        TEXT,
  embedding       vector(1536),
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tickets_org_status    ON tickets(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_org_priority  ON tickets(organization_id, priority);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned      ON tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_created_by    ON tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_breached  ON tickets(sla_breached) WHERE sla_breached = TRUE;
CREATE INDEX IF NOT EXISTS idx_tickets_created_at    ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_ticket       ON ticket_comments(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_ticket             ON ai_analysis(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_audit_org_action      ON audit_logs(organization_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource        ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_org_active  ON knowledge_chunks(organization_id) WHERE is_active = TRUE;

-- IVFFlat cosine-similarity index — appropriate for < 1M rows
-- Requires at least 100 rows inserted before it can be built;
-- Supabase will skip if empty (run REINDEX later after seeding).
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
  ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- Auto-create profile on auth.users INSERT (signup)
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

-- SLA due-date calculation on ticket INSERT
CREATE OR REPLACE FUNCTION calculate_sla_due_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_sla sla_policies%ROWTYPE;
BEGIN
  SELECT * INTO v_sla
  FROM sla_policies
  WHERE organization_id = NEW.organization_id
    AND priority        = NEW.priority
    AND is_active       = TRUE
  LIMIT 1;

  IF FOUND THEN
    NEW.sla_policy_id          := v_sla.id;
    NEW.sla_first_response_due := NEW.created_at + (v_sla.first_response_hours || ' hours')::INTERVAL;
    NEW.sla_resolution_due     := NEW.created_at + (v_sla.resolution_hours     || ' hours')::INTERVAL;
  END IF;

  -- DSG/LPD: retention delete date
  NEW.retention_delete_at := NEW.created_at + (
    SELECT (data_retention_days || ' days')::INTERVAL
    FROM organizations WHERE id = NEW.organization_id
  );
  RETURN NEW;
END;
$$;

-- Immutable audit log on ticket changes
CREATE OR REPLACE FUNCTION audit_ticket_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_logs (
    organization_id, actor_id, actor_role,
    action, resource_type, resource_id,
    old_values, new_values
  )
  VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    auth.uid(),
    (SELECT role FROM profiles WHERE id = auth.uid()),
    CASE TG_OP
      WHEN 'INSERT' THEN 'ticket.created'
      WHEN 'UPDATE' THEN 'ticket.updated'
      ELSE                'ticket.deleted'
    END,
    'ticket',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- knowledge_chunks updated_at
CREATE OR REPLACE FUNCTION update_knowledge_chunks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================
DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER tickets_updated_at       BEFORE UPDATE ON tickets         FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER profiles_updated_at      BEFORE UPDATE ON profiles        FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON organizations    FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER comments_updated_at      BEFORE UPDATE ON ticket_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER tickets_sla_on_insert
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION calculate_sla_due_dates();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER tickets_audit
    AFTER INSERT OR UPDATE OR DELETE ON tickets
    FOR EACH ROW EXECUTE FUNCTION audit_ticket_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_knowledge_chunks_updated_at ON knowledge_chunks;
CREATE TRIGGER trg_knowledge_chunks_updated_at
  BEFORE UPDATE ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION update_knowledge_chunks_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_policies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- ── Organizations ────────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "org_members_read_own_org" ON organizations FOR SELECT
  USING (id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "admins_update_own_org" ON organizations FOR UPDATE
  USING (id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Profiles ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

DO $$ BEGIN CREATE POLICY "users_read_same_org_profiles" ON profiles FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR id = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "users_update_own_profile" ON profiles FOR UPDATE
  USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "admins_manage_profiles" ON profiles FOR ALL
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Categories ───────────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "org_members_read_categories" ON categories FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "admins_write_categories" ON categories FOR ALL
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'manager')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── SLA Policies ─────────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "org_members_read_sla" ON sla_policies FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tickets ──────────────────────────────────────────────────
-- Customers: only their own tickets
DO $$ BEGIN CREATE POLICY "customers_own_tickets" ON tickets FOR SELECT
  USING (
    created_by = auth.uid()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'customer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Staff: all org tickets
DO $$ BEGIN CREATE POLICY "staff_org_tickets" ON tickets FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent', 'manager', 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "customers_create_tickets" ON tickets FOR INSERT
  WITH CHECK (
    created_by      = auth.uid()
    AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "staff_update_tickets" ON tickets FOR UPDATE
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent', 'manager', 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Ticket Comments ──────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "internal_comments_staff_only" ON ticket_comments FOR SELECT
  USING (
    is_internal = FALSE
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent', 'manager', 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "members_create_comments" ON ticket_comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tickets t WHERE t.id = ticket_id
      AND (t.created_by = auth.uid()
        OR (SELECT organization_id FROM profiles WHERE id = auth.uid()) = t.organization_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Ticket Attachments ───────────────────────────────────────
DO $$ BEGIN CREATE POLICY "members_read_attachments" ON ticket_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tickets t WHERE t.id = ticket_id
      AND (t.created_by = auth.uid()
        OR (SELECT organization_id FROM profiles WHERE id = auth.uid()) = t.organization_id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── AI Analysis (staff-only — customers never see raw AI output) ──
DO $$ BEGIN CREATE POLICY "staff_read_ai_analysis" ON ai_analysis FOR SELECT
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('agent', 'manager', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service role background job writes AI analysis (bypasses RLS by design)
DO $$ BEGIN CREATE POLICY "service_insert_ai_analysis" ON ai_analysis FOR INSERT
  WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Audit Logs ───────────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "managers_read_audit_logs" ON audit_logs FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager', 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Notifications ────────────────────────────────────────────
DO $$ BEGIN CREATE POLICY "users_own_notifications" ON notifications FOR ALL
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Knowledge Chunks ─────────────────────────────────────────
-- Staff reads (via SELECT; RAG RPC uses SECURITY DEFINER — bypasses this)
DO $$ BEGIN CREATE POLICY "org_staff_read_knowledge" ON knowledge_chunks FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('agent', 'manager', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admins manage KB articles
DO $$ BEGIN CREATE POLICY "org_admin_write_knowledge" ON knowledge_chunks FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- RAG RPC: match_knowledge_chunks
-- SECURITY DEFINER — bypasses RLS for service-role background jobs
-- Parameters match lib/ai/rag.ts exactly (org_id, not p_organization_id)
-- ============================================================
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding  vector(1536),
  org_id           UUID,
  match_count      INT   DEFAULT 3,
  match_threshold  FLOAT DEFAULT 0.50
)
RETURNS TABLE (
  id         UUID,
  title      TEXT,
  content    TEXT,
  category   TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.title,
    kc.content,
    kc.category,
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity
  FROM knowledge_chunks kc
  WHERE kc.organization_id = org_id
    AND kc.is_active        = TRUE
    AND kc.embedding        IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) >= match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_knowledge_chunks(vector, UUID, INT, FLOAT)
  TO authenticated, service_role;

-- ============================================================
-- SEED FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION seed_default_categories(org_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO categories (organization_id, name, slug, description, color, icon, sort_order) VALUES
    (org_id, 'Networking', 'networking', 'Connectivity, VPN, WiFi, DNS issues',      '#3b82f6', 'wifi',         1),
    (org_id, 'Hardware',   'hardware',   'Physical equipment, peripherals, devices',  '#f59e0b', 'cpu',          2),
    (org_id, 'Software',   'software',   'Applications, OS, licenses, updates',      '#8b5cf6', 'monitor',      3),
    (org_id, 'Security',   'security',   'Access, credentials, incidents, threats',  '#ef4444', 'shield-alert', 4),
    (org_id, 'Billing',    'billing',    'Invoices, subscriptions, cost questions',   '#10b981', 'credit-card',  5),
    (org_id, 'Other',      'other',      'General requests and inquiries',            '#6b7280', 'circle-help',  6)
  ON CONFLICT (organization_id, slug) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION seed_default_sla_policies(org_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sla_policies (organization_id, name, priority, first_response_hours, resolution_hours) VALUES
    (org_id, 'Critical SLA', 'critical', 1,  4  ),   -- 1h response, 4h resolve
    (org_id, 'High SLA',     'high',     4,  24 ),   -- 4h response, 24h resolve
    (org_id, 'Medium SLA',   'medium',   8,  72 ),   -- 8h response, 3d resolve
    (org_id, 'Low SLA',      'low',      24, 168)    -- 24h response, 7d resolve
  ON CONFLICT (organization_id, priority) DO NOTHING;
END;
$$;

-- ============================================================
-- SEED: Vidal Lab (enterprise) + self-repair profile assignment
-- Detects auth user by email — no hardcoded UUIDs.
-- Safe to re-run: all operations are idempotent.
-- ============================================================
DO $$
DECLARE
  v_org_id  UUID;
  v_user_id UUID;
BEGIN
  -- 1. Create Vidal Lab org (idempotent)
  INSERT INTO organizations (
    name, slug, plan,
    support_email,
    data_controller_name,
    data_controller_email,
    settings
  )
  VALUES (
    'Vidal Lab',
    'vidal-lab',
    'enterprise',
    'support@vidallab.ch',
    'Vidal Reñao',
    'htcpacoxo31@gmail.com',
    '{"pii_scrubbing_enabled": true}'::jsonb
  )
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_org_id FROM organizations WHERE slug = 'vidal-lab';

  -- 2. Seed default categories + SLA
  PERFORM seed_default_categories(v_org_id);
  PERFORM seed_default_sla_policies(v_org_id);

  -- 3. Self-repair: locate Vidal's auth user by email
  --    (works in SQL Editor which runs as service_role — has access to auth.users)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'htcpacoxo31@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE '[SEED] User htcpacoxo31@gmail.com not found in auth.users. Sign up first, then re-run this block.';
    RETURN;
  END IF;

  -- 4. Upsert profile — ensures profile exists even if trigger misfired
  INSERT INTO profiles (id, organization_id, full_name, role, locale, is_active)
  VALUES (v_user_id, v_org_id, 'Vidal Reñao', 'admin', 'de', TRUE)
  ON CONFLICT (id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        full_name       = COALESCE(profiles.full_name, EXCLUDED.full_name),
        role            = 'admin',
        locale          = COALESCE(profiles.locale, 'de'),
        is_active       = TRUE;

  RAISE NOTICE '[SEED] Profile % linked to Vidal Lab (%) as admin.', v_user_id, v_org_id;
END $$;
