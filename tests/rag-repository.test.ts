import { describe, expect, it, vi } from "vitest";
import { KnowledgeRepository, type KnowledgeDataAdapter } from "@/lib/rag/repository";
import { KnowledgeRepositoryError } from "@/lib/rag/domain";
import { getTrustedOrganizationContextForCurrentUser } from "@/lib/rag/context.server";
import { RAG_FIXTURE_IDS } from "@/tests/fixtures/rag";

const contextMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentProfile: vi.fn(),
  isStaffRole: vi.fn((role: string) => ["agent", "manager", "admin"].includes(role)),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: contextMocks.createClient,
}));
vi.mock("@/lib/authz", () => ({
  getCurrentProfile: contextMocks.getCurrentProfile,
  isStaffRole: contextMocks.isStaffRole,
}));

function adapter(): KnowledgeDataAdapter {
  return {
    listSources: vi.fn().mockResolvedValue([]),
    getDocument: vi.fn().mockResolvedValue(null),
    getDocumentVersion: vi.fn().mockResolvedValue(null),
    listActiveChunks: vi.fn().mockResolvedValue([]),
    searchAuthenticated: vi.fn().mockResolvedValue([]),
    softDeleteSource: vi.fn().mockResolvedValue(true),
    softDeleteDocument: vi.fn().mockResolvedValue(true),
  };
}

describe("KnowledgeRepository tenant boundary", () => {
  it("always injects the trusted tenant into retrieval", async () => {
    const data = adapter();
    const context = await trustedContext(
      RAG_FIXTURE_IDS.organizationAlpha,
      RAG_FIXTURE_IDS.alphaAgent,
      "agent"
    );
    const repository = new KnowledgeRepository(context, data);

    await repository.prepareVectorSearch({
      embedding: Array.from({ length: 1536 }, () => 0),
      matchCount: 3,
      threshold: 0.5,
    });

    expect(data.searchAuthenticated).toHaveBeenCalledWith(
      RAG_FIXTURE_IDS.organizationAlpha,
      expect.objectContaining({ matchCount: 3 })
    );
    expect(data.searchAuthenticated).not.toHaveBeenCalledWith(
      RAG_FIXTURE_IDS.organizationBeta,
      expect.anything()
    );
  });

  it("keeps Alpha and Beta calls isolated", async () => {
    const data = adapter();
    const alphaContext = await trustedContext(
      RAG_FIXTURE_IDS.organizationAlpha,
      RAG_FIXTURE_IDS.alphaAdmin,
      "admin"
    );
    const betaContext = await trustedContext(
      RAG_FIXTURE_IDS.organizationBeta,
      RAG_FIXTURE_IDS.betaAdmin,
      "admin"
    );
    const alpha = new KnowledgeRepository(alphaContext, data);
    const beta = new KnowledgeRepository(betaContext, data);

    await alpha.listSources();
    await beta.listSources();

    expect(data.listSources).toHaveBeenNthCalledWith(1, RAG_FIXTURE_IDS.organizationAlpha);
    expect(data.listSources).toHaveBeenNthCalledWith(2, RAG_FIXTURE_IDS.organizationBeta);
  });

  it("prevents agents from soft deleting knowledge", async () => {
    const context = await trustedContext(
      RAG_FIXTURE_IDS.organizationAlpha,
      RAG_FIXTURE_IDS.alphaAgent,
      "agent"
    );
    const repository = new KnowledgeRepository(context, adapter());

    expect(() => repository.softDeleteDocument(RAG_FIXTURE_IDS.printerManual))
      .toThrowError(KnowledgeRepositoryError);
  });
});

async function trustedContext(
  organizationId: string,
  actorId: string,
  actorRole: "agent" | "manager" | "admin"
) {
  contextMocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: actorId } },
        error: null,
      }),
    },
  });
  contextMocks.getCurrentProfile.mockResolvedValue({
    id: actorId,
    organization_id: organizationId,
    role: actorRole,
  });
  return (await getTrustedOrganizationContextForCurrentUser()).context;
}
