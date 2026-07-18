import { describe, expect, it } from "vitest";
import { shouldApplyAiPriority } from "../../lib/ai/triage-policy";

describe("AI triage priority policy", () => {
  it("applies a confident valid suggestion when no human changed priority", () => {
    expect(shouldApplyAiPriority({
      confidence: 82,
      initialPriority: "medium",
      currentPriority: "medium",
      suggestedPriority: "high",
    })).toBe(true);
  });

  it("never overwrites a later human priority change", () => {
    expect(shouldApplyAiPriority({
      confidence: 95,
      initialPriority: "medium",
      currentPriority: "critical",
      suggestedPriority: "high",
    })).toBe(false);
  });

  it("rejects low-confidence and invalid priorities", () => {
    expect(shouldApplyAiPriority({
      confidence: 59,
      initialPriority: "medium",
      currentPriority: "medium",
      suggestedPriority: "high",
    })).toBe(false);
    expect(shouldApplyAiPriority({
      confidence: 99,
      initialPriority: "medium",
      currentPriority: "medium",
      suggestedPriority: "urgent",
    })).toBe(false);
  });
});
