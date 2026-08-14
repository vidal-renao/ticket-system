import type { EffectivePresence } from "@/lib/presence";
import { availabilityStatusColor, cn } from "@/lib/utils";

/**
 * A presence dot driven by `effectivePresence` -- the declared status already
 * degraded by heartbeat -- and by nothing else.
 *
 * It replaces the socket-backed dot that used to sit in these places. That one
 * meant "has a tab open", which is a different question and could contradict
 * every other indicator in the app: someone who had marked themselves busy
 * still showed green here while showing amber on /team.
 *
 * `presence` of null means "not applicable" (a customer, or somebody the
 * console has not resolved yet) and renders nothing, so absence never gets
 * mistaken for offline.
 */
export function PresenceMark({
  presence,
  label,
  className,
}: {
  presence: EffectivePresence | null | undefined;
  /** Accessible text, e.g. "Ana is busy". */
  label: string;
  className?: string;
}) {
  if (!presence) return null;

  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        availabilityStatusColor(presence),
        className
      )}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}
