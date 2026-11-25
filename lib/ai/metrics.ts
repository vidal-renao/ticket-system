import { TRIAGE_STALE_AFTER_MINUTES, isFailedTriage } from "@/lib/ai/triage-constants";

/** Columns of `hd_ai_analysis` needed for aggregate AI metrics. */
export interface AiAnalysisMetricRow {
  confidence_score: number | null;
  category_accepted: boolean | null;
  model_used: string | null;
}

export interface AiAnalysisSummary {
  /** Analyses produced by a model (failure placeholders excluded). */
  analyzed: number;
  /** Mean confidence (0-100) or null when nothing was analysed. */
  avgConfidence: number | null;
  /** Share of AI categories accepted by staff (0-100) or null without feedback. */
  acceptanceRate: number | null;
  feedbackCount: number;
}

/**
 * runAITriage writes a placeholder row (`model_used = "n/a"`, confidence 0) when
 * the model call fails. Counting it would drag the average down and misreport
 * how many tickets were really analysed.
 */
function isRealAnalysis(row: AiAnalysisMetricRow): boolean {
  return !isFailedTriage(row);
}

export function summarizeAiAnalysis(rows: readonly AiAnalysisMetricRow[]): AiAnalysisSummary {
  const real = rows.filter(isRealAnalysis);
  const confidences = real
    .map((row) => row.confidence_score)
    .filter((value): value is number => typeof value === "number");
  const feedback = real.filter((row) => row.category_accepted !== null && row.category_accepted !== undefined);
  const accepted = feedback.filter((row) => row.category_accepted === true).length;

  return {
    analyzed: real.length,
    avgConfidence: confidences.length
      ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
      : null,
    acceptanceRate: feedback.length ? Math.round((accepted / feedback.length) * 100) : null,
    feedbackCount: feedback.length,
  };
}

export type TriageDisplayState = "ready" | "processing" | "pending_review";

/**
 * Distinguishes a triage that is still in flight from one that never landed,
 * so the ticket page does not show "Processing…" indefinitely.
 */
export function triageDisplayState(
  hasAnalysis: boolean,
  ticketCreatedAt: string,
  now: number = Date.now()
): TriageDisplayState {
  if (hasAnalysis) return "ready";
  const ageMs = now - Date.parse(ticketCreatedAt);
  return ageMs > TRIAGE_STALE_AFTER_MINUTES * 60_000 ? "pending_review" : "processing";
}
