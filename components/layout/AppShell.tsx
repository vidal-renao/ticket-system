"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "./Sidebar";
import { PageTransition } from "./PageTransition";
import type { UserRole } from "@/lib/supabase/types";
import { NotificationsBell, type ShellNotification } from "./NotificationsBell";
import { Menu, X, Zap } from "lucide-react";
import { ScrollToTop } from "./ScrollToTop";
import { SessionTimeoutModal } from "./SessionTimeoutModal";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";

/**
 * Realtime delivers new notifications, so this poll is the safety net rather
 * than the primary path: it reconciles reads made in another tab and covers
 * any window where the socket is down.
 */
const NOTIFICATIONS_POLL_MS = 30_000;

interface AppShellProps {
  children: React.ReactNode;
  role: UserRole;
  userName: string;
  userSubtitle?: string | null;
  userAvatar?: string | null;
  userStatus?: "online" | "offline" | "busy" | null;
  queueCount?: number;
  locale: string;
  notifications: ShellNotification[];
  unreadNotifications: number;
  inboxUnreadCount?: number;
}

export function AppShell({
  children,
  role,
  userName,
  userSubtitle,
  userAvatar,
  userStatus,
  queueCount = 0,
  locale,
  notifications,
  unreadNotifications,
  inboxUnreadCount = 0,
}: AppShellProps) {
  const supabase = createClient();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Rail sizing is CSS-driven from data-sidebar on <html> (set pre-paint in
  // app/layout.tsx). This state only mirrors it for labels and ARIA.
  const [collapsed, setCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    setCollapsed(document.documentElement.dataset.sidebar === "collapsed");
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      document.documentElement.dataset.sidebar = next ? "collapsed" : "expanded";
      try {
        localStorage.setItem("hd_sidebar", next ? "collapsed" : "expanded");
      } catch {
        // Private mode: the rail still toggles for this session.
      }
      return next;
    });
  }

  // Mobile drawer: Escape closes it and the page behind it does not scroll.
  useEffect(() => {
    if (!mobileMenuOpen) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [mobileMenuOpen]);

  // Off-canvas and closed: keep the hidden nav out of the tab order.
  const drawerHidden = !isDesktop && !mobileMenuOpen;

  // Liveness heartbeat: keeps profiles.last_seen_at fresh so presence shown
  // across the app reflects who is actually connected.
  usePresenceHeartbeat();
  const [liveNotifications, setLiveNotifications] = useState(notifications);
  const [liveUnreadNotifications, setLiveUnreadNotifications] = useState(unreadNotifications);
  const [liveInboxUnread, setLiveInboxUnread] = useState(inboxUnreadCount);

  useEffect(() => {
    setLiveNotifications(notifications);
  }, [notifications]);

  useEffect(() => {
    setLiveUnreadNotifications(unreadNotifications);
  }, [unreadNotifications]);

  useEffect(() => {
    setLiveInboxUnread(inboxUnreadCount);
  }, [inboxUnreadCount]);

  // Shared by the poll below and by the realtime subscription: both only need
  // to say "something changed", and the endpoint returns the full picture
  // (list, unread count, inbox count) in one round trip.
  const refreshNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setLiveNotifications(data.notifications ?? []);
      setLiveUnreadNotifications(data.unreadCount ?? 0);
      setLiveInboxUnread(data.inboxUnreadCount ?? 0);
    } catch {
      // Keep the current UI state if the request fails.
    }
  }, []);

  // Fallback path. Realtime covers new notifications instantly, but the poll
  // still owns everything an INSERT cannot report: notifications marked read
  // in another tab, and any interval where the socket is down or the table is
  // missing from the publication.
  useEffect(() => {
    void refreshNotifications();
    const interval = window.setInterval(refreshNotifications, NOTIFICATIONS_POLL_MS);
    return () => window.clearInterval(interval);
  }, [refreshNotifications]);

  // Set status offline when tab/window closes (sendBeacon is fire-and-forget)
  useEffect(() => {
    function handleUnload() {
      navigator.sendBeacon("/api/profile/offline");
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Realtime: a notification addressed to this user lands on the socket, so
  // the bell reacts at once instead of up to NOTIFICATIONS_POLL_MS later.
  //
  // Replaces a subscription to `profiles` that could never fire: that table is
  // not a member of the `supabase_realtime` publication, and the channel never
  // called setAuth, so the server evaluated the policies as `anon`. Its
  // callback refreshed notifications — nothing to do with presence — which the
  // poll was already doing, so the bell was polling-only all along.
  useEffect(() => {
    let disposed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;

    async function subscribe() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (disposed || !session) return;

      // Realtime enforces RLS per subscriber, so the socket has to carry the
      // user's JWT. Without this the policies evaluate as `anon` and the
      // server silently sends nothing.
      supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`notifications-${session.user.id}`)
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          {
            event: "INSERT",
            schema: "public",
            table: "hd_notifications",
            // Belt and braces: the users_own_notifications policy already
            // restricts this subscriber to their own rows, but filtering
            // server-side avoids shipping rows only to discard them.
            filter: `user_id=eq.${session.user.id}`,
          },
          () => {
            // Refetch rather than trusting the payload: the endpoint also
            // returns the counts, and it is scoped server-side.
            void refreshNotifications();
          }
        )
        .subscribe();
    }

    void subscribe();

    return () => {
      disposed = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, refreshNotifications]);

  async function handleSignOut() {
    // Set offline before signing out so status is accurate
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("hd_profiles").update({ availability_status: "offline" }).eq("id", user.id);
      }
    } catch { /* silent — sign out proceeds regardless */ }
    await supabase.auth.signOut();
    const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
    window.location.href = loginPath;
  }

  function handleGoHome() {
    // Navigate to landing page WITHOUT signing out — session stays active
    const homePath = locale === "de" ? "/home" : `/${locale}/home`;
    router.push(homePath);
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-surface-950)]">
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 border-b border-[var(--color-surface-600)] bg-[var(--color-surface-900)]/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="w-10 h-10 rounded-lg border border-[var(--color-surface-600)] text-[var(--color-text-secondary)] flex items-center justify-center"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="app-sidebar"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{userName}</p>
              {userSubtitle && (
                <p className="text-[11px] text-[var(--color-text-muted)]">{userSubtitle}</p>
              )}
            </div>
          </div>
          <NotificationsBell notifications={liveNotifications} unreadCount={liveUnreadNotifications} align="right" />
        </div>
      </div>

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="lg:hidden fixed inset-0 z-30 bg-black/60"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <Sidebar
        role={role}
        userName={userName}
        userSubtitle={userSubtitle}
        userAvatar={userAvatar}
        userStatus={userStatus}
        queueCount={queueCount}
        notifications={liveNotifications}
        unreadNotifications={liveUnreadNotifications}
        inboxUnreadCount={liveInboxUnread}
        onSignOut={handleSignOut}
        onGoHome={handleGoHome}
        onNavigate={() => setMobileMenuOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        id="app-sidebar"
        inert={drawerHidden || undefined}
        className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      />
      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0 min-w-0">
        <PageTransition>{children}</PageTransition>
      </main>
      <ScrollToTop />
      <SessionTimeoutModal locale={locale} />
    </div>
  );
}
