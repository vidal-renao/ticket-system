import { availabilityStatusColor, availabilityStatusLabel, cn } from "@/lib/utils";

interface PresenceAvatarProps {
  name: string;
  avatarUrl?: string | null;
  status?: "online" | "offline" | "busy" | null;
  queueCount?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
} as const;

const badgeClasses = {
  sm: "min-w-4 h-4 text-[9px]",
  md: "min-w-5 h-5 text-[10px]",
  lg: "min-w-6 h-6 text-[11px]",
} as const;

function getInitials(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (tokens.length === 0) return "?";
  return tokens.map((token) => token.charAt(0).toUpperCase()).join("");
}

export function PresenceAvatar({
  name,
  avatarUrl,
  status = "offline",
  queueCount,
  size = "md",
  className,
}: PresenceAvatarProps) {
  const initials = getInitials(name);
  const statusLabel = availabilityStatusLabel(status);

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      {avatarUrl ? (
        // User avatars can come from tenant-configured storage hosts, so Next Image host allowlisting is not reliable here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className={cn(
            "rounded-full border border-white/10 object-cover shadow-sm shadow-black/20",
            sizeClasses[size]
          )}
        />
      ) : (
        <div
          className={cn(
            "flex items-center justify-center rounded-full border border-white/10 bg-[var(--color-surface-700)] font-semibold text-[var(--color-text-primary)] shadow-sm shadow-black/20",
            sizeClasses[size]
          )}
          aria-label={name}
        >
          {initials}
        </div>
      )}

      <span
        className={cn(
          "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--color-surface-900)]",
          availabilityStatusColor(status)
        )}
        aria-label={statusLabel}
        title={statusLabel}
      />

      {typeof queueCount === "number" && queueCount > 0 && (
        <span
          className={cn(
            "absolute -right-1 -top-1 inline-flex items-center justify-center rounded-full border border-[var(--color-brand-400)]/30 bg-[var(--color-brand-500)] px-1.5 font-semibold text-white shadow-md shadow-blue-950/30",
            badgeClasses[size]
          )}
          title={`${queueCount} tasks in queue`}
        >
          {queueCount > 99 ? "99+" : queueCount}
        </span>
      )}
    </div>
  );
}
