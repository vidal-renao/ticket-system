import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { normalizeSupabaseErrorMessage } from "@/lib/validation/security";
import { createIndividualCustomerSchema } from "@/lib/validation/security";
import { getCanonicalOrganizationId } from "@/lib/organizations";

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

  const { data: existingUsers } = await svc.auth.admin.listUsers();
  const alreadyExists = existingUsers?.users.some(
    (u) => u.email?.toLowerCase() === input.email.toLowerCase()
  );

  let userId: string;
  let invitationState: "invited" | "already_existing_user" = "invited";

  if (alreadyExists) {
    invitationState = "already_existing_user";
    const existing = existingUsers!.users.find(
      (u) => u.email?.toLowerCase() === input.email.toLowerCase()
    )!;
    userId = existing.id;
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
