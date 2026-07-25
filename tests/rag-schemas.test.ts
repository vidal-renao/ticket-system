import { describe, expect, it } from "vitest";
import {
  embeddingJobRetryPairSchema,
  embeddingJobSchema,
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

  it("uses completed, never ready, as embedding job success", () => {
    const completed = {
      id: "10000000-0000-4000-8000-000000000501",
      organizationId: RAG_FIXTURE_IDS.organizationAlpha,
      documentId: RAG_FIXTURE_IDS.printerManual,
      documentVersionId: RAG_FIXTURE_IDS.vpnProcedure,
      attemptNumber: 1,
      retryOfJobId: null,
      status: "completed",
      attemptCount: 1,
      lastErrorCode: null,
      lastErrorMessageSanitized: null,
      scheduledAt: "2026-07-25T12:00:00.000Z",
      startedAt: "2026-07-25T12:00:01.000Z",
      completedAt: "2026-07-25T12:00:02.000Z",
    };
    expect(embeddingJobSchema.safeParse(completed).success).toBe(true);
    expect(embeddingJobSchema.safeParse({ ...completed, status: "ready" }).success).toBe(false);
  });

  it("enforces attempt and timestamp integrity", () => {
    const job = {
      id: "10000000-0000-4000-8000-000000000501",
      organizationId: RAG_FIXTURE_IDS.organizationAlpha,
      documentId: RAG_FIXTURE_IDS.printerManual,
      documentVersionId: RAG_FIXTURE_IDS.vpnProcedure,
      attemptNumber: 1,
      retryOfJobId: null,
      status: "pending",
      attemptCount: 0,
      lastErrorCode: null,
      lastErrorMessageSanitized: null,
      scheduledAt: "2026-07-25T12:00:00.000Z",
      startedAt: null,
      completedAt: null,
    };
    expect(embeddingJobSchema.safeParse({ ...job, attemptNumber: 2 }).success).toBe(false);
    expect(embeddingJobSchema.safeParse({ ...job, status: "processing" }).success).toBe(false);
    expect(embeddingJobSchema.safeParse({ ...job, status: "failed" }).success).toBe(false);
    expect(embeddingJobSchema.safeParse({
      ...job,
      retryOfJobId: job.id,
    }).success).toBe(false);
  });

  it("keeps retries on the same version and immediate attempt chain", () => {
    const previous = {
      id: "10000000-0000-4000-8000-000000000501",
      organizationId: RAG_FIXTURE_IDS.organizationAlpha,
      documentId: RAG_FIXTURE_IDS.printerManual,
      documentVersionId: RAG_FIXTURE_IDS.vpnProcedure,
      attemptNumber: 1,
      retryOfJobId: null,
      status: "failed" as const,
      attemptCount: 1,
      lastErrorCode: "PROVIDER_TIMEOUT",
      lastErrorMessageSanitized: "Provider timeout.",
      scheduledAt: "2026-07-25T12:00:00.000Z",
      startedAt: "2026-07-25T12:00:01.000Z",
      completedAt: "2026-07-25T12:00:02.000Z",
    };
    const retry = {
      ...previous,
      id: "10000000-0000-4000-8000-000000000502",
      attemptNumber: 2,
      retryOfJobId: previous.id,
      status: "pending" as const,
      attemptCount: 0,
      lastErrorCode: null,
      lastErrorMessageSanitized: null,
      startedAt: null,
      completedAt: null,
    };
    expect(embeddingJobRetryPairSchema.safeParse({ previous, retry }).success).toBe(true);
    expect(embeddingJobRetryPairSchema.safeParse({
      previous,
      retry: { ...retry, documentVersionId: "20000000-0000-4000-8000-000000000301" },
    }).success).toBe(false);
    expect(embeddingJobRetryPairSchema.safeParse({
      previous,
      retry: { ...retry, attemptNumber: 3 },
    }).success).toBe(false);
  });
});
