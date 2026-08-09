import { ROUTING_AWAITING_AVAILABILITY } from "@/lib/ticket-routing";

type TicketPresentationInput = {
  priority: string;
  metadata?: unknown;
  organization?: {
    plan?: string | null;
    tier?: string | null;
    settings?: unknown;
  } | null;
};

export function getTicketPresentation(input: TicketPresentationInput) {
  const metadata = asRecord(input.metadata);
  const organizationSettings = asRecord(input.organization?.settings);
  const explicitVip = metadata?.is_vip === true;
  const metadataTier = typeof metadata?.tier === "string" ? metadata.tier : null;
  const orgTier = input.organization?.tier ?? null;
  const orgPlan = input.organization?.plan ?? null;
  const organizationVip =
    orgTier === "vip" ||
    orgTier === "enterprise" ||
    orgPlan === "enterprise" ||
    (organizationSettings?.is_vip === true);
  const isVip = explicitVip || metadataTier === "vip" || organizationVip;
  const priorityLabel =
    typeof metadata?.priority_label === "string" && metadata.priority_label.trim()
      ? metadata.priority_label.trim()
      : isVip && input.priority === "critical"
        ? "emergency"
        : input.priority;

  return {
    isVip,
    priorityLabel,
    priorityTone: isVip && input.priority === "critical" ? "vip-critical" : input.priority,
    vipReason:
      typeof metadata?.vip_reason === "string"
        ? metadata.vip_reason
        : organizationVip
          ? "VIP organization"
          : null,
  };
}

/**
 * Whether a ticket is unassigned *because nobody was reachable*, as opposed to
 * being merely new or waiting on triage.
 *
 * Deliberately gated on the ticket still having no assignee: that way the
 * marker never has to be cleaned up. Once anyone takes the ticket the label
 * disappears on its own, whatever `metadata` still says.
 */
export function isAwaitingAvailability(input: {
  assignedTo?: string | null;
  metadata?: unknown;
}): boolean {
  if (input.assignedTo) return false;
  return asRecord(input.metadata)?.routing_status === ROUTING_AWAITING_AVAILABILITY;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
