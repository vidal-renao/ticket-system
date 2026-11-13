/** Triage itself times out at 30s, so anything older is not still in flight. */
export const TRIAGE_STALE_AFTER_MINUTES = 15;

/** `model_used` value of the placeholder row written when the model call fails. */
export const TRIAGE_FAILED_MODEL = "n/a";

export function isFailedTriage(row: { model_used: string | null }): boolean {
  return row.model_used === TRIAGE_FAILED_MODEL;
}

/**
 * Reasoning stored on the failure row. Staff can read it in the ticket, so it
 * must never carry the provider's raw error (billing state, request ids, quota
 * details). The full error goes to the server log only.
 */
export function triageFailureReasoning(err: unknown): string {
  const timedOut = err instanceof Error && err.name === "AbortError";
  return timedOut
    ? "Triage failed: the AI provider did not answer in time."
    : "Triage failed: the AI provider returned an error. Details are in the server logs.";
}
