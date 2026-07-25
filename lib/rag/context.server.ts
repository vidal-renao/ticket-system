import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaffRole } from "@/lib/authz";
import { KnowledgeRepositoryError } from "@/lib/rag/domain";

class AuthenticatedTrustedOrganizationContext {
  readonly source = "authenticated-session" as const;
  readonly #trusted = true;

  constructor(
    readonly organizationId: string,
    readonly actorId: string,
    readonly actorRole: "agent" | "manager" | "admin"
  ) {
    Object.freeze(this);
  }

  assertTrusted(): true {
    return this.#trusted;
  }
}

export type TrustedOrganizationContext = AuthenticatedTrustedOrganizationContext;

export async function getTrustedOrganizationContextForCurrentUser(): Promise<{
  context: TrustedOrganizationContext;
  client: Awaited<ReturnType<typeof createClient>>;
}> {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    throw new KnowledgeRepositoryError("FORBIDDEN", "Authentication is required.");
  }

  const profile = await getCurrentProfile(client, user.id);
  if (
    !profile
    || !profile.organization_id
    || !isStaffRole(profile.role)
  ) {
    throw new KnowledgeRepositoryError("FORBIDDEN", "Authorized staff membership is required.");
  }

  return {
    context: new AuthenticatedTrustedOrganizationContext(
      profile.organization_id,
      user.id,
      profile.role
    ),
    client,
  };
}
