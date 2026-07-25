import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeDocumentVersion,
  KnowledgeSource,
  RetrievalResult,
  TrustedOrganizationContext,
} from "@/lib/rag/domain";
import { KnowledgeRepositoryError } from "@/lib/rag/domain";
import {
  retrievalRequestSchema,
  trustedOrganizationContextSchema,
  type RetrievalRequest,
} from "@/lib/rag/schemas";

export interface KnowledgeDataAdapter {
  listSources(organizationId: string): Promise<KnowledgeSource[]>;
  getDocument(
    organizationId: string,
    documentId: string
  ): Promise<KnowledgeDocument | null>;
  getDocumentVersion(
    organizationId: string,
    documentId: string,
    versionId: string
  ): Promise<KnowledgeDocumentVersion | null>;
  listActiveChunks(
    organizationId: string,
    documentId: string,
    versionId: string
  ): Promise<KnowledgeChunk[]>;
  searchBackend(
    organizationId: string,
    request: RetrievalRequest
  ): Promise<RetrievalResult[]>;
  softDeleteSource(
    organizationId: string,
    sourceId: string,
    deletedAt: string
  ): Promise<boolean>;
  softDeleteDocument(
    organizationId: string,
    documentId: string,
    deletedAt: string
  ): Promise<boolean>;
}

export class KnowledgeRepository {
  private readonly context: TrustedOrganizationContext;

  constructor(
    context: TrustedOrganizationContext,
    private readonly adapter: KnowledgeDataAdapter
  ) {
    const parsed = trustedOrganizationContextSchema.safeParse(context);
    if (!parsed.success) {
      throw new KnowledgeRepositoryError("INVALID_CONTEXT", "Trusted organization context is invalid.");
    }
    this.context = parsed.data;
  }

  listSources(): Promise<KnowledgeSource[]> {
    return this.adapter.listSources(this.context.organizationId);
  }

  getDocumentWithVersion(
    documentId: string,
    versionId: string
  ): Promise<[KnowledgeDocument, KnowledgeDocumentVersion] | null> {
    return Promise.all([
      this.adapter.getDocument(this.context.organizationId, documentId),
      this.adapter.getDocumentVersion(
        this.context.organizationId,
        documentId,
        versionId
      ),
    ]).then(([document, version]) =>
      document && version ? [document, version] : null
    );
  }

  listActiveChunks(documentId: string, versionId: string): Promise<KnowledgeChunk[]> {
    return this.adapter.listActiveChunks(
      this.context.organizationId,
      documentId,
      versionId
    );
  }

  prepareVectorSearch(input: unknown): Promise<RetrievalResult[]> {
    const parsed = retrievalRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new KnowledgeRepositoryError("INVALID_INPUT", "Retrieval input is invalid.");
    }
    return this.adapter.searchBackend(this.context.organizationId, parsed.data);
  }

  softDeleteSource(sourceId: string, deletedAt = new Date().toISOString()): Promise<boolean> {
    this.requireKnowledgeManager();
    return this.adapter.softDeleteSource(this.context.organizationId, sourceId, deletedAt);
  }

  softDeleteDocument(documentId: string, deletedAt = new Date().toISOString()): Promise<boolean> {
    this.requireKnowledgeManager();
    return this.adapter.softDeleteDocument(
      this.context.organizationId,
      documentId,
      deletedAt
    );
  }

  private requireKnowledgeManager(): void {
    if (this.context.actorRole !== "manager" && this.context.actorRole !== "admin") {
      throw new KnowledgeRepositoryError("FORBIDDEN", "Knowledge management permission is required.");
    }
  }
}

