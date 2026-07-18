const TICKET_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export function isTicketPriority(value: unknown): value is TicketPriority {
  return typeof value === "string" && TICKET_PRIORITIES.includes(value as TicketPriority);
}

export function shouldApplyAiPriority(input: {
  confidence: number;
  initialPriority: string;
  currentPriority: string;
  suggestedPriority: unknown;
}): input is typeof input & { suggestedPriority: TicketPriority } {
  return (
    input.confidence >= 60 &&
    input.currentPriority === input.initialPriority &&
    input.suggestedPriority !== input.currentPriority &&
    isTicketPriority(input.suggestedPriority)
  );
}
