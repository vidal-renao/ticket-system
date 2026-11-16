import { describe, expect, it, vi } from "vitest";
import { consumeAiQuota } from "../../lib/ai/quota";
import { AI_LIMITS } from "../../lib/ai/limits";

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const ORG_ID = "00000000-0000-4000-8000-0000000000b1";
const input = { userId: USER_ID, organizationId: ORG_ID, endpoint: "translate" as const };

function service(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc }, rpc };
}

describe("consumeAiQuota", () => {
  it("passes the server-derived user, organization and configured limits to the function", async () => {
    const { client, rpc } = service({
      data: [{ allowed: true, retry_after_seconds: 0, reason: "ok" }],
      error: null,
    });
    expect(await consumeAiQuota(client, input)).toEqual({ allowed: true });
    expect(rpc).toHaveBeenCalledWith("hd_consume_ai_quota", {
      p_user_id: USER_ID,
      p_organization_id: ORG_ID,
      p_endpoint: "translate",
      p_user_hourly_limit: AI_LIMITS.userPerHour,
      p_user_daily_limit: AI_LIMITS.userPerDay,
      p_org_daily_limit: AI_LIMITS.orgPerDay,
    });
  });

  it("uses the approved defaults (30/hour, 200/day per user, 1000/day per organization)", () => {
    expect(AI_LIMITS).toMatchObject({ userPerHour: 30, userPerDay: 200, orgPerDay: 1000 });
  });

  it.each(["user_hour", "user_day", "org_day"] as const)(
    "maps a %s refusal to 429 with the retry window",
    async (reason) => {
      const { client } = service({
        data: [{ allowed: false, retry_after_seconds: 120, reason }],
        error: null,
      });
      expect(await consumeAiQuota(client, input)).toEqual({
        allowed: false,
        status: 429,
        error: "rate_limited",
        retryAfterSeconds: 120,
        reason,
      });
    }
  );

  it("never reports a retry window shorter than one second", async () => {
    const { client } = service({
      data: [{ allowed: false, retry_after_seconds: 0, reason: "user_hour" }],
      error: null,
    });
    expect(await consumeAiQuota(client, input)).toMatchObject({ status: 429, retryAfterSeconds: 1 });
  });

  it("maps a membership refusal from the database to 403", async () => {
    const { client } = service({
      data: [{ allowed: false, retry_after_seconds: 0, reason: "not_member" }],
      error: null,
    });
    expect(await consumeAiQuota(client, input)).toMatchObject({ allowed: false, status: 403 });
  });

  it("accepts a single-object result as well as a one-row array", async () => {
    const { client } = service({
      data: { allowed: true, retry_after_seconds: 0, reason: "ok" },
      error: null,
    });
    expect(await consumeAiQuota(client, input)).toEqual({ allowed: true });
  });

  it("fails closed with 503 when the function errors, without leaking the driver message", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = service({
      data: null,
      error: { code: "PGRST202", message: "secret driver detail" },
    });
    const result = await consumeAiQuota(client, input);
    expect(result).toMatchObject({ allowed: false, status: 503, error: "assistant_unavailable" });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("secret driver detail");
  });

  it("fails closed when the function returns nothing or a malformed row", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await consumeAiQuota(service({ data: [], error: null }).client, input)).toMatchObject({
      allowed: false,
      status: 503,
    });
    expect(
      await consumeAiQuota(service({ data: [{ allowed: "yes" }], error: null }).client, input)
    ).toMatchObject({ allowed: false, status: 503 });
  });

  it("fails closed when the client throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockRejectedValue(new Error("network"));
    expect(await consumeAiQuota({ rpc }, input)).toMatchObject({ allowed: false, status: 503 });
  });
});
