import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { normalizeSupabaseErrorMessage, createCompanyCustomerSchema } from "@/lib/validation/security";
import { getCanonicalOrganizationId } from "@/lib/organizations";
import { generateCif } from "@/lib/tax-id";
import { findAuthUserByEmail, USER_LOOKUP_FAILED_MESSAGE } from "@/lib/auth-admin-users";
import {
  planCustomerOnboarding,
  profileWriteMode,
  alreadyCustomerMessage,
  NEEDS_CONFIRMATION_MESSAGE,
  LINKED_ACCOUNT_NOTICE,
  INVITED_ACCOUNT_NOTICE,
} from "@/lib/customer-onboarding";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://ticket-system-sigma-pink.vercel.app";

// Phase 4A.14 §19: dedicated onboarding path for a company customer. Mirrors
// the individual route's server-imposed role/customer_type/organization_id/
// reference_code, but writes customers_info and accepts company-only fields
// (legal_name, trade_name, contact_person, website).
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

  const parsed = createCompanyCustomerSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const organizationId = await getCanonicalOrganizationId(svc);
  if (!organizationId) {
    return NextResponse.json(
      { error: "Canonical organization is not configured or is ambiguous" },
      { status: 500 }
    );
  }

  const lookup = await findAuthUserByEmail(svc, input.contact_email);
  if (!lookup.ok) {
    console.error("[admin/customers/company] user lookup failed", {
      email: input.contact_email,
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
      console.error("[admin/customers/company] profile lookup failed", {
        email: input.contact_email,
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
        existing_account: { email: input.contact_email },
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
      input.contact_email,
      {
        data: { full_name: input.contact_person },
        // Same as the individual endpoint: the set-password screen, not
        // /api/auth/callback. See the note there for why the callback could
        // never work for an invite.
        redirectTo: `${APP_URL}/reset-password`,
      }
    );
    if (inviteError || !invited?.user) {
      // See the note in the individual endpoint: GoTrue's generic message
      // names neither the address nor the constraint, so it goes to the log.
      console.error("[admin/customers/company] invite failed", {
        email: input.contact_email,
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

  // See profileWriteMode: an invited account already has the trigger's bare
  // profile row and is filled in; a linked one has none and is created.
  const profileFields = {
    id: userId,
    full_name: input.contact_person,
    organization_id: organizationId,
    role: "customer" as const,
    customer_type: "company" as const,
    is_active: true,
    phone: input.phone || null,
    address: input.address || null,
    city: input.city || null,
    postal_code: input.postal_code || null,
    country: input.country || null,
    website: input.website || null,
    contact_person: input.contact_person,
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
    console.error("[admin/customers/company] profile error:", profileError.message);
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

  const taxId = input.tax_id?.trim() || generateCif(input.legal_name);
  const { error: custError } = await svc.from("hd_customers_info").upsert(
    {
      id: userId,
      company_name: input.legal_name,
      industry: input.trade_name?.trim() ?? "",
      business_details: "",
      tax_id: taxId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (custError) console.error("[admin/customers/company] customers_info error:", custError.message);

  const { data: profileRow } = await svc
    .from("hd_profiles")
    .select("reference_code")
    .eq("id", userId)
    .single();

  // The admin always leaves holding a working way in, on both paths. A linked
  // account never received an invitation at all; an invited one received an
  // email that may be rate-limited into oblivion and ends at a set-password
  // screen nobody supervises. The link is generated, never sent -- there is no
  // verified sender domain, so an automatic send would fail silently.
  //
  // Safe to mint next to the invitation: auth.one_time_tokens is unique on
  // (user_id, token_type), and an invite occupies confirmation_token while a
  // magic link occupies recovery_token. Different rows; the invitation email
  // keeps working.
  const { data: link, error: linkError } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email: input.contact_email,
    options: { redirectTo: `${APP_URL}/tickets` },
  });
  if (linkError) {
    // The customer exists and is correct; only the convenience link is
    // missing, so this does not fail the request.
    console.error("[admin/customers/company] magic link failed", {
      email: input.contact_email,
      message: linkError.message,
    });
  }
  const accessLink = link?.properties?.action_link ?? null;

  return NextResponse.json({
    user: {
      id: userId,
      email: input.contact_email,
      legal_name: input.legal_name,
      tax_id: taxId,
      reference_code: profileRow?.reference_code ?? null,
    },
    invitationState,
    notice: plan.kind === "link_existing" ? LINKED_ACCOUNT_NOTICE : INVITED_ACCOUNT_NOTICE,
    access_link: accessLink,
  });
}
