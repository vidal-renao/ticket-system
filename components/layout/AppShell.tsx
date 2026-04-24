"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "./Sidebar";
import { PageTransition } from "./PageTransition";
import type { UserRole } from "@/lib/supabase/types";
import type { ShellNotification } from "./NotificationsMenu";
import { Bell, Menu, X, Zap } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
  role: UserRole;
  userName: string;
  userSubtitle?: string | null;
  userAvatar?: string | null;
  locale: string;
  notifications: ShellNotification[];
  unreadNotifications: number;
}

export function AppShell({
  children,
  role,
  userName,
  userSubtitle,
  userAvatar,
  locale,
  notifications,
  unreadNotifications,
}: AppShellProps) {
  const supabase = createClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [liveNotifications, setLiveNotifications] = useState(notifications);
  const [liveUnreadNotifications, setLiveUnreadNotifications] = useState(unreadNotifications);

  useEffect(() => {
    setLiveNotifications(notifications);
  }, [notifications]);

  useEffect(() => {
    setLiveUnreadNotifications(unreadNotifications);
  }, [unreadNotifications]);

  useEffect(() => {
    let cancelled = false;

    async function refreshNotifications() {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        setLiveNotifications(data.notifications ?? []);
        setLiveUnreadNotifications(data.unreadCount ?? 0);
      } catch {
        // Keep the current UI state if polling fails.
      }
    }

    refreshNotifications();
    const interval = window.setInterval(refreshNotifications, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
    window.location.href = loginPath;
  }

  async function handleGoHome() {
    // Navigate to public landing — keep session active so user can return to app
    const homePath = locale === "de" ? "/home" : `/${locale}/home`;
    window.location.href = homePath;
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-surface-950)]">
      <div className="xl:hidden fixed top-0 inset-x-0 z-40 border-b border-[var(--color-surface-600)] bg-[var(--color-surface-900)]/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="w-10 h-10 rounded-lg border border-[var(--color-surface-600)] text-[var(--color-text-secondary)] flex items-center justify-center"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
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
          <div className="relative w-10 h-10 rounded-lg border border-[var(--color-surface-600)] text-[var(--color-text-secondary)] flex items-center justify-center">
            <Bell className="w-4 h-4" />
            {liveUnreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-indigo-500 text-white text-[10px] font-semibold flex items-center justify-center">
                {liveUnreadNotifications > 9 ? "9+" : liveUnreadNotifications}
              </span>
            )}
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="xl:hidden fixed inset-0 z-30 bg-black/60"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <Sidebar
        role={role}
        userName={userName}
        userSubtitle={userSubtitle}
        userAvatar={userAvatar}
        notifications={liveNotifications}
        unreadNotifications={liveUnreadNotifications}
        onSignOut={handleSignOut}
        onGoHome={handleGoHome}
        onNavigate={() => setMobileMenuOpen(false)}
        className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 xl:static xl:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      />
      <main className="flex-1 overflow-y-auto pt-16 xl:pt-0 min-w-0">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
