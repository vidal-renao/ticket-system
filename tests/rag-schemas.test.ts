import { describe, expect, it } from "vitest";
import {
  knowledgeChunkSchema,
  knowledgeDocumentVersionSchema,
  retrievalRequestSchema,
} from "@/lib/rag/schemas";
import { RAG_FIXTURE_IDS } from "@/tests/fixtures/rag";

const hash = "a".repeat(64);

describe("RAG contracts", () => {
  it("limits application retrieval to eight matches", () => {
    const embedding = Array.from({ length: 1536 }, () => 0);
    expect(retrievalRequestSchema.safeParse({ embedding, matchCount: 8, threshold: 0.5 }).success)
      .toBe(true);
    expect(retrievalRequestSchema.safeParse({ embedding, matchCount: 9, threshold: 0.5 }).success)
      .toBe(false);
    expect(retrievalRequestSchema.safeParse({ embedding, matchCount: 0, threshold: 0.5 }).success)
      .toBe(false);
    expect(retrievalRequestSchema.safeParse({ embedding, matchCount: 3, threshold: 1.1 }).success)
      .toBe(false);
    expect(retrievalRequestSchema.safeParse({ embedding: [], matchCount: 3, threshold: 0.5 }).success)
      .toBe(false);
  });

  it("rejects embedding dimensions other than 1536", () => {
    const base = {
      id: RAG_FIXTURE_IDS.printerManual,
      organizationId: RAG_FIXTURE_IDS.organizationAlpha,
      documentId: RAG_FIXTURE_IDS.printerManual,
      documentVersionId: RAG_FIXTURE_IDS.vpnProcedure,
      chunkIndex: 0,
      content: "Synthetic printer reset procedure.",
      contentHash: hash,
      tokenCount: 5,
      pageNumber: 1,
      section: "Reset",
      metadata: {},
      embeddingModel: "text-embedding-3-small",
      embeddingStatus: "ready",
      deletedAt: null,
    };
    expect(knowledgeChunkSchema.safeParse({ ...base, embeddingDimensions: 1536 }).success)
      .toBe(true);
    expect(knowledgeChunkSchema.safeParse({ ...base, embeddingDimensions: 3072 }).success)
      .toBe(false);
  });

  it("requires a complete sanitization approval", () => {
    const version = {
      id: RAG_FIXTURE_IDS.vpnProcedure,
      organizationId: RAG_FIXTURE_IDS.organizationAlpha,
      documentId: RAG_FIXTURE_IDS.printerManual,
      versionNumber: 1,
      contentHash: hash,
      sanitizationStatus: "approved",
      ingestionStatus: "pending",
      mimeType: "text/markdown",
      sizeBytes: 100,
      approvedForEmbeddingAt: null,
      approvedBy: null,
      auditMetadata: {},
      supersededAt: null,
      deletedAt: null,
    };
    expect(knowledgeDocumentVersionSchema.safeParse(version).success).toBe(false);
  });
});

