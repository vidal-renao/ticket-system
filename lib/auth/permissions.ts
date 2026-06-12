import { createClient, createServiceClientStatic } from "@/lib/supabase/server";

export type AppRole = "admin" | "employee" | "customer";
export type LegacyRole = AppRole | "agent" | "manager";
export type CustomerStatus = "pending" | "active" | "blocked" | "archived";

export interface UserContext {
  userId: string;
  email: string | null;
  role: AppRole;
  rawRole: string;
  organizationId: string | null;
  customerStatus: CustomerStatus;
  disabledAt: string | null;
}

export interface TicketPermissionTarget {
  id?: string;
  organization_id: string;
  created_by: string;
  assigned_to?: string | null;
}

export function normalizeRole(role: string | null | undefined): AppRole {
  if (role === "admin" || role === "manager") return "admin";
  if (role === "employee" || role === "agent") return "employee";
  return "customer";
}

export function isAdmin(ctx: UserContext | null | undefined): boolean {
  return !!ctx && !ctx.disabledAt && ctx.role === "admin";
}

export function isEmployee(ctx: UserContext | null | undefined): boolean {
  return !!ctx && !ctx.disabledAt && ctx.role === "employee";
}

export function isCustomer(ctx: UserContext | null | undefined): boolean {
  return !!ctx && !ctx.disabledAt && ctx.role === "customer";
}

export function isActiveCustomer(ctx: UserContext | null | undefined): boolean {
  return !!ctx && isCustomer(ctx) && ctx.customerStatus === "active";
}

export async function getCurrentUserContext(): Promise<UserContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, organization_id, customer_status, disabled_at")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const rawRole = String(profile.role ?? "customer");
  return {
    userId: user.id,
    email: user.email ?? null,
    role: normalizeRole(rawRole),
    rawRole,
    organizationId: profile.organization_id ?? null,
    customerStatus: (profile.customer_status as CustomerStatus | null) ?? "active",
    disabledAt: profile.disabled_at ?? null,
  };
}

function sameOrg(ctx: UserContext, ticket: TicketPermissionTarget): boolean {
  return !!ctx.organizationId && ctx.organizationId === ticket.organization_id;
}

export function canViewTicket(ctx: UserContext | null, ticket: TicketPermissionTarget): boolean {
  if (!ctx || ctx.disabledAt || !sameOrg(ctx, ticket)) return false;
  if (ctx.role === "admin") return true;
  if (ctx.role === "employee") {
    return ticket.assigned_to === ctx.userId || ticket.created_by === ctx.userId;
  }
  return ctx.customerStatus === "active" && ticket.created_by === ctx.userId;
}

export function canCreateTicket(ctx: UserContext | null): boolean {
  if (!ctx || ctx.disabledAt || !ctx.organizationId) return false;
  if (ctx.role === "admin" || ctx.role === "employee") return true;
  return ctx.role === "customer" && ctx.customerStatus === "active";
}

export function canAssignTicket(ctx: UserContext | null, ticket?: TicketPermissionTarget): boolean {
  if (!isAdmin(ctx)) return false;
  return ticket ? sameOrg(ctx!, ticket) : true;
}

export function canUpdateTicketStatus(ctx: UserContext | null, ticket: TicketPermissionTarget): boolean {
  if (!ctx || ctx.disabledAt || !sameOrg(ctx, ticket)) return false;
  if (ctx.role === "admin") return true;
  return ctx.role === "employee" && (ticket.assigned_to === ctx.userId || ticket.created_by === ctx.userId);
}

export function canViewInternalMessages(ctx: UserContext | null, ticket: TicketPermissionTarget): boolean {
  if (!ctx || ctx.disabledAt || !sameOrg(ctx, ticket)) return false;
  if (ctx.role === "admin") return true;
  return ctx.role === "employee" && (ticket.assigned_to === ctx.userId || ticket.created_by === ctx.userId);
}

export function canViewCustomerMessages(ctx: UserContext | null, ticket: TicketPermissionTarget): boolean {
  return canViewTicket(ctx, ticket);
}

export function canManageUsers(ctx: UserContext | null): boolean {
  return isAdmin(ctx);
}

export function canViewAuditLogs(ctx: UserContext | null): boolean {
  return isAdmin(ctx);
}
