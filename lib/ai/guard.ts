import type { UserRole } from "@/lib/supabase/types";
import { accountState } from "@/lib/user-lifecycle";

/**
 * Who may spend AI budget.
 *
 * A session alone is not enough: this Supabase instance is shared, so a valid
 * JWT can belong to an account that has no profile here, no organization, or
 * one an administrator has frozen or deleted. Membership is read from the
 * caller's own hd_profiles row -- never from the request (AGENTS.md rule 2).
 */
type SessionClient = {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null } }>;
  };
  // Narrow on purpose, as in lib/authz.ts: works with any Supabase client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export interface AiGuardGrant {
  ok: true;
  userId: string;
  organizationId: string;
  role: UserRole;
}

export interface AiGuardDenial {
  ok: false;
  status: 401 | 403 | 429 | 503;
  /** Generic by design; safe to return to a browser (AGENTS.md rule 10). */
  error: string;
  retryAfterSeconds?: number;
}

export async function requireActiveAiMember(
  supabase: SessionClient
): Promise<AiGuardGrant | AiGuardDenial> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("hd_profiles")
    .select("id, role, organization_id, is_active, deleted_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.organization_id || accountState(profile) !== "active") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return {
    ok: true,
    userId: user.id,
    organizationId: profile.organization_id,
    role: profile.role,
  };
}

/** The HTTP shape of a refusal, with Retry-After when there is a window. */
export function denialResponse(denial: AiGuardDenial): Response {
  const headers = new Headers();
  if (denial.status === 429 && denial.retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(denial.retryAfterSeconds));
  }
  return Response.json({ error: denial.error }, { status: denial.status, headers });
}
