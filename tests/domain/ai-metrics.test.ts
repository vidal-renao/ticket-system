import { describe, expect, it } from "vitest";
import { summarizeAiAnalysis, triageDisplayState } from "../../lib/ai/metrics";

describe("AI analysis summary", () => {
  it("returns empty metrics when there are no analyses", () => {
    expect(summarizeAiAnalysis([])).toEqual({
      analyzed: 0,
      avgConfidence: null,
      acceptanceRate: null,
      feedbackCount: 0,
    });
  });

  it("averages confidence over real analyses only", () => {
    const summary = summarizeAiAnalysis([
      { confidence_score: 88, category_accepted: null, model_used: "claude-sonnet-4-6" },
      { confidence_score: 72, category_accepted: null, model_used: "claude-sonnet-4-6" },
      // Failure-path placeholder written when the model call throws.
      { confidence_score: 0, category_accepted: null, model_used: "n/a" },
    ]);
    expect(summary.analyzed).toBe(2);
    expect(summary.avgConfidence).toBe(80);
  });

  it("computes acceptance only from analyses with agent feedback", () => {
    const summary = summarizeAiAnalysis([
      { confidence_score: 90, category_accepted: true, model_used: "m" },
      { confidence_score: 60, category_accepted: false, model_used: "m" },
      { confidence_score: 70, category_accepted: null, model_used: "m" },
    ]);
    expect(summary.feedbackCount).toBe(2);
    expect(summary.acceptanceRate).toBe(50);
  });

  it("keeps acceptance unknown when nobody has given feedback", () => {
    const summary = summarizeAiAnalysis([
      { confidence_score: 88, category_accepted: null, model_used: "m" },
    ]);
    expect(summary.acceptanceRate).toBeNull();
  });
});

describe("triage display state", () => {
  const NOW = Date.parse("2026-11-13T12:00:00Z");

  it("shows processing for a ticket created moments ago", () => {
    const created = new Date(NOW - 2 * 60_000).toISOString();
    expect(triageDisplayState(false, created, NOW)).toBe("processing");
  });

  it("flags a stale missing triage as pending manual review", () => {
    const created = new Date(NOW - 3 * 24 * 60 * 60_000).toISOString();
    expect(triageDisplayState(false, created, NOW)).toBe("pending_review");
  });

  it("reports ready when an analysis exists", () => {
    expect(triageDisplayState(true, new Date(NOW).toISOString(), NOW)).toBe("ready");
  });
});
