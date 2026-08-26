import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { setAccountFrozen } from "@/lib/user-lifecycle-server";
import {
  REFUSAL_MESSAGE,
  REFUSAL_STATUS,
  canAdministerUser,
} from "@/lib/user-lifecycle";

/**
 * Freeze an account, or lift the freeze.
 *
 * Reversible by design and by name: this is the action for somebody on leave,
 * under investigation, or between contracts. Nothing is destroyed and nothing
 * is hidden -- a frozen agent still appears in the directory, still owns their
 * tickets, still shows in the history of everything they did.
 *
 * No typed confirmation here, unlike deletion: freezing is a single click to
 * undo, and asking an administrator to type a word to stop somebody signing in
 * during an incident is friction pointed the wrong way.
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

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "freeze" && body.action !== "unfreeze") {
    return NextResponse.json({ error: "Action must be freeze or unfreeze" }, { status: 400 });
  }

  // A deleted account is already barred, and unfreezing one would promise
  // access that the sign-in path will refuse anyway. The two states are
  // ordered on purpose: restore first, then decide about the freeze.
  if (target!.deleted_at) {
    return NextResponse.json(
      { error: "This account is deleted. Restore it first." },
      { status: 409 }
    );
  }

  const frozen = body.action === "freeze";
  const result = await setAccountFrozen(svc, {
    userId: targetId,
    frozen,
    organizationId: actor!.organization_id!,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, is_active: !frozen });
}
