/**
 * What may be logged about an AI provider failure: the HTTP status and the
 * error class, nothing else. Provider messages can carry billing state,
 * request ids or echoes of the prompt (ticket content), so they are neither
 * logged nor returned to a browser (AGENTS.md rules 1 and 10).
 */
export interface ProviderFailureSummary {
  status: number | null;
  type: string;
}

export function summarizeProviderError(error: unknown): ProviderFailureSummary {
  const rawStatus =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  return {
    status: typeof rawStatus === "number" ? rawStatus : null,
    type: error instanceof Error ? error.name : typeof error,
  };
}
