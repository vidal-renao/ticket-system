import { beforeEach, describe, expect, it, vi } from "vitest";
import { createKnowledgeRepositoryForCurrentUser } from "@/lib/rag/factory.server";
import { KnowledgeRepositoryError } from "@/lib/rag/domain";
import { RAG_FIXTURE_IDS } from "@/tests/fixtures/rag";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentProfile: vi.fn(),
  isStaffRole: vi.fn((role: string) => ["agent", "manager", "admin"].includes(role)),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/authz", () => ({
  getCurrentProfile: mocks.getCurrentProfile,
  isStaffRole: mocks.isStaffRole,
}));

describe("server-only Supabase knowledge adapter", () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: RAG_FIXTURE_IDS.alphaAgent } },
      error: null,
    });
    mocks.getCurrentProfile.mockResolvedValue({
      id: RAG_FIXTURE_IDS.alphaAgent,
      organization_id: RAG_FIXTURE_IDS.organizationAlpha,
      role: "agent",
    });
    mocks.rpc.mockResolvedValue({
      data: [{
        chunk_id: RAG_FIXTURE_IDS.printerManual,
        document_id: RAG_FIXTURE_IDS.printerManual,
        document_version_id: RAG_FIXTURE_IDS.vpnProcedure,
        document_title: "Synthetic printer manual",
        section: "Reset",
        page_number: 1,
        content: "Synthetic reset steps.",
        similarity: 0.9,
        content_hash: "a".repeat(64),
      }],
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
    });
  });

  it("derives context from the session and selects the authenticated RPC", async () => {
    const repository = await createKnowledgeRepositoryForCurrentUser();
    const result = await repository.prepareVectorSearch({
      embedding: Array.from({ length: 1536 }, () => 0.001),
      matchCount: 3,
      threshold: 0.5,
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "search_rag_knowledge_authenticated",
      expect.objectContaining({ match_count: 3, match_threshold: 0.5 })
    );
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "search_rag_knowledge_backend",
      expect.anything()
    );
    expect(result[0]).not.toHaveProperty("embedding");
  });

  it("rejects an absent profile before creating a repository", async () => {
    mocks.getCurrentProfile.mockResolvedValue(null);
    await expect(createKnowledgeRepositoryForCurrentUser())
      .rejects.toBeInstanceOf(KnowledgeRepositoryError);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps Supabase failures to a content-free typed error", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "database details that must not escape" },
    });
    const repository = await createKnowledgeRepositoryForCurrentUser();

    await expect(repository.prepareVectorSearch({
      embedding: Array.from({ length: 1536 }, () => 0.001),
      matchCount: 3,
      threshold: 0.5,
    })).rejects.toMatchObject({
      code: "DATA_ACCESS_FAILED",
      message: "Knowledge data access failed.",
    });
  });
});

