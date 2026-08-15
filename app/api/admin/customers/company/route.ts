import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { normalizeSupabaseErrorMessage, createCompanyCustomerSchema } from "@/lib/validation/security";
import { getCanonicalOrganizationId } from "@/lib/organizations";
import { generateCif } from "@/lib/tax-id";
import { findAuthUserByEmail, USER_LOOKUP_FAILED_MESSAGE } from "@/lib/auth-admin-users";

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

  let userId: string;
  let invitationState: "invited" | "already_existing_user" = "invited";
  const alreadyExists = lookup.user !== null;

  if (lookup.user) {
    invitationState = "already_existing_user";
    userId = lookup.user.id;
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

  const { error: profileError } = await svc.from("hd_profiles").upsert(
    {
      id: userId,
      full_name: input.contact_person,
      organization_id: organizationId,
      role: "customer",
      customer_type: "company",
      is_active: true,
      phone: input.phone || null,
      address: input.address || null,
      city: input.city || null,
      postal_code: input.postal_code || null,
      country: input.country || null,
      website: input.website || null,
      contact_person: input.contact_person,
      locale: input.locale,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("[admin/customers/company] profile error:", profileError.message);
    if (!alreadyExists) await svc.auth.admin.deleteUser(userId);
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

  return NextResponse.json({
    user: {
      id: userId,
      email: input.contact_email,
      legal_name: input.legal_name,
      tax_id: taxId,
      reference_code: profileRow?.reference_code ?? null,
    },
    invitationState,
  });
}
