import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { setAccountFrozen } from "@/lib/user-lifecycle-server";
import {
  REFUSAL_MESSAGE,
  REFUSAL_STATUS,
  canAdministerUser,
} from "@/lib/user-lifecycle";

type DeleteAction = "delete" | "restore";

/**
 * Soft-delete an account, or bring it back.
 *
 * Never a physical delete, and not out of caution in the abstract -- the
 * foreign keys on this instance say what one would do. auth.users cascades
 * into hd_profiles, which cascades into hd_ticket_comments: deleting a
 * customer who has ever commented erases their comments from tickets belonging
 * to other people. And hd_tickets.assigned_to is NO ACTION, so deleting anyone
 * who was ever assigned work fails on a constraint instead. One outcome is
 * loud, one is silent, and the silent one is worse. There is no route here
 * that calls admin.deleteUser, deliberately.
 *
 * So the account is marked, not removed: hidden from every directory, barred
 * from signing in, and every comment, ticket and audit row it is attached to
 * stays exactly where it is and keeps naming it.
 *
 * Deleting freezes as well -- the two are not independent, and an account that
 * is hidden but can still sign in would be the worst of both. Restoring does
 * *not* unfreeze: it puts the account back in the directory, frozen, and
 * handing sign-in back is a second, deliberate click.
 *
 * The typed confirmation mirrors POST /api/admin/tickets/cleanup, which is the
 * other place in this application where an administrator removes something in
 * bulk and can put it back.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClientStatic();
  const actor = await getCurrentProfile(svc, user.id);

  const { data: target } = await svc
    .from("hd_profiles")
    .select("id, role, organization_id, deleted_at")
    .eq("id", targetId)
    .maybeSingle();

  const permission = canAdministerUser({
    actor: { id: user.id, role: actor?.role ?? null, organizationId: actor?.organization_id ?? null },
    target: target
      ? { id: target.id, role: target.role, organizationId: target.organization_id }
      : null,
  });

  if (!permission.allowed) {
    return NextResponse.json(
      { error: REFUSAL_MESSAGE[permission.refusal] },
      { status: REFUSAL_STATUS[permission.refusal] }
    );
  }

  let body: { action?: unknown; confirmation?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "delete" && body.action !== "restore") {
    return NextResponse.json({ error: "Action must be delete or restore" }, { status: 400 });
  }
  const action = body.action as DeleteAction;

  const expectedConfirmation = action.toUpperCase();
  if (body.confirmation !== expectedConfirmation) {
    return NextResponse.json(
      { error: `Confirmation must be ${expectedConfirmation}` },
      { status: 400 }
    );
  }

  const alreadyDeleted = Boolean(target!.deleted_at);
  if (action === "delete" && alreadyDeleted) {
    return NextResponse.json({ error: "This account is already deleted" }, { status: 409 });
  }
  if (action === "restore" && !alreadyDeleted) {
    return NextResponse.json({ error: "This account is not deleted" }, { status: 409 });
  }

  const organizationId = actor!.organization_id!;

  if (action === "delete") {
    // Freeze first. If the mark lands and the ban does not, the account is
    // invisible to administrators and can still sign in -- hidden from the
    // people who would notice, which is precisely backwards.
    const frozen = await setAccountFrozen(svc, {
      userId: targetId,
      frozen: true,
      organizationId,
    });
    if (!frozen.ok) {
      return NextResponse.json({ error: frozen.message }, { status: 502 });
    }
  }

  const patch =
    action === "delete"
      ? { deleted_at: new Date().toISOString(), deleted_by: user.id }
      : { deleted_at: null, deleted_by: null };

  const { error } = await svc
    .from("hd_profiles")
    .update(patch)
    .eq("id", targetId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("[admin/users/delete] write failed", { targetId, action, message: error.message });
    if (action === "delete") {
      // The freeze went through and the mark did not; undo the freeze so the
      // account is left exactly as it was found.
      await setAccountFrozen(svc, { userId: targetId, frozen: false, organizationId });
    }
    return NextResponse.json({ error: "Could not update the account" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deleted: action === "delete",
    // Restoring leaves the account frozen on purpose, and the caller says so.
    is_active: false,
  });
}
