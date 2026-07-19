"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, CheckCircle2, Inbox } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatRelativeTime } from "@/lib/utils";

export interface ShellNotification {
  id: string;
  ticket_id: string | null;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationsBellProps {
  notifications: ShellNotification[];
  unreadCount: number;
  /** Which side the flyout panel opens from, so it never runs off-screen. */
  align?: "left" | "right";
  className?: string;
}

/**
 * Notification bell with a flyout panel — replaces the old always-expanded
 * list that lived permanently in the sidebar and hid the navigation menu.
 * Only unread notifications are shown; once read (clicked, or "mark all"),
 * they disappear from the panel immediately.
 */
export function NotificationsBell({ notifications, unreadCount, align = "left", className }: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.is_read && !dismissedIds.has(n.id));
  // unreadCount is the true total (may exceed the small preview list below).
  const badgeCount = Math.max(0, unreadCount - dismissedIds.size);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function markRead(id: string) {
    setDismissedIds((prev) => new Set(prev).add(id));
    fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
  }

  function markAllRead() {
    setDismissedIds(new Set(unread.map((n) => n.id)));
    fetch("/api/notifications", { method: "PATCH" }).catch(() => {});
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-surface-600)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-800)]"
      >
        <Bell className="h-4 w-4" />
        {badgeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1.5 text-[10px] font-semibold text-white">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] shadow-2xl shadow-black/40 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-surface-700)] px-3.5 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Notifications
            </span>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 text-[11px] font-medium text-indigo-400 transition-colors hover:text-indigo-300"
              >
                <CheckCheck className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {unread.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" aria-hidden="true" />
                <p className="text-xs text-[var(--color-text-muted)]">You&apos;re all caught up</p>
              </div>
            ) : (
              <div className="space-y-1 p-1.5">
                {unread.map((notification) => {
                  const content = (
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[var(--color-text-secondary)]">
                          {notification.title}
                        </p>
                        {notification.message && (
                          <p className="line-clamp-2 text-[11px] text-[var(--color-text-muted)]">
                            {notification.message}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                          {formatRelativeTime(notification.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                  const itemClass =
                    "block rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 transition-colors hover:bg-indigo-500/15";

                  return notification.ticket_id ? (
                    <Link
                      key={notification.id}
                      href={`/tickets/${notification.ticket_id}`}
                      className={itemClass}
                      onClick={() => {
                        markRead(notification.id);
                        setOpen(false);
                      }}
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => markRead(notification.id)}
                      className={`w-full text-left ${itemClass}`}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Link
            href="/inbox"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 border-t border-[var(--color-surface-700)] px-3 py-2.5 text-xs font-medium text-indigo-400 transition-colors hover:bg-[var(--color-surface-800)] hover:text-indigo-300"
          >
            <Inbox className="h-3.5 w-3.5" /> View all in Inbox
          </Link>
        </div>
      )}
    </div>
  );
}
