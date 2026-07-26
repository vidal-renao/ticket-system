import type { Json } from "@/lib/supabase/types";

export const KNOWLEDGE_LIFECYCLE_STATES = [
  "draft",
  "processing",
  "ready",
  "failed",
  "archived",
  "deleted",
] as const;
export const SANITIZATION_STATES = ["pending", "approved", "rejected", "failed"] as const;
export const EMBEDDING_STATES = ["pending", "processing", "ready", "failed", "stale"] as const;
export const EMBEDDING_JOB_STATES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "stale",
] as const;
export const ACTIVE_EMBEDDING_JOB_STATES = ["pending", "processing"] as const;
export const TERMINAL_EMBEDDING_JOB_STATES = ["completed", "failed", "stale"] as const;
export const KNOWLEDGE_SOURCE_TYPES = [
  "manual",
  "procedure",
  "faq",
  "knowledge_article",
  "approved_resolution",
] as const;

export type KnowledgeLifecycleState = (typeof KNOWLEDGE_LIFECYCLE_STATES)[number];
export type SanitizationState = (typeof SANITIZATION_STATES)[number];
export type EmbeddingState = (typeof EMBEDDING_STATES)[number];
export type EmbeddingJobState = (typeof EMBEDDING_JOB_STATES)[number];
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

export interface KnowledgeSource {
  id: string;
  organizationId: string;
  name: string;
  sourceType: KnowledgeSourceType;
  visibility: "internal";
  status: KnowledgeLifecycleState;
  createdBy: string;
  deletedAt: string | null;
}

export interface KnowledgeDocument {
  id: string;
  organizationId: string;
  sourceId: string;
  title: string;
  documentType: KnowledgeSourceType;
  status: KnowledgeLifecycleState;
  currentVersionId: string | null;
  createdBy: string;
  deletedAt: string | null;
}

export interface KnowledgeDocumentVersion {
  id: string;
  organizationId: string;
  documentId: string;
  versionNumber: number;
  contentHash: string;
  sanitizationStatus: SanitizationState;
  ingestionStatus: EmbeddingState;
  mimeType: string;
  sizeBytes: number;
  approvedForEmbeddingAt: string | null;
  approvedBy: string | null;
  auditMetadata: Json;
  supersededAt: string | null;
  deletedAt: string | null;
}

export interface KnowledgeChunk {
  id: string;
  organizationId: string;
  documentId: string;
  documentVersionId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  tokenCount: number | null;
  pageNumber: number | null;
  section: string | null;
  metadata: Json;
  embeddingModel: string | null;
  embeddingDimensions: 1536 | null;
  embeddingStatus: EmbeddingState;
  deletedAt: string | null;
}

export interface EmbeddingJob {
  id: string;
  organizationId: string;
  documentId: string;
  documentVersionId: string;
  attemptNumber: number;
  retryOfJobId: string | null;
  status: EmbeddingJobState;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMessageSanitized: string | null;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RetrievalResult {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  documentTitle: string;
  section: string | null;
  pageNumber: number | null;
  content: string;
  similarity: number;
  contentHash: string;
}

export type KnowledgeRepositoryErrorCode =
  | "INVALID_CONTEXT"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "DATA_ACCESS_FAILED";

export class KnowledgeRepositoryError extends Error {
  constructor(
    readonly code: KnowledgeRepositoryErrorCode,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "KnowledgeRepositoryError";
  }
}
