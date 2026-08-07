import type { CSSProperties } from "react";
import type { TicketPriority } from "@/lib/supabase/types";
import type { CanonicalTicketStatus } from "@/lib/ticket-lifecycle";
import type { OpsEventKind } from "@/lib/ops/types";

/**
 * Scoped "swiss console" palette for /ops.
 *
 * The console is deliberately dark-only and does not consume the app's
 * day/night tokens: it is a fixed operations surface, and mixing it with the
 * themed palette would make the status colours unreadable under the brightness
 * overlay. Values are the ones agreed in the design reference.
 */
export const OPS = {
  bg: "#0B0F14",
  panel: "#121A23",
  panel2: "#0F161E",
  line: "#1E2A36",
  text: "#E6EDF3",
  muted: "#8A99A8",
  faint: "#5A6A78",
  gold: "#E0A82E",
  emerald: "#10B981",
  blue: "#3B82F6",
  amber: "#F59E0B",
  red: "#EF4444",
  slate: "#64748B",
} as const;

export const MONO: CSSProperties = {
  fontFamily: "'Cascadia Code', ui-monospace, Consolas, 'SF Mono', monospace",
};

export const STATUS_COLOR: Record<CanonicalTicketStatus, string> = {
  new: OPS.amber,
  assigned: OPS.gold,
  in_progress: OPS.blue,
  waiting_customer: OPS.slate,
  waiting_third_party: OPS.slate,
  resolved: OPS.emerald,
  closed: OPS.faint,
};

export const PRIORITY_COLOR: Record<TicketPriority, string> = {
  critical: OPS.red,
  high: OPS.amber,
  medium: OPS.blue,
  low: OPS.slate,
};

export const EVENT_COLOR: Record<OpsEventKind, string> = {
  created: OPS.blue,
  first_response: OPS.gold,
  status: OPS.blue,
  resolved: OPS.emerald,
  closed: OPS.slate,
  sla_breach: OPS.red,
  comment: OPS.text,
  audit: OPS.muted,
  removed: OPS.faint,
};
