import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { normalizeSupabaseErrorMessage } from "@/lib/validation/security";
import { createIndividualCustomerSchema } from "@/lib/validation/security";
import { getCanonicalOrganizationId } from "@/lib/organizations";
import { findAuthUserByEmail, USER_LOOKUP_FAILED_MESSAGE } from "@/lib/auth-admin-users";
import {
  planCustomerOnboarding,
  alreadyCustomerMessage,
  NEEDS_CONFIRMATION_MESSAGE,
  LINKED_ACCOUNT_NOTICE,
} from "@/lib/customer-onboarding";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://ticket-system-sigma-pink.vercel.app";

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

  if (plan.kind === "link_existing") {
    userId = plan.userId;
  } else {
    const { data: invited, error: inviteError } = await svc.auth.admin.inviteUserByEmail(
      input.email,
      {
        data: { full_name: fullName },
        // Straight to the set-password screen, the same destination the
        // password reset uses. Not /api/auth/callback: that route reads a
        // `code` query parameter, and an admin-generated invite has no PKCE
        // verifier in the recipient's browser, so GoTrue completes it as an
        // implicit grant and returns the credentials in the URL *fragment*.
        // Fragments never reach the server, so the callback saw no code and
        // bounced every invitee to /login?error=missing_code.
        redirectTo: `${APP_URL}/reset-password`,
      }
    );
    if (inviteError || !invited?.user) {
      // Never swallowed. GoTrue reports a duplicate address as a generic
      // "Database error saving new user" with no hint of which address, which
      // is unreadable from the outside; the address and the driver's own
      // message have to reach the log or the next diagnosis starts from zero.
      console.error("[admin/customers/individual] invite failed", {
        email: input.email,
        status: inviteError?.status ?? null,
        code: inviteError?.code ?? null,
        message: inviteError?.message ?? "invite returned no user",
      });
      return NextResponse.json(
        { error: normalizeSupabaseErrorMessage(inviteError) },
        { status: 400 }
      );
    }
    userId = invited.user.id;
  }

  // insert, not upsert. Every path that reaches here has established there is
  // no profile for this id, so a conflict can only mean one appeared in
  // between -- which is the already_customer case, not something to overwrite.
  // The previous upsert rewrote organization_id, role and customer_type from
  // the form for anyone who already had a row.
  const { error: profileError } = await svc.from("hd_profiles").insert({
    id: userId,
    full_name: fullName,
    organization_id: organizationId,
    role: "customer",
    customer_type: "individual",
    is_active: true,
    phone: input.phone || null,
    address: input.address || null,
    city: input.city || null,
    postal_code: input.postal_code || null,
    country: input.country || null,
    locale: input.locale,
  });

  if (profileError) {
    console.error("[admin/customers/individual] profile error:", profileError.message);
    if (profileError.code === "23505") {
      return NextResponse.json({ error: alreadyCustomerMessage(null) }, { status: 409 });
    }
    // Only an account this request created is cleaned up. A pre-existing one
    // belongs to another application and must survive our failure.
    if (plan.kind === "invite") await svc.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }

  const { data: profileRow } = await svc
    .from("hd_profiles")
    .select("reference_code")
    .eq("id", userId)
    .single();

  // A linked account never received an invitation email, so it has no way of
  // knowing it is now a customer here. The link is handed to the admin rather
  // than sent: there is no verified sender domain, and an automatic send would
  // fail silently.
  let accessLink: string | null = null;
  if (plan.kind === "link_existing") {
    const { data: link, error: linkError } = await svc.auth.admin.generateLink({
      type: "magiclink",
      email: input.email,
      options: { redirectTo: `${APP_URL}/tickets` },
    });
    if (linkError) {
      // The customer exists and is correct; only the convenience link is
      // missing, so this does not fail the request.
      console.error("[admin/customers/individual] magic link failed", {
        email: input.email,
        message: linkError.message,
      });
    }
    accessLink = link?.properties?.action_link ?? null;
  }

  return NextResponse.json({
    user: {
      id: userId,
      email: input.email,
      full_name: fullName,
      reference_code: profileRow?.reference_code ?? null,
    },
    invitationState,
    ...(plan.kind === "link_existing"
      ? { notice: LINKED_ACCOUNT_NOTICE, access_link: accessLink }
      : {}),
  });
}
