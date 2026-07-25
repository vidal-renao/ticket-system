import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/202607250001_rag_foundation_v2.sql"),
  "utf8"
);

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
});
