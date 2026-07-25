import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeDocumentVersion,
  KnowledgeSource,
  RetrievalResult,
} from "@/lib/rag/domain";
import { KnowledgeRepositoryError } from "@/lib/rag/domain";
import type { TrustedOrganizationContext } from "@/lib/rag/context.server";
import type { KnowledgeDataAdapter } from "@/lib/rag/repository";
import type { RetrievalRequest } from "@/lib/rag/schemas";
import type { Json } from "@/lib/supabase/types";

const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ])
);

const sourceRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string(),
  source_type: z.enum(["manual", "procedure", "faq", "knowledge_article", "approved_resolution"]),
  visibility: z.literal("internal"),
  status: z.enum(["draft", "processing", "ready", "failed", "archived", "deleted"]),
  created_by: z.string().uuid(),
  deleted_at: z.string().nullable(),
});

const documentRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  source_id: z.string().uuid(),
  title: z.string(),
  document_type: z.enum(["manual", "procedure", "faq", "knowledge_article", "approved_resolution"]),
  status: z.enum(["draft", "processing", "ready", "failed", "archived", "deleted"]),
  current_version_id: z.string().uuid().nullable(),
  created_by: z.string().uuid(),
  deleted_at: z.string().nullable(),
});

const versionRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  document_id: z.string().uuid(),
  version_number: z.number().int(),
  content_hash: z.string(),
  sanitization_status: z.enum(["pending", "approved", "rejected", "failed"]),
  ingestion_status: z.enum(["pending", "processing", "ready", "failed", "stale"]),
  mime_type: z.string(),
  size_bytes: z.number(),
  approved_for_embedding_at: z.string().nullable(),
  approved_by: z.string().uuid().nullable(),
  audit_metadata: jsonSchema,
  superseded_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
});

const chunkRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  document_id: z.string().uuid(),
  document_version_id: z.string().uuid(),
  chunk_index: z.number().int(),
  content: z.string(),
  content_hash: z.string(),
  token_count: z.number().int().nullable(),
  page_number: z.number().int().nullable(),
  section: z.string().nullable(),
  metadata: jsonSchema,
  embedding_model: z.string().nullable(),
  embedding_dimensions: z.literal(1536).nullable(),
  embedding_status: z.enum(["pending", "processing", "ready", "failed", "stale"]),
  deleted_at: z.string().nullable(),
});

const retrievalRowSchema = z.object({
  chunk_id: z.string().uuid(),
  document_id: z.string().uuid(),
  document_version_id: z.string().uuid(),
  document_title: z.string(),
  section: z.string().nullable(),
  page_number: z.number().int().nullable(),
  content: z.string(),
  similarity: z.number().min(-1).max(1),
  content_hash: z.string(),
}).strict();

function dataAccessFailure(): KnowledgeRepositoryError {
  return new KnowledgeRepositoryError("DATA_ACCESS_FAILED", "Knowledge data access failed.", true);
}

export class AuthenticatedSupabaseKnowledgeAdapter implements KnowledgeDataAdapter {
  constructor(
    private readonly client: SupabaseClient,
    private readonly context: TrustedOrganizationContext
  ) {
    context.assertTrusted();
  }

  async listSources(organizationId: string): Promise<KnowledgeSource[]> {
    this.assertOrganization(organizationId);
    const { data, error } = await this.client
      .from("rag_knowledge_sources")
      .select("id, organization_id, name, source_type, visibility, status, created_by, deleted_at")
      .eq("organization_id", organizationId)
      .order("name");
    if (error) throw dataAccessFailure();
    return sourceRowSchema.array().parse(data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      sourceType: row.source_type,
      visibility: row.visibility,
      status: row.status,
      createdBy: row.created_by,
      deletedAt: row.deleted_at,
    }));
  }

  async getDocument(
    organizationId: string,
    documentId: string
  ): Promise<KnowledgeDocument | null> {
    this.assertOrganization(organizationId);
    const { data, error } = await this.client
      .from("rag_knowledge_documents")
      .select("id, organization_id, source_id, title, document_type, status, current_version_id, created_by, deleted_at")
      .eq("organization_id", organizationId)
      .eq("id", documentId)
      .maybeSingle();
    if (error) throw dataAccessFailure();
    if (!data) return null;
    const row = documentRowSchema.parse(data);
    return {
      id: row.id,
      organizationId: row.organization_id,
      sourceId: row.source_id,
      title: row.title,
      documentType: row.document_type,
      status: row.status,
      currentVersionId: row.current_version_id,
      createdBy: row.created_by,
      deletedAt: row.deleted_at,
    };
  }

  async getDocumentVersion(
    organizationId: string,
    documentId: string,
    versionId: string
  ): Promise<KnowledgeDocumentVersion | null> {
    this.assertOrganization(organizationId);
    const { data, error } = await this.client
      .from("rag_knowledge_document_versions")
      .select("id, organization_id, document_id, version_number, content_hash, sanitization_status, ingestion_status, mime_type, size_bytes, approved_for_embedding_at, approved_by, audit_metadata, superseded_at, deleted_at")
      .eq("organization_id", organizationId)
      .eq("document_id", documentId)
      .eq("id", versionId)
      .maybeSingle();
    if (error) throw dataAccessFailure();
    if (!data) return null;
    const row = versionRowSchema.parse(data);
    return {
      id: row.id,
      organizationId: row.organization_id,
      documentId: row.document_id,
      versionNumber: row.version_number,
      contentHash: row.content_hash,
      sanitizationStatus: row.sanitization_status,
      ingestionStatus: row.ingestion_status,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      approvedForEmbeddingAt: row.approved_for_embedding_at,
      approvedBy: row.approved_by,
      auditMetadata: row.audit_metadata,
      supersededAt: row.superseded_at,
      deletedAt: row.deleted_at,
    };
  }

  async listActiveChunks(
    organizationId: string,
    documentId: string,
    versionId: string
  ): Promise<KnowledgeChunk[]> {
    this.assertOrganization(organizationId);
    const { data, error } = await this.client
      .from("rag_knowledge_chunks")
      .select("id, organization_id, document_id, document_version_id, chunk_index, content, content_hash, token_count, page_number, section, metadata, embedding_model, embedding_dimensions, embedding_status, deleted_at")
      .eq("organization_id", organizationId)
      .eq("document_id", documentId)
      .eq("document_version_id", versionId)
      .eq("embedding_status", "ready")
      .is("deleted_at", null)
      .order("chunk_index");
    if (error) throw dataAccessFailure();
    return chunkRowSchema.array().parse(data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      contentHash: row.content_hash,
      tokenCount: row.token_count,
      pageNumber: row.page_number,
      section: row.section,
      metadata: row.metadata,
      embeddingModel: row.embedding_model,
      embeddingDimensions: row.embedding_dimensions,
      embeddingStatus: row.embedding_status,
      deletedAt: row.deleted_at,
    }));
  }

  async searchBackend(
    organizationId: string,
    request: RetrievalRequest
  ): Promise<RetrievalResult[]> {
    this.assertOrganization(organizationId);
    const { data, error } = await this.client.rpc(
      "search_rag_knowledge_authenticated",
      {
        query_embedding: request.embedding,
        match_count: request.matchCount,
        match_threshold: request.threshold,
      }
    );
    if (error) throw dataAccessFailure();
    return retrievalRowSchema.array().parse(data ?? []).map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      documentTitle: row.document_title,
      section: row.section,
      pageNumber: row.page_number,
      content: row.content,
      similarity: row.similarity,
      contentHash: row.content_hash,
    }));
  }

  async softDeleteSource(
    organizationId: string,
    sourceId: string,
    deletedAt: string
  ): Promise<boolean> {
    this.assertOrganization(organizationId);
    const { data, error } = await this.client
      .from("rag_knowledge_sources")
      .update({ status: "deleted", deleted_at: deletedAt })
      .eq("organization_id", organizationId)
      .eq("id", sourceId)
      .neq("status", "deleted")
      .select("id")
      .maybeSingle();
    if (error) throw dataAccessFailure();
    return data !== null;
  }

  async softDeleteDocument(
    organizationId: string,
    documentId: string,
    deletedAt: string
  ): Promise<boolean> {
    this.assertOrganization(organizationId);
    const { data, error } = await this.client
      .from("rag_knowledge_documents")
      .update({ status: "deleted", deleted_at: deletedAt })
      .eq("organization_id", organizationId)
      .eq("id", documentId)
      .neq("status", "deleted")
      .select("id")
      .maybeSingle();
    if (error) throw dataAccessFailure();
    return data !== null;
  }

  private assertOrganization(organizationId: string): void {
    if (organizationId !== this.context.organizationId) {
      throw new KnowledgeRepositoryError("FORBIDDEN", "Organization context mismatch.");
    }
  }
}
