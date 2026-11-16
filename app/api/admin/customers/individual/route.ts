import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { normalizeSupabaseErrorMessage } from "@/lib/validation/security";
import { createIndividualCustomerSchema } from "@/lib/validation/security";
import { getCanonicalOrganizationId } from "@/lib/organizations";
import { findAuthUserByEmail, USER_LOOKUP_FAILED_MESSAGE } from "@/lib/auth-admin-users";
import {
  planCustomerOnboarding,
  profileWriteMode,
  alreadyCustomerMessage,
  NEEDS_CONFIRMATION_MESSAGE,
  LINKED_ACCOUNT_NOTICE,
  INVITED_ACCOUNT_NOTICE,
  INVITE_HANDOFF_NOTICE,
} from "@/lib/customer-onboarding";
import { appUrl } from "@/lib/app-url";
import { inviteCustomerAccount } from "@/lib/customer-invite";
import { decideLinkHandoff, logLinkIssuance } from "@/lib/link-handoff";

const APP_URL = appUrl();

// Phase 4A.14 §18: dedicated onboarding path for an individual customer.
// role, customer_type, organization_id and reference_code are all imposed
// here, server-side, from constants -- none of them are read from the
// request body, so a manipulated payload cannot turn this into a company
// or another tenant/role.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClientStatic();
  const { data: adminProfile } = await svc
    .from("hd_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!adminProfile || adminProfile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createIndividualCustomerSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const organizationId = await getCanonicalOrganizationId(svc);
  if (!organizationId) {
    // Fails closed: never falls back to an org read from the client.
    return NextResponse.json(
      { error: "Canonical organization is not configured or is ambiguous" },
      { status: 500 }
    );
  }

  const fullName = `${input.first_name} ${input.last_name}`.trim();

  const lookup = await findAuthUserByEmail(svc, input.email);
  if (!lookup.ok) {
    console.error("[admin/customers/individual] user lookup failed", {
      email: input.email,
      reason: lookup.reason,
      message: lookup.message,
    });
    // 503, not 400: the request was fine, we just cannot answer it right now.
    return NextResponse.json({ error: USER_LOOKUP_FAILED_MESSAGE }, { status: 503 });
  }

  // Does that account already have a customer profile here? Answered before
  // anything is written, because the answer decides whether writing is allowed
  // at all.
  let existingProfile: { referenceCode: string | null } | null = null;
  if (lookup.user) {
    const { data: row, error: rowError } = await svc
      .from("hd_profiles")
      .select("reference_code")
      .eq("id", lookup.user.id)
      .maybeSingle();
    if (rowError) {
      console.error("[admin/customers/individual] profile lookup failed", {
        email: input.email,
        message: rowError.message,
      });
      return NextResponse.json({ error: USER_LOOKUP_FAILED_MESSAGE }, { status: 503 });
    }
    if (row) existingProfile = { referenceCode: row.reference_code ?? null };
  }

  const plan = planCustomerOnboarding({
    existingUserId: lookup.user?.id ?? null,
    existingProfile,
    confirmedLink: input.link_existing_user,
  });

  if (plan.kind === "already_customer") {
    return NextResponse.json(
      { error: alreadyCustomerMessage(plan.referenceCode), reference_code: plan.referenceCode },
      { status: 409 }
    );
  }

  if (plan.kind === "needs_confirmation") {
    // Nothing written. The client re-submits the same body with
    // link_existing_user: true once the admin has agreed.
    return NextResponse.json(
      {
        error: NEEDS_CONFIRMATION_MESSAGE,
        requires_confirmation: true,
        existing_account: { email: input.email },
      },
      { status: 409 }
    );
  }

  let userId: string;
  const invitationState: "invited" | "linked_existing_user" =
    plan.kind === "link_existing" ? "linked_existing_user" : "invited";

  let inviteEmailDelivered = false;
  let inviteLink: string | null = null;

  if (plan.kind === "link_existing") {
    userId = plan.userId;
  } else {
    // Invites by email. If -- and only if -- GoTrue could not send the mail
    // and ADMIN_LINK_HANDOFF is on, the account is created without mail and
    // its invite link becomes eligible for hand-off (lib/customer-invite.ts).
    // The destination is the set-password screen, not /api/auth/callback: an
    // admin-generated invite has no PKCE verifier in the recipient's browser,
    // so GoTrue returns the credentials in the URL fragment, which never
    // reaches a server route.
    const invite = await inviteCustomerAccount(
      svc,
      input.email,
      { data: { full_name: fullName }, redirectTo: `${APP_URL}/reset-password` },
      process.env.ADMIN_LINK_HANDOFF
    );
    if (!invite.ok) {
      // Never swallowed. GoTrue reports a duplicate address as a generic
      // "Database error saving new user" with no hint of which address, so
      // the driver's own message has to reach the log.
      console.error("[admin/customers/individual] invite failed", {
        email: input.email,
        status: invite.error?.status ?? null,
        code: invite.error?.code ?? null,
        message: invite.error?.message ?? "invite returned no user",
        emailFailure: invite.emailFailure,
      });
      return NextResponse.json(
        {
          error: invite.emailFailure
            ? "The invitation email could not be sent, so no account was created. Try again later."
            : normalizeSupabaseErrorMessage(invite.error),
          email_sent: false,
        },
        { status: invite.emailFailure ? 502 : 400 }
      );
    }
    userId = invite.userId;
    inviteEmailDelivered = invite.emailDelivered;
    inviteLink = invite.link;
  }

  // See profileWriteMode: an invited account already has the trigger's bare
  // profile row and is filled in; a linked one has none and is created.
  const profileFields = {
    id: userId,
    full_name: fullName,
    organization_id: organizationId,
    role: "customer" as const,
    customer_type: "individual" as const,
    is_active: true,
    phone: input.phone || null,
    address: input.address || null,
    city: input.city || null,
    postal_code: input.postal_code || null,
    country: input.country || null,
    locale: input.locale,
    // Records that *we* emailed an invitation, which is what makes an account
    // that never completes one detectable later. A linked account was never
    // invited -- it already had credentials -- so it stays null.
    invited_at: plan.kind === "invite" ? new Date().toISOString() : null,
  };
  const profiles = svc.from("hd_profiles");
  const { error: profileError } =
    profileWriteMode(plan.kind) === "fill"
      ? await profiles.upsert(profileFields, { onConflict: "id" })
      : await profiles.insert(profileFields);

  if (profileError) {
    console.error("[admin/customers/individual] profile error:", profileError.message);
    // An account this request created never outlives the request that failed.
    // Returning before this cleanup is what left an orphaned auth user, whose
    // bare trigger profile then rejected every retry as an existing customer.
    if (plan.kind === "invite") {
      await svc.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
    }
    // Linking: the only conflict possible is a profile that appeared between
    // our check and this write. The pre-existing account is left untouched.
    if (profileError.code === "23505") {
      return NextResponse.json({ error: alreadyCustomerMessage(null) }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }

  const { data: profileRow } = await svc
    .from("hd_profiles")
    .select("reference_code")
    .eq("id", userId)
    .single();

  // SEC-02 / ADR-016. No sign-in link is minted for the admin any more:
  //   - linked account: it has its own credentials and was sent nothing;
  //   - invited, mail accepted by Supabase Auth: the invitation is the way in;
  //   - invited, mail failed, ADMIN_LINK_HANDOFF=true: the invite link itself.
  const handoff = decideLinkHandoff({
    kind: plan.kind === "link_existing" ? "link_existing" : "invite",
    emailDelivered: inviteEmailDelivered,
    flag: process.env.ADMIN_LINK_HANDOFF,
    link: inviteLink,
  });
  if (plan.kind === "invite") {
    logLinkIssuance({
      source: "admin/customers/individual",
      actorId: user.id,
      targetUserId: userId,
      organizationId,
      linkType: "invite",
      emailDelivered: inviteEmailDelivered,
      decision: handoff,
    });
  }

  return NextResponse.json({
    user: {
      id: userId,
      email: input.email,
      full_name: fullName,
      reference_code: profileRow?.reference_code ?? null,
    },
    invitationState,
    notice:
      plan.kind === "link_existing"
        ? LINKED_ACCOUNT_NOTICE
        : handoff.handedToAdmin
          ? INVITE_HANDOFF_NOTICE
          : INVITED_ACCOUNT_NOTICE,
    // null for a linked account: nothing was sent and nothing was meant to be.
    email_sent: plan.kind === "invite" ? inviteEmailDelivered : null,
    access_link: handoff.link,
    link_handoff: handoff.reason,
  });
}
