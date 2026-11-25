import { AI_LIMITS, type AiEndpoint } from "@/lib/ai/limits";

/**
 * Counts one AI request against the caller's and their organization's budget.
 *
 * The counting and the recording happen in one PostgreSQL function
 * (hd_consume_ai_quota, SECURITY DEFINER, service_role only) so two parallel
 * requests cannot both read "29 of 30" and both proceed.
 *
 * userId and organizationId must come from requireActiveAiMember -- the
 * function re-checks that the user belongs to that organization, so a wrong
 * pair is refused rather than billed to another tenant (AGENTS.md rule 3).
 *
 * Fails closed: if the function is missing or errors, no AI call is made
 * (AGENTS.md rule 4). The migration must be applied before this code deploys.
 */
type ServiceClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;
};

export type AiQuotaReason = "user_hour" | "user_day" | "org_day";

export type AiQuotaResult =
  | { allowed: true }
  | { allowed: false; status: 429; error: "rate_limited"; retryAfterSeconds: number; reason: AiQuotaReason }
  | { allowed: false; status: 403; error: "Forbidden" }
  | { allowed: false; status: 503; error: "assistant_unavailable" };

const UNAVAILABLE = { allowed: false, status: 503, error: "assistant_unavailable" } as const;
const LIMIT_REASONS: readonly string[] = ["user_hour", "user_day", "org_day"];

export async function consumeAiQuota(
  service: ServiceClient,
  input: { userId: string; organizationId: string; endpoint: AiEndpoint }
): Promise<AiQuotaResult> {
  let data: unknown;
  try {
    const result = await service.rpc("hd_consume_ai_quota", {
      p_user_id: input.userId,
      p_organization_id: input.organizationId,
      p_endpoint: input.endpoint,
      p_user_hourly_limit: AI_LIMITS.userPerHour,
      p_user_daily_limit: AI_LIMITS.userPerDay,
      p_org_daily_limit: AI_LIMITS.orgPerDay,
    });
    if (result.error) {
      // Code only: driver messages can name objects and arguments.
      console.error("[ai-quota] quota function failed", {
        endpoint: input.endpoint,
        code: typeof result.error.code === "string" ? result.error.code : null,
      });
      return UNAVAILABLE;
    }
    data = result.data;
  } catch {
    console.error("[ai-quota] quota function unreachable", { endpoint: input.endpoint });
    return UNAVAILABLE;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed?: unknown; retry_after_seconds?: unknown; reason?: unknown }
    | null
    | undefined;

  if (!row || typeof row.allowed !== "boolean") {
    console.error("[ai-quota] quota function returned an unexpected shape", {
      endpoint: input.endpoint,
    });
    return UNAVAILABLE;
  }

  if (row.allowed) return { allowed: true };

  if (typeof row.reason === "string" && LIMIT_REASONS.includes(row.reason)) {
    const seconds = typeof row.retry_after_seconds === "number" ? row.retry_after_seconds : 0;
    return {
      allowed: false,
      status: 429,
      error: "rate_limited",
      retryAfterSeconds: Math.max(1, Math.ceil(seconds)),
      reason: row.reason as AiQuotaReason,
    };
  }

  // not_member, or any refusal this version does not know: deny, do not bill.
  return { allowed: false, status: 403, error: "Forbidden" };
}
