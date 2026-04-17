"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";
import {
  TicketIcon,
  LayoutDashboard,
  PlusCircle,
  Users,
  Settings,
  Zap,
  BarChart3,
  LogOut,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/types";

type NavKey =
  | "dashboard"
  | "myTickets"
  | "allTickets"
  | "newTicket"
  | "queue"
  | "analytics"
  | "team"
  | "settings";

interface NavItem {
  href: string;
  labelKey: NavKey;
  icon: React.ElementType;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    labelKey: "dashboard",
    icon: LayoutDashboard,
    roles: ["manager", "admin"],
  },
  {
    href: "/tickets",
    labelKey: "myTickets",
    icon: TicketIcon,
    roles: ["customer"],
  },
  {
    href: "/tickets/new",
    labelKey: "newTicket",
    icon: PlusCircle,
    roles: ["customer"],
  },
  {
    href: "/queue",
    labelKey: "queue",
    icon: Zap,
    roles: ["agent", "manager", "admin"],
  },
  {
    href: "/tickets",
    labelKey: "allTickets",
    icon: TicketIcon,
    roles: ["agent", "manager", "admin"],
  },
  {
    href: "/analytics",
    labelKey: "analytics",
    icon: BarChart3,
    roles: ["manager", "admin"],
  },
  {
    href: "/team",
    labelKey: "team",
    icon: Users,
    roles: ["manager", "admin"],
  },
  {
    href: "/settings",
    labelKey: "settings",
    icon: Settings,
    roles: ["admin"],
  },
];

interface SidebarProps {
  role: UserRole;
  userName: string;
  userAvatar?: string | null;
  onSignOut: () => void;
}

export function Sidebar({ role, userName, userAvatar, onSignOut }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside className="flex flex-col w-60 min-h-screen border-r border-[var(--color-surface-600)] bg-[var(--color-surface-900)]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[var(--color-surface-600)]">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">HelpDesk AI</p>
          <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">{role}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={`${item.href}-${item.labelKey}`}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                isActive
                  ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-700)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              {t(item.labelKey)}
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" aria-hidden="true" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Home button */}
      <div className="px-3 pb-2 border-t border-[var(--color-surface-600)] pt-2">
        <Link
          href="/home"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
            pathname === "/home"
              ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-700)] hover:text-[var(--color-text-secondary)]"
          )}
        >
          <Home className="w-4 h-4 shrink-0" aria-hidden="true" />
          {t("home")}
        </Link>
      </div>

      {/* Locale switcher */}
      <div className="border-t border-[var(--color-surface-600)]">
        <LocaleSwitcher />
      </div>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-[var(--color-surface-600)]">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          {userAvatar ? (
            <img src={userAvatar} alt={userName} className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[var(--color-surface-700)] flex items-center justify-center text-xs font-semibold text-[var(--color-text-secondary)]">
              {userName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{userName}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            aria-label={t("signOut")}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
