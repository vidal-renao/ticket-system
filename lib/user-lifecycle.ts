/**
 * Who an administrator is allowed to act on, and what the account states mean.
 *
 * Three endpoints reach for this -- password reset, freeze, soft-delete -- and
 * the rule is identical for all three, so it lives here rather than being
 * written out three times and drifting apart the way the two customer-creation
 * routes did before `auth-admin-users` pulled them together.
 */

import type { UserRole } from "@/lib/supabase/types";

/**
 * The only roles an administrator may act on.
 *
 * Managers are protected alongside administrators, deliberately: the point of
 * the rule is that nobody with authority over the system can be locked out of
 * it through the same screen they administer it from. Demote first, then act
 * -- which leaves a trail and takes a second decision.
 */
export const ACTIONABLE_ROLES = ["agent", "customer"] as const;
export type ActionableRole = (typeof ACTIONABLE_ROLES)[number];

export type LifecycleRefusal =
  /** The caller is not an administrator. */
  | "not_admin"
  /** No such account, or it belongs to another tenant. Reported as 404. */
  | "not_found"
  /** An administrator or manager. Protected regardless of who is asking. */
  | "protected_role"
  /** The caller is the target. No self-service through the admin door. */
  | "self";

export type LifecyclePermission =
  | { allowed: true; role: ActionableRole }
  | { allowed: false; refusal: LifecycleRefusal };

/** The HTTP status each refusal answers with. */
export const REFUSAL_STATUS: Record<LifecycleRefusal, 403 | 404> = {
  not_admin: 403,
  // Deliberately 404, not 403: an administrator of another tenant should not
  // be able to confirm an account exists here by the shape of the refusal.
  not_found: 404,
  protected_role: 403,
  self: 403,
};

export const REFUSAL_MESSAGE: Record<LifecycleRefusal, string> = {
  not_admin: "Forbidden",
  not_found: "Not found",
  protected_role: "Administrators and managers cannot be modified here",
  self: "You cannot perform this action on your own account",
};

export function isActionableRole(role: string | null | undefined): role is ActionableRole {
  return role === "agent" || role === "customer";
}

/**
 * The single gate. Order matters: tenancy is checked before role, so a target
 * in another organization is always a 404 and never leaks that it happens to
 * be an administrator over there.
 */
export function canAdministerUser(input: {
  actor: { id: string; role: UserRole | string | null; organizationId: string | null };
  target: { id: string; role: UserRole | string | null; organizationId: string | null } | null;
}): LifecyclePermission {
  const { actor, target } = input;

  if (actor.role !== "admin" || !actor.organizationId) {
    return { allowed: false, refusal: "not_admin" };
  }

  if (!target || !target.organizationId || target.organizationId !== actor.organizationId) {
    return { allowed: false, refusal: "not_found" };
  }

  if (target.id === actor.id) {
    return { allowed: false, refusal: "self" };
  }

  if (!isActionableRole(target.role)) {
    return { allowed: false, refusal: "protected_role" };
  }

  return { allowed: true, role: target.role };
}

// ─── Account state ──────────────────────────────────────────────────────────

/**
 * What an administrator sees against an account, in the order that matters.
 *
 * There are two stored facts -- `deleted_at` on the profile and whether the
 * account is frozen -- and deletion wins the display, because a deleted
 * account is also frozen and saying so twice helps nobody.
 */
export type AccountState = "active" | "frozen" | "deleted";

/**
 * Takes the profile row's own field names rather than camel-cased ones: this
 * is read straight off a `hd_profiles` row in half a dozen places, and a
 * translation step at every call site is a translation step to get wrong.
 */
export function accountState(account: {
  deleted_at?: string | null;
  is_active?: boolean | null;
}): AccountState {
  if (account.deleted_at) return "deleted";
  // Null reads as active: the column defaults to true and predates this
  // feature, so an untouched row is a working account, not a frozen one.
  return account.is_active === false ? "frozen" : "active";
}

/**
 * May new work be sent here?
 *
 * Deliberately narrower than "may we name this person". A ticket assigned to
 * somebody who has since left keeps showing their name, and their comments
 * keep their author -- that history is the reason the delete is soft. What
 * stops is being offered as somewhere to send work next.
 */
export function isAssignable(account: {
  is_active?: boolean | null;
  deleted_at?: string | null;
}): boolean {
  return accountState(account) === "active";
}

/**
 * GoTrue expresses a ban as a duration from now, not as a date, and has no
 * "forever". A century is the idiom, and `freeze` is reversible by design --
 * this is the number that gets lifted, not one anybody waits out.
 */
export const FREEZE_BAN_DURATION = "876000h";

/** GoTrue's literal for lifting a ban. Not an empty string, not null. */
export const UNFREEZE_BAN_DURATION = "none";

export function banDurationFor(action: "freeze" | "unfreeze"): string {
  return action === "freeze" ? FREEZE_BAN_DURATION : UNFREEZE_BAN_DURATION;
}
