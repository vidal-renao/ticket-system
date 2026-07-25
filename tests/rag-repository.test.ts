import { describe, expect, it, vi } from "vitest";
import { KnowledgeRepository, type KnowledgeDataAdapter } from "@/lib/rag/repository";
import { KnowledgeRepositoryError } from "@/lib/rag/domain";
import { RAG_FIXTURE_IDS } from "@/tests/fixtures/rag";

function adapter(): KnowledgeDataAdapter {
  return {
    listSources: vi.fn().mockResolvedValue([]),
    getDocument: vi.fn().mockResolvedValue(null),
    getDocumentVersion: vi.fn().mockResolvedValue(null),
    listActiveChunks: vi.fn().mockResolvedValue([]),
    searchBackend: vi.fn().mockResolvedValue([]),
    softDeleteSource: vi.fn().mockResolvedValue(true),
    softDeleteDocument: vi.fn().mockResolvedValue(true),
  };
}

describe("KnowledgeRepository tenant boundary", () => {
  it("always injects the trusted tenant into retrieval", async () => {
    const data = adapter();
    const repository = new KnowledgeRepository({
      organizationId: RAG_FIXTURE_IDS.organizationAlpha,
      actorId: RAG_FIXTURE_IDS.alphaAgent,
      actorRole: "agent",
    }, data);

    await repository.prepareVectorSearch({
      embedding: Array.from({ length: 1536 }, () => 0),
      matchCount: 3,
      threshold: 0.5,
    });

    expect(data.searchBackend).toHaveBeenCalledWith(
      RAG_FIXTURE_IDS.organizationAlpha,
      expect.objectContaining({ matchCount: 3 })
    );
    expect(data.searchBackend).not.toHaveBeenCalledWith(
      RAG_FIXTURE_IDS.organizationBeta,
      expect.anything()
    );
  });

  it("keeps Alpha and Beta calls isolated", async () => {
    const data = adapter();
    const alpha = new KnowledgeRepository({
      organizationId: RAG_FIXTURE_IDS.organizationAlpha,
      actorId: RAG_FIXTURE_IDS.alphaAdmin,
      actorRole: "admin",
    }, data);
    const beta = new KnowledgeRepository({
      organizationId: RAG_FIXTURE_IDS.organizationBeta,
      actorId: RAG_FIXTURE_IDS.betaAdmin,
      actorRole: "admin",
    }, data);

    await alpha.listSources();
    await beta.listSources();

    expect(data.listSources).toHaveBeenNthCalledWith(1, RAG_FIXTURE_IDS.organizationAlpha);
    expect(data.listSources).toHaveBeenNthCalledWith(2, RAG_FIXTURE_IDS.organizationBeta);
  });

  it("prevents agents from soft deleting knowledge", () => {
    const repository = new KnowledgeRepository({
      organizationId: RAG_FIXTURE_IDS.organizationAlpha,
      actorId: RAG_FIXTURE_IDS.alphaAgent,
      actorRole: "agent",
    }, adapter());

    expect(() => repository.softDeleteDocument(RAG_FIXTURE_IDS.printerManual))
      .toThrowError(KnowledgeRepositoryError);
  });
});

