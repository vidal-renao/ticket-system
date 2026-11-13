import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeProviderError } from "../../lib/ai/provider-error";

// A provider error the way the SDK raises it when the account has no credit:
// the message carries billing state and a request id that must never reach a
// browser or the logs.
const PROVIDER_MESSAGE = "400 invalid_request_error: Your credit balance is too low (request_id req_secret_123)";
class FakeProviderError extends Error {
  status = 400;
  constructor() {
    super(PROVIDER_MESSAGE);
    this.name = "BadRequestError";
  }
}

const createMessage = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMessage };
  },
}));

/** Supabase query builder stand-in: every call chains, awaiting yields `result`. */
function chain(result: unknown) {
  const builder: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: unknown) => void) => resolve(result);
      return () => proxy;
    },
  };
  const proxy = new Proxy(builder, handler);
  return proxy;
}

const supabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseClient,
}));

function logged(spy: ReturnType<typeof vi.spyOn>): string {
  return JSON.stringify(spy.mock.calls);
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  supabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("summarizeProviderError", () => {
  it("keeps only status and error class", () => {
    expect(summarizeProviderError(new FakeProviderError())).toEqual({ status: 400, type: "BadRequestError" });
    expect(summarizeProviderError("boom")).toEqual({ status: null, type: "string" });
    expect(JSON.stringify(summarizeProviderError(new FakeProviderError()))).not.toContain("credit");
  });
});

describe("customer AI assistant (/api/ai/wiki-chat)", () => {
  async function post() {
    const { POST } = await import("../../app/api/ai/wiki-chat/route");
    return POST(
      new Request("http://localhost/api/ai/wiki-chat", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: "My VPN drops" }] }),
      })
    );
  }

  it("answers 503 with a generic code when the provider rejects the request", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    createMessage.mockRejectedValue(new FakeProviderError());

    const response = await post();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({ error: "assistant_unavailable" });
    expect(body).not.toContain("credit");
    // Logged for operators, without the provider message or the conversation.
    expect(errorLog).toHaveBeenCalled();
    expect(logged(errorLog)).not.toContain("credit");
    expect(logged(errorLog)).not.toContain("req_secret_123");
    expect(logged(errorLog)).not.toContain("VPN");
  });

  it("fails closed without calling the provider when no key is configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    const response = await post();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "assistant_unavailable" });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("ends the stream quietly when the provider fails mid-answer", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    createMessage.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "Try " } };
        throw new FakeProviderError();
      },
    });

    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Try ");
    expect(logged(errorLog)).not.toContain("credit");
  });
});

describe("staff AI Suggest Response (suggestReply)", () => {
  beforeEach(() => {
    supabaseClient.from.mockImplementation((table: string) => {
      if (table === "hd_profiles") {
        return chain({ data: { id: "agent-1", role: "agent", organization_id: "org-1" } });
      }
      if (table === "hd_tickets") {
        return chain({ data: { id: "ticket-1", title: "VPN", description: "VPN drops", category_id: null } });
      }
      return chain({ data: null });
    });
  });

  it("returns a generic error, never the provider message", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    createMessage.mockRejectedValue(new FakeProviderError());
    const { suggestReply } = await import("../../app/actions/suggest-reply");

    const result = await suggestReply("ticket-1");

    expect(result).toEqual({ error: "AI suggestion unavailable" });
    expect(JSON.stringify(result)).not.toContain("credit");
    expect(logged(errorLog)).not.toContain("credit");
    expect(logged(errorLog)).not.toContain("VPN");
  });

  it("returns the suggestion when the provider answers", async () => {
    createMessage.mockResolvedValue({ content: [{ type: "text", text: " We are checking the tunnel. " }] });
    const { suggestReply } = await import("../../app/actions/suggest-reply");

    expect(await suggestReply("ticket-1")).toEqual({ suggestion: "We are checking the tunnel." });
  });
});
