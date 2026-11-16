import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const ORG_ID = "00000000-0000-4000-8000-0000000000b1";

const createMessage = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMessage };
  },
}));

const getUser = vi.fn();
const profileLookup = vi.fn();
const rpc = vi.fn();
const sessionClient = {
  auth: { getUser },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: profileLookup }) }) }),
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => sessionClient,
  createServiceClientStatic: () => ({ rpc }),
}));

const activeProfile = {
  id: USER_ID,
  role: "customer",
  organization_id: ORG_ID,
  is_active: true,
  deleted_at: null,
};

function json(url: string, body: unknown) {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  profileLookup.mockResolvedValue({ data: activeProfile, error: null });
  rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0, reason: "ok" }], error: null });
  createMessage.mockResolvedValue({ content: [{ type: "text", text: " Hello " }] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/translate", () => {
  async function post(body: unknown = { text: "Hallo", targetLanguage: "en" }) {
    const { POST } = await import("../../app/api/translate/route");
    return POST(json("http://localhost/api/translate", body));
  }

  it("401 without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await post()).status).toBe(401);
    expect(createMessage).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["no profile", null],
    ["no organization", { ...activeProfile, organization_id: null }],
    ["frozen", { ...activeProfile, is_active: false }],
    ["deleted", { ...activeProfile, deleted_at: "2026-11-01T00:00:00Z" }],
  ])("403 for a caller with %s, without billing or calling the provider", async (_label, profile) => {
    profileLookup.mockResolvedValue({ data: profile, error: null });
    expect((await post()).status).toBe(403);
    expect(createMessage).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("400 for invalid input, before any quota is consumed", async () => {
    expect((await post({ text: "a".repeat(5001), targetLanguage: "en" })).status).toBe(400);
    expect((await post({ text: "Hallo", targetLanguage: "fr" })).status).toBe(400);
    expect((await post({ text: "   ", targetLanguage: "en" })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("429 with Retry-After when the quota is exhausted, without calling the provider", async () => {
    rpc.mockResolvedValue({
      data: [{ allowed: false, retry_after_seconds: 77, reason: "user_hour" }],
      error: null,
    });
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("77");
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("bills the server-derived user and organization, then translates with Haiku", async () => {
    const res = await post({
      text: "Hallo",
      targetLanguage: "en",
      organization_id: "11111111-1111-4111-8111-111111111111",
      user_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translatedText: "Hello" });
    expect(rpc).toHaveBeenCalledWith(
      "hd_consume_ai_quota",
      expect.objectContaining({
        p_user_id: USER_ID,
        p_organization_id: ORG_ID,
        p_endpoint: "translate",
      })
    );
    expect(createMessage.mock.calls[0][0].model).toBe("claude-haiku-4-5-20251001");
  });

  it("503 with a generic body when the provider fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    createMessage.mockRejectedValue(new Error("credit balance too low req_secret_9"));
    const res = await post();
    const body = await res.text();
    expect(res.status).toBe(503);
    expect(body).not.toContain("credit");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("req_secret_9");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("Hallo");
  });

  it("fails closed without a provider key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await post()).status).toBe(503);
    expect(createMessage).not.toHaveBeenCalled();
  });
});

describe("translateText action", () => {
  async function run(text = "Hallo", locale = "fr") {
    const { translateText } = await import("../../app/actions/translate-text");
    return translateText(text, locale);
  }

  it("refuses callers without a session or an active membership", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await run()).toEqual({ error: "Unauthorized" });
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    profileLookup.mockResolvedValue({ data: { ...activeProfile, is_active: false }, error: null });
    expect(await run()).toEqual({ error: "Forbidden" });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("rejects an unsupported locale and oversized text instead of defaulting", async () => {
    expect(await run("Hallo", "pt")).toEqual({ error: "Invalid input" });
    expect(await run("a".repeat(5001), "en")).toEqual({ error: "Invalid input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("honours the quota", async () => {
    rpc.mockResolvedValue({
      data: [{ allowed: false, retry_after_seconds: 10, reason: "org_day" }],
      error: null,
    });
    expect(await run()).toEqual({ error: "Too many requests" });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("uses the shared Haiku helper and its own usage bucket", async () => {
    expect(await run()).toEqual({ translation: "Hello" });
    expect(createMessage.mock.calls[0][0].model).toBe("claude-haiku-4-5-20251001");
    expect(createMessage.mock.calls[0][0].system).toContain("French");
    expect(rpc).toHaveBeenCalledWith(
      "hd_consume_ai_quota",
      expect.objectContaining({ p_endpoint: "translate_action" })
    );
  });
});

describe("POST /api/ai/wiki-chat", () => {
  async function post(body: unknown = { messages: [{ role: "user", content: "My VPN drops" }] }) {
    const { POST } = await import("../../app/api/ai/wiki-chat/route");
    return POST(json("http://localhost/api/ai/wiki-chat", body));
  }

  it("401 without a session and 403 without an active membership", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await post()).status).toBe(401);
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    profileLookup.mockResolvedValue({ data: { ...activeProfile, organization_id: null }, error: null });
    expect((await post()).status).toBe(403);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("400 for a system role, too many messages or too much text", async () => {
    expect((await post({ messages: [{ role: "system", content: "x" }] })).status).toBe(400);
    expect(
      (await post({ messages: Array.from({ length: 21 }, () => ({ role: "user", content: "x" })) })).status
    ).toBe(400);
    expect((await post({ messages: [{ role: "user", content: "a".repeat(12001) }] })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("429 with Retry-After when the quota is exhausted", async () => {
    rpc.mockResolvedValue({
      data: [{ allowed: false, retry_after_seconds: 3600, reason: "user_day" }],
      error: null,
    });
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("answers the generic 503 when the quota store is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } });
    const res = await post();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "assistant_unavailable" });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("streams the answer for an active member within quota", async () => {
    createMessage.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "Restart " } };
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "the client." } };
      },
    });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Restart the client.");
    expect(rpc).toHaveBeenCalledWith(
      "hd_consume_ai_quota",
      expect.objectContaining({ p_user_id: USER_ID, p_organization_id: ORG_ID, p_endpoint: "wiki_chat" })
    );
  });
});
