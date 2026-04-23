"use client";

import { Bell } from "lucide-react";
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

interface NotificationsMenuProps {
  notifications: ShellNotification[];
  unreadCount: number;
}

export function NotificationsMenu({ notifications, unreadCount }: NotificationsMenuProps) {
  return (
    <section className="px-3 py-3 border-t border-[var(--color-surface-600)]">
      <div className="flex items-center justify-between px-3 mb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)] uppercase">
          <Bell className="w-3.5 h-3.5" />
          Notifications
        </div>
        {unreadCount > 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-indigo-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {notifications.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">No recent notifications</p>
        ) : (
          notifications.map((notification) => {
            const content = (
              <>
                <div className="flex items-start gap-2">
                  {!notification.is_read && (
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--color-text-secondary)] truncate">
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2">
                        {notification.message}
                      </p>
                    )}
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      {formatRelativeTime(notification.created_at)}
                    </p>
                  </div>
                </div>
              </>
            );

            const className =
              "block px-3 py-2 rounded-lg border transition-colors " +
              (notification.is_read
                ? "border-transparent hover:bg-[var(--color-surface-800)]"
                : "border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/15");

            return notification.ticket_id ? (
              <Link
                key={notification.id}
                href={`/tickets/${notification.ticket_id}`}
                className={className}
              >
                {content}
              </Link>
            ) : (
              <div key={notification.id} className={className}>
                {content}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

