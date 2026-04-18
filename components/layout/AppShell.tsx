"use client";

import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "./Sidebar";
import { PageTransition } from "./PageTransition";
import type { UserRole } from "@/lib/supabase/types";

interface AppShellProps {
  children: React.ReactNode;
  role: UserRole;
  userName: string;
  userAvatar?: string | null;
  locale: string;
}

export function AppShell({ children, role, userName, userAvatar, locale }: AppShellProps) {
  const supabase = createClient();

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
      <Sidebar
        role={role}
        userName={userName}
        userAvatar={userAvatar}
        onSignOut={handleSignOut}
        onGoHome={handleGoHome}
      />
      <main className="flex-1 overflow-y-auto">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
