import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { appUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email";
import { normalizeSupabaseErrorMessage } from "@/lib/validation/security";
import {
  REFUSAL_MESSAGE,
  REFUSAL_STATUS,
  canAdministerUser,
} from "@/lib/user-lifecycle";

/**
 * An administrator starts a password recovery for an agent or a customer.
 *
 * The administrator never sees or sets the password -- this mints the same
 * recovery link the person would have requested themselves, and the
 * /reset-password screen does the rest.
 *
 * Two things about how the link is made, both deliberate:
 *
 * `generateLink` rather than `resetPasswordForEmail`. The browser flow is PKCE,
 * and the code verifier is a cookie on the origin that *asked* for the link. If
 * the administrator's browser asked, the verifier is in the administrator's
 * browser, and the recipient opens a link their browser has no verifier for --
 * which is precisely the failure the /reset-password screen now names as
 * "opened in a different browser". Generated server-side there is no challenge,
 * so GoTrue returns an implicit grant in the fragment and the link works in any
 * browser. The reset screen already handles that shape; invitations arrive the
 * same way.
 *
 * One link, delivered twice. `auth.one_time_tokens` is unique on
 * (user_id, token_type), so minting a second recovery token silently voids the
 * first -- calling `resetPasswordForEmail` for the email *and* `generateLink`
 * for the administrator's copy would hand over a link that had already been
 * invalidated by the other. So the link is generated once and this route mails
 * that exact link itself, which also means the administrator's copy and the
 * recipient's copy are the same working link.
 */
export async function POST(
  _request: Request,
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
    .select("id, role, organization_id, full_name, deleted_at")
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

  // A deleted account is barred from signing in, so a recovery link for one
  // would end at a login it cannot pass. Restore first.
  if (target!.deleted_at) {
    return NextResponse.json(
      { error: "This account is deleted. Restore it before sending a recovery link." },
      { status: 409 }
    );
  }

  const { data: authUser, error: lookupError } = await svc.auth.admin.getUserById(targetId);
  const email = authUser?.user?.email;
  if (lookupError || !email) {
    console.error("[admin/users/password-reset] no address for user", {
      targetId,
      message: lookupError?.message ?? "user has no email",
    });
    return NextResponse.json({ error: "This account has no email address" }, { status: 409 });
  }

  const { data: link, error: linkError } = await svc.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${appUrl()}/reset-password` },
  });

  if (linkError || !link?.properties?.action_link) {
    console.error("[admin/users/password-reset] generateLink failed", {
      targetId,
      message: linkError?.message ?? "no action link returned",
    });
    return NextResponse.json(
      { error: normalizeSupabaseErrorMessage(linkError) },
      { status: 502 }
    );
  }

  const actionLink = link.properties.action_link;
  const name = target!.full_name?.trim() || "there";

  const delivery = await sendEmail({
    to: email,
    subject: "Set a new password for HelpDesk AI",
    text:
      `Hi ${name},\n\n` +
      `An administrator started a password reset for your HelpDesk AI account.\n` +
      `Open the link below to choose a new password:\n\n` +
      `${actionLink}\n\n` +
      `The link is valid for a short time. If it has expired by the time you open it, ` +
      `the page will offer you a fresh one.\n\n` +
      `If you did not expect this, you can ignore this message -- your current password ` +
      `still works until a new one is set.\n`,
  });

  return NextResponse.json({
    email,
    action_link: actionLink,
    // The administrator is told the truth about the mail rather than a hopeful
    // "sent", because the fallback -- handing the link over directly -- is only
    // taken by someone who knows the mail did not go.
    email_sent: delivery.delivered,
    email_skipped_reason: delivery.delivered ? null : delivery.reason,
  });
}
