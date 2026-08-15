import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { normalizeSupabaseErrorMessage } from "@/lib/validation/security";
import { createIndividualCustomerSchema } from "@/lib/validation/security";
import { getCanonicalOrganizationId } from "@/lib/organizations";
import { findAuthUserByEmail, USER_LOOKUP_FAILED_MESSAGE } from "@/lib/auth-admin-users";

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

  let userId: string;
  let invitationState: "invited" | "already_existing_user" = "invited";
  const alreadyExists = lookup.user !== null;

  if (lookup.user) {
    invitationState = "already_existing_user";
    userId = lookup.user.id;
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

  const { error: profileError } = await svc.from("hd_profiles").upsert(
    {
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
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("[admin/customers/individual] profile error:", profileError.message);
    if (!alreadyExists) await svc.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }

  const { data: profileRow } = await svc
    .from("hd_profiles")
    .select("reference_code")
    .eq("id", userId)
    .single();

  return NextResponse.json({
    user: {
      id: userId,
      email: input.email,
      full_name: fullName,
      reference_code: profileRow?.reference_code ?? null,
    },
    invitationState,
  });
}
