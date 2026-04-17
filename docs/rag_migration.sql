-- ============================================================
-- RAG MIGRATION — Knowledge Base Vector Search
-- Run AFTER migration_differential.sql
-- Requires: Supabase project with pgvector extension enabled
--           (Dashboard → Database → Extensions → vector)
-- ============================================================

-- 1. Enable pgvector (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. knowledge_chunks table
-- Stores KB articles / resolved-ticket summaries as embeddings.
-- Embedding model: OpenAI text-embedding-3-small (1536 dims)
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  content          TEXT        NOT NULL CHECK (char_length(content) > 0),
  source           TEXT        NOT NULL DEFAULT 'manual'
                               CHECK (source IN ('manual', 'resolved_ticket', 'documentation')),
  category         TEXT,
  embedding        vector(1536),
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. RLS
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Staff in the same org can read chunks (SELECT only via RPC)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'knowledge_chunks' AND policyname = 'org_staff_read_knowledge'
  ) THEN
    CREATE POLICY "org_staff_read_knowledge" ON knowledge_chunks
      FOR SELECT
      USING (
        organization_id IN (
          SELECT organization_id FROM profiles
          WHERE id = auth.uid()
            AND role IN ('agent', 'manager', 'admin')
        )
      );
  END IF;
END $$;

-- Admins can insert / update chunks
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'knowledge_chunks' AND policyname = 'org_admin_write_knowledge'
  ) THEN
    CREATE POLICY "org_admin_write_knowledge" ON knowledge_chunks
      FOR ALL
      USING (
        organization_id IN (
          SELECT organization_id FROM profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      );
  END IF;
END $$;

-- 4. IVFFlat index for cosine similarity
--    lists = 100 is appropriate for < 1M rows; increase for larger datasets
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 5. updated_at trigger
CREATE OR REPLACE FUNCTION update_knowledge_chunks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_chunks_updated_at ON knowledge_chunks;
CREATE TRIGGER trg_knowledge_chunks_updated_at
  BEFORE UPDATE ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION update_knowledge_chunks_updated_at();

-- ============================================================
-- 6. match_knowledge_chunks RPC
-- SECURITY DEFINER bypasses RLS so the service-role background
-- job can call it without per-row auth checks.
-- ============================================================
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding  vector(1536),
  org_id           UUID,
  match_count      INT     DEFAULT 3,
  match_threshold  FLOAT   DEFAULT 0.50
)
RETURNS TABLE (
  id          UUID,
  title       TEXT,
  content     TEXT,
  category    TEXT,
  similarity  FLOAT
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
    AND kc.is_active = TRUE
    AND kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) >= match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute to authenticated role so the anon/service client can call it
GRANT EXECUTE ON FUNCTION match_knowledge_chunks(vector, UUID, INT, FLOAT)
  TO authenticated, service_role;

-- ============================================================
-- 7. Seed example knowledge chunks (optional — remove in prod)
-- Requires the 'vidal-lab' organization to exist.
-- Leave embeddings NULL; the app will back-fill them on first use.
-- ============================================================
/*
INSERT INTO knowledge_chunks (organization_id, title, content, source, category)
SELECT
  o.id,
  'VPN connection fails after Windows update',
  'After a Windows cumulative update, the Cisco AnyConnect client may fail with error 429. Fix: reinstall AnyConnect 4.10.x, flush DNS (ipconfig /flushdns), restart the VPN service. If issue persists, check if the Windows Firewall blocked UDP 500/4500.',
  'documentation',
  'Networking'
FROM organizations o WHERE o.slug = 'vidal-lab'
ON CONFLICT DO NOTHING;
*/
