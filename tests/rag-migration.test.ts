import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/202607250001_rag_foundation_v2.sql"),
  "utf8"
);
const grantsMigration = readFileSync(
  resolve("supabase/migrations/202607250002_rag_retrieval_grants.sql"),
  "utf8"
);
const harnessRunner = readFileSync(resolve("scripts/test-rag-foundation.ps1"), "utf8");

describe("Phase 4A migration contract", () => {
  it("declares the versioned model, vector dimension and tenant-safe keys", () => {
    for (const table of [
      "rag_knowledge_sources",
      "rag_knowledge_documents",
      "rag_knowledge_document_versions",
      "rag_knowledge_chunks",
      "rag_embedding_jobs",
    ]) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).toContain("vector(1536)");
    expect(migration).toContain("rag_chunks_version_org_document_fk");
    expect(migration).toContain("rag_documents_current_version_fk");
  });

  it("enables and forces RLS with explicit grants", () => {
    expect(migration.match(/ENABLE ROW LEVEL SECURITY/g)?.length).toBe(5);
    expect(migration.match(/FORCE ROW LEVEL SECURITY/g)?.length).toBe(5);
    expect(migration).toContain("REVOKE ALL ON public.rag_knowledge_chunks FROM PUBLIC, anon");
    expect(migration).toContain("TO service_role");
  });

  it("keeps backend retrieval server-only and tenant-filtered before ordering", () => {
    const backend = migration.slice(migration.indexOf("search_rag_knowledge_backend"));
    expect(backend).toContain("c.organization_id = trusted_organization_id");
    expect(backend.indexOf("c.organization_id = trusted_organization_id"))
      .toBeLessThan(backend.indexOf("ORDER BY c.embedding"));
    expect(backend).toContain("FROM PUBLIC, anon, authenticated");
    const outputContract = backend.slice(
      backend.indexOf("RETURNS TABLE"),
      backend.indexOf("LANGUAGE plpgsql")
    );
    expect(outputContract).not.toMatch(/\bembedding\b/i);
  });

  it("uses deterministic exact cosine ordering and validates limits", () => {
    expect(migration).not.toMatch(/USING\s+(hnsw|ivfflat)/i);
    expect(migration).toContain("ORDER BY c.embedding <=> query_embedding, c.id");
    expect(migration).toContain("match_count < 1 OR match_count > 20");
    expect(migration).toContain("match_threshold < 0 OR match_threshold > 1");
  });

  it("does not modify the legacy table or RPC", () => {
    expect(migration).not.toMatch(/ALTER TABLE public\.knowledge_chunks/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.match_knowledge_chunks/);
  });

  it("fails fast on partial v2 objects and keeps verification out of migrations", () => {
    expect(migration).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.rag_/);
    expect(migration).toContain("RAG_PREFLIGHT_UNEXPECTED_V2_OBJECT");
    expect(migration).toContain("RAG_PREFLIGHT_UNSUPPORTED_VECTOR_SCHEMA");
    expect(harnessRunner).toContain("202607250001_rag_foundation_v2.sql");
    expect(harnessRunner).toContain("202607250002_rag_retrieval_grants.sql");
    expect(() =>
      readFileSync(
        resolve("supabase/migrations/202607250003_rag_foundation_verification.sql"),
        "utf8"
      )
    ).toThrow();
  });

  it("positively identifies disposable harness targets", () => {
    expect(harnessRunner).toContain('[ValidateSet("Local", "SupabasePreview")]');
    expect(harnessRunner).toContain('"_rag_preview_test$"');
    expect(harnessRunner).toContain('"focgfmhgfmhmcbywwsej"');
    expect(harnessRunner).toContain("supabase branches get");
    expect(harnessRunner).toContain("--project-ref $productionProjectRef --output json");
    expect(harnessRunner).toContain("parent_project_ref");
    expect(harnessRunner).toContain("preview_project_status");
    expect(harnessRunner).toContain('"ACTIVE_HEALTHY"');
    expect(harnessRunner).toContain('"MIGRATIONS_PASSED", "FUNCTIONS_DEPLOYED"');
    expect(harnessRunner).toContain("connection identity does not match branch metadata");
    expect(harnessRunner).toContain("127.0.0.1");
  });

  it("orchestrates two database sessions and asserts lock outcomes", () => {
    expect(harnessRunner).toContain("Start-Process");
    expect(harnessRunner).toContain("LOCK_ACQUIRED");
    expect(harnessRunner).toContain("--set=VERBOSITY=verbose");
    expect(harnessRunner).toContain("\\b(40P01|55P03|57014)\\b");
    expect(harnessRunner).toContain("foreach ($iteration in 1..3)");
    expect(harnessRunner).toContain("rag_sanitization_concurrency_assert.sql");
    expect(harnessRunner).toContain("rag_sanitization_concurrency_cleanup.sql");
  });

  it("protects ready content and atomically invalidates revoked approval", () => {
    expect(migration).toContain("RAG_READY_CHUNK_IS_IMMUTABLE");
    expect(migration).toContain("RAG_READY_CHUNK_INVALID_TRANSITION");
    expect(migration).toContain("RAG_CONTENT_AND_HASH_MUST_CHANGE_TOGETHER");
    expect(migration).not.toContain("FOR SHARE");
    expect(migration).toContain("rag_invalidate_chunks_on_version_change");
    expect(migration).toContain("embedding_status = 'stale'");
    expect(migration).toContain("NEW.embedding IS NOT NULL");
  });

  it("revokes trigger helper execution and preserves legacy service access", () => {
    for (const functionName of [
      "rag_validate_chunk_embedding",
      "rag_invalidate_chunks_on_version_change",
      "rag_mark_superseded_chunks_stale",
      "rag_enforce_state_transition",
      "rag_enforce_version_transition",
      "rag_validate_embedding_job_retry",
    ]) {
      expect(grantsMigration).toContain(`public.${functionName}()`);
    }
    expect(grantsMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(grantsMigration).toContain("TO service_role");
  });

  it("retains job history while allowing only one active job", () => {
    expect(migration).toContain("attempt_number integer");
    expect(migration).toContain("retry_of_job_id uuid");
    expect(migration).toContain("rag_jobs_one_active_version_idx");
    expect(migration).toContain("WHERE status IN ('pending', 'processing')");
    expect(migration).toContain("status IN ('pending', 'processing', 'completed', 'failed', 'stale')");
    expect(migration).toContain("RAG_RETRY_REQUIRES_PREVIOUS_TERMINAL_ATTEMPT");
  });

  it("restricts direct agent reads to retrievable rows", () => {
    expect(migration).toContain("CREATE POLICY rag_chunks_agent_read");
    expect(migration).toContain("public.current_profile_role() = 'agent'");
    expect(migration).toContain("document.current_version_id = version.id");
    expect(migration).toContain("version.sanitization_status = 'approved'");
    expect(migration).toContain("version.ingestion_status = 'ready'");
    expect(migration).toContain("embedding_status = 'ready'");
    expect(migration).toContain("CREATE POLICY rag_chunks_lead_read");
    expect(migration).not.toContain("rag_chunks_staff_read");
  });

  it("uses the same active-source predicate in both retrieval RPCs", () => {
    for (const functionName of [
      "search_rag_knowledge_authenticated",
      "search_rag_knowledge_backend",
    ]) {
      const start = migration.indexOf(`FUNCTION public.${functionName}`);
      const end = migration.indexOf("$$;", start);
      const body = migration.slice(start, end);
      expect(body).toContain("JOIN public.rag_knowledge_sources s");
      expect(body).toContain("s.status = 'ready'");
      expect(body).toContain("s.deleted_at IS NULL");
    }
  });
});
