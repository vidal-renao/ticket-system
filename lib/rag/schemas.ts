import { z } from "zod";
import {
  EMBEDDING_STATES,
  KNOWLEDGE_LIFECYCLE_STATES,
  KNOWLEDGE_SOURCE_TYPES,
  SANITIZATION_STATES,
} from "@/lib/rag/domain";

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const knowledgeSourceSchema = z.object({
  id: uuid,
  organizationId: uuid,
  name: z.string().trim().min(1).max(200),
  sourceType: z.enum(KNOWLEDGE_SOURCE_TYPES),
  visibility: z.literal("internal"),
  status: z.enum(KNOWLEDGE_LIFECYCLE_STATES),
  createdBy: uuid,
  deletedAt: z.string().datetime().nullable(),
}).strict();

export const knowledgeDocumentSchema = z.object({
  id: uuid,
  organizationId: uuid,
  sourceId: uuid,
  title: z.string().trim().min(1).max(300),
  documentType: z.enum(KNOWLEDGE_SOURCE_TYPES),
  status: z.enum(KNOWLEDGE_LIFECYCLE_STATES),
  currentVersionId: uuid.nullable(),
  createdBy: uuid,
  deletedAt: z.string().datetime().nullable(),
}).strict();

export const knowledgeDocumentVersionSchema = z.object({
  id: uuid,
  organizationId: uuid,
  documentId: uuid,
  versionNumber: z.number().int().positive(),
  contentHash: sha256,
  sanitizationStatus: z.enum(SANITIZATION_STATES),
  ingestionStatus: z.enum(EMBEDDING_STATES),
  mimeType: z.enum(["text/plain", "text/markdown", "text/html", "application/pdf"]),
  sizeBytes: z.number().int().min(1).max(52_428_800),
  approvedForEmbeddingAt: z.string().datetime().nullable(),
  approvedBy: uuid.nullable(),
  auditMetadata: z.record(z.string(), z.unknown()),
  supersededAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
}).strict().superRefine((value, context) => {
  const approvalComplete = value.approvedForEmbeddingAt !== null && value.approvedBy !== null;
  if ((value.sanitizationStatus === "approved") !== approvalComplete) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Sanitization approval requires timestamp and approver.",
    });
  }
});

export const knowledgeChunkSchema = z.object({
  id: uuid,
  organizationId: uuid,
  documentId: uuid,
  documentVersionId: uuid,
  chunkIndex: z.number().int().nonnegative(),
  content: z.string().trim().min(1).max(16_000),
  contentHash: sha256,
  tokenCount: z.number().int().min(1).max(8192).nullable(),
  pageNumber: z.number().int().positive().nullable(),
  section: z.string().max(500).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  embeddingModel: z.string().nullable(),
  embeddingDimensions: z.literal(1536).nullable(),
  embeddingStatus: z.enum(EMBEDDING_STATES),
  deletedAt: z.string().datetime().nullable(),
}).strict().superRefine((value, context) => {
  if (
    value.embeddingStatus === "ready"
    && (value.embeddingModel !== "text-embedding-3-small"
      || value.embeddingDimensions !== 1536
      || value.deletedAt !== null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ready chunks require the approved embedding profile and active content.",
    });
  }
});

export const retrievalRequestSchema = z.object({
  embedding: z.array(z.number().finite()).length(1536),
  matchCount: z.number().int().min(1).max(8).default(3),
  threshold: z.number().min(0).max(1).default(0.5),
}).strict();

export type RetrievalRequest = z.infer<typeof retrievalRequestSchema>;
