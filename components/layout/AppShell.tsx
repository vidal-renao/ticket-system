"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "./Sidebar";
import type { UserRole } from "@/lib/supabase/types";

interface AppShellProps {
  children: React.ReactNode;
  role: UserRole;
  userName: string;
  userAvatar?: string | null;
}

export function AppShell({ children, role, userName, userAvatar }: AppShellProps) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-surface-950)]">
      <Sidebar
        role={role}
        userName={userName}
        userAvatar={userAvatar}
        onSignOut={handleSignOut}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
