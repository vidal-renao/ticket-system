import type { createServiceClientStatic } from "@/lib/supabase/server";
import { banDurationFor } from "@/lib/user-lifecycle";

type ServiceClient = ReturnType<typeof createServiceClientStatic>;

export type FreezeOutcome =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Freeze or unfreeze an account, both halves or neither.
 *
 * "Frozen" is one state with two homes, and that is the whole point of this
 * function existing. `hd_profiles.is_active` already kept an agent out of
 * automatic routing and out of manual assignment, but it never stopped anyone
 * signing in -- the login route did not look at it. So "Deactivate", under a
 * trash-can icon, produced someone who could still log in and, if a customer,
 * still open tickets. The ban in GoTrue is the half that was missing.
 *
 * Order is deliberate: the profile row is written first because it records the
 * intent, then the ban is applied because it does the enforcing. If the ban
 * fails, the profile write is put back and the caller is told the freeze did
 * not happen -- reporting success on a freeze whose login block never landed
 * is the one outcome worth this much care.
 *
 * Between the two writes there is a moment where a freezing account is out of
 * routing but can still sign in. That is the harmless direction, and it lasts
 * one round trip.
 */
export async function setAccountFrozen(
  svc: ServiceClient,
  input: { userId: string; frozen: boolean; organizationId: string }
): Promise<FreezeOutcome> {
  const { error: profileError } = await svc
    .from("hd_profiles")
    .update({ is_active: !input.frozen })
    .eq("id", input.userId)
    .eq("organization_id", input.organizationId);

  if (profileError) {
    console.error("[user-lifecycle] profile write failed", {
      userId: input.userId,
      frozen: input.frozen,
      message: profileError.message,
    });
    return { ok: false, message: "Could not update the account status" };
  }

  const { error: banError } = await svc.auth.admin.updateUserById(input.userId, {
    ban_duration: banDurationFor(input.frozen ? "freeze" : "unfreeze"),
  });

  if (banError) {
    console.error("[user-lifecycle] ban write failed, reverting profile", {
      userId: input.userId,
      frozen: input.frozen,
      message: banError.message,
    });
    // Back to where we started, so the directory does not show a freeze that
    // the sign-in path would not honour.
    await svc
      .from("hd_profiles")
      .update({ is_active: input.frozen })
      .eq("id", input.userId)
      .eq("organization_id", input.organizationId);

    return {
      ok: false,
      message: input.frozen
        ? "Could not block sign-in for this account; nothing was changed"
        : "Could not restore sign-in for this account; nothing was changed",
    };
  }

  return { ok: true };
}
