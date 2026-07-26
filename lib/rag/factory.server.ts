import "server-only";

import { getTrustedOrganizationContextForCurrentUser } from "@/lib/rag/context.server";
import { KnowledgeRepository } from "@/lib/rag/repository";
import { AuthenticatedSupabaseKnowledgeAdapter } from "@/lib/rag/supabase-adapter.server";

export async function createKnowledgeRepositoryForCurrentUser(): Promise<KnowledgeRepository> {
  const { context, client } = await getTrustedOrganizationContextForCurrentUser();
  return new KnowledgeRepository(
    context,
    new AuthenticatedSupabaseKnowledgeAdapter(client, context)
  );
}

