"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeControl } from "./ThemeControl";
import {
  TicketIcon,
  LayoutDashboard,
  PlusCircle,
  Users,
  Settings,
  Zap,
  BarChart3,
  TrendingUp,
  LogOut,
  Home,
  Building2,
  MessageSquare,
  History,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/types";
import { NotificationsBell, type ShellNotification } from "./NotificationsBell";
import { PresenceAvatar } from "@/components/ui/PresenceAvatar";

type NavKey =
  | "dashboard"
  | "myTickets"
  | "allTickets"
  | "newTicket"
  | "queue"
  | "analytics"
  | "predictive"
  | "team"
  | "settings"
  | "admin"
  | "inbox"
  | "history";

interface NavItem {
  href: string;
  labelKey: NavKey;
  icon: React.ElementType;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, roles: ["manager", "admin"] },
  { href: "/tickets", labelKey: "myTickets", icon: TicketIcon, roles: ["customer"] },
  { href: "/tickets/new", labelKey: "newTicket", icon: PlusCircle, roles: ["customer"] },
  { href: "/queue", labelKey: "queue", icon: Zap, roles: ["agent", "manager", "admin"] },
  { href: "/tickets", labelKey: "allTickets", icon: TicketIcon, roles: ["agent", "manager", "admin"] },
  { href: "/analytics", labelKey: "analytics", icon: BarChart3, roles: ["manager", "admin"] },
  { href: "/analytics/predictive", labelKey: "predictive", icon: TrendingUp, roles: ["manager", "admin"] },
  { href: "/team", labelKey: "team", icon: Users, roles: ["manager", "admin"] },
  { href: "/admin", labelKey: "admin", icon: Building2, roles: ["manager", "admin"] },
  { href: "/inbox", labelKey: "inbox", icon: MessageSquare, roles: ["admin", "manager", "agent", "customer"] },
  { href: "/history", labelKey: "history", icon: History, roles: ["admin", "manager", "agent", "customer"] },
  { href: "/settings", labelKey: "settings", icon: Settings, roles: ["admin", "manager", "agent", "customer"] },
];

interface SidebarProps {
  role: UserRole;
  userName: string;
  userSubtitle?: string | null;
  userAvatar?: string | null;
  userStatus?: "online" | "offline" | "busy" | null;
  queueCount?: number;
  notifications: ShellNotification[];
  unreadNotifications: number;
  inboxUnreadCount?: number;
  onSignOut: () => void;
  onGoHome: () => void;
  onNavigate?: () => void;
  className?: string;
  /** Desktop rail state. Sizing itself is CSS-driven (see globals.css). */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  id?: string;
  /** Set while the drawer is off-canvas, to keep it out of the tab order. */
  inert?: boolean;
}

const ROLE_HOME: Record<UserRole, string> = {
  customer: "/tickets",
  agent: "/queue",
  manager: "/dashboard",
  admin: "/dashboard",
};

export function Sidebar({
  role,
  userName,
  userSubtitle,
  userAvatar,
  userStatus,
  queueCount = 0,
  notifications,
  unreadNotifications,
  inboxUnreadCount = 0,
  onSignOut,
  onGoHome,
  onNavigate,
  className,
  collapsed = false,
  onToggleCollapse,
  id,
  inert,
}: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const hasExactMatch = visibleItems.some((item) => pathname === item.href);

  return (
    <aside
      id={id}
      inert={inert}
      className={cn(
        "app-sidebar relative flex h-dvh flex-col border-r border-[var(--color-surface-600)] bg-[var(--color-surface-900)]",
        className
      )}
    >
      {/* Collapse tab: sits on the border itself rather than floating beside it. */}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          className="absolute -right-3 top-[68px] z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-brand-400)]/50 hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 lg:flex"
        >
          <ChevronLeft className="app-sidebar__collapse-icon h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

      <div className="app-sidebar__brand flex items-center gap-2 border-b border-[var(--color-surface-600)] px-3 py-3">
        <Link
          href={ROLE_HOME[role]}
          onClick={onNavigate}
          title={collapsed ? "HelpDesk AI" : undefined}
          className="app-sidebar__row flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--color-surface-800)]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-500)] shadow-lg shadow-blue-950/30">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div className="app-sidebar__identity min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">HelpDesk AI</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{role}</p>
          </div>
        </Link>
        <NotificationsBell notifications={notifications} unreadCount={unreadNotifications} align="left" />
      </div>

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto space-y-0.5 px-3 py-4">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const labelKey = role === "agent" && item.labelKey === "allTickets" ? "myTickets" : item.labelKey;
          const isActive = pathname === item.href || (!hasExactMatch && pathname.startsWith(item.href + "/"));

          return (
            <Link
              key={`${item.href}-${item.labelKey}`}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? t(labelKey) : undefined}
              className={cn(
                "app-sidebar__row relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                isActive
                  ? "border border-[var(--color-brand-400)]/25 bg-[var(--color-brand-500)]/12 text-[var(--color-brand-200)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-700)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="app-sidebar__label">{t(labelKey)}</span>
              {item.href === "/inbox" && inboxUnreadCount > 0 && (
                <span className="app-sidebar__badge ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-brand-500)] text-white text-[10px] font-semibold flex items-center justify-center">
                  {inboxUnreadCount > 9 ? "9+" : inboxUnreadCount}
                </span>
              )}
              {isActive && item.href !== "/inbox" && (
                <span className="app-sidebar__dot ml-auto h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" aria-hidden="true" />
              )}
              {isActive && item.href === "/inbox" && inboxUnreadCount === 0 && (
                <span className="app-sidebar__dot ml-auto h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" aria-hidden="true" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--color-surface-600)] px-3 pb-2 pt-2">
        <button
          type="button"
          onClick={onGoHome}
          title={collapsed ? t("home") : undefined}
          className="app-sidebar__row flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-surface-700)] hover:text-[var(--color-text-secondary)]"
        >
          <Home className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="app-sidebar__label">{t("home")}</span>
        </button>
      </div>

      {/* Theme and language pickers need their full width; the rail hides them. */}
      <div className="app-sidebar__wide-only border-t border-[var(--color-surface-600)]">
        <ThemeControl />
      </div>

      <div className="app-sidebar__wide-only border-t border-[var(--color-surface-600)]">
        <LocaleSwitcher />
      </div>

      <div className="border-t border-[var(--color-surface-600)] px-3 py-4">
        <div className="app-sidebar__row flex items-center gap-3 rounded-lg px-3 py-2.5">
          <PresenceAvatar
            name={userName}
            avatarUrl={userAvatar}
            status={userStatus}
            queueCount={role === "agent" || role === "manager" || role === "admin" ? queueCount : null}
            size="sm"
          />
          <div className="app-sidebar__identity min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{userName}</p>
            {userSubtitle && <p className="truncate text-[11px] text-[var(--color-text-muted)]">{userSubtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onSignOut}
            aria-label={t("signOut")}
            title={collapsed ? t("signOut") : undefined}
            className="app-sidebar__wide-only rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
