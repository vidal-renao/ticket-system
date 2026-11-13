import { describe, expect, it } from "vitest";
import { isFailedTriage, triageFailureReasoning, TRIAGE_FAILED_MODEL } from "@/lib/ai/triage-constants";

describe("triageFailureReasoning", () => {
  it("never includes the provider's raw error message", () => {
    const raw = new Error('400 {"error":{"message":"Your credit balance is too low"},"request_id":"req_123"}');
    const text = triageFailureReasoning(raw);
    expect(text).not.toContain("credit");
    expect(text).not.toContain("req_123");
    expect(text).toMatch(/^Triage failed:/);
  });

  it("reports a timeout separately", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(triageFailureReasoning(abort)).toContain("did not answer in time");
  });

  it("handles non-Error throwables", () => {
    expect(triageFailureReasoning("boom")).not.toContain("boom");
  });
});

describe("isFailedTriage", () => {
  it("recognises the placeholder row only", () => {
    expect(isFailedTriage({ model_used: TRIAGE_FAILED_MODEL })).toBe(true);
    expect(isFailedTriage({ model_used: "claude-sonnet-4-6" })).toBe(false);
    expect(isFailedTriage({ model_used: null })).toBe(false);
  });
});
