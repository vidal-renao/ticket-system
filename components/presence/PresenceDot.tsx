"use client";

import { useStaffPresence } from "./StaffPresenceProvider";
import { cn } from "@/lib/utils";

/**
 * Green dot next to a staff member's name while they hold an open connection.
 * Renders nothing at all when they are offline — absence of a dot is the
 * offline state, so a stale dot can never be shown.
 */
export function PresenceDot({
  userId,
  label,
  className,
}: {
  userId: string | null | undefined;
  /** Accessible text, e.g. "Ana is online". */
  label: string;
  className?: string;
}) {
  const online = useStaffPresence();
  if (!userId || !online.has(userId)) return null;

  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)]",
        className
      )}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}
