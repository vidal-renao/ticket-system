import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClientStatic } from "@/lib/supabase/server";
import {
  normalizeSupabaseErrorMessage,
  registerSchema,
} from "@/lib/validation/security";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = registerSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message ?? "Invalid registration payload" },
      { status: 400 }
    );
  }

  const {
    name,
    email,
    password,
    org_code: organizationId,
    company_name,
    industry,
    business_details,
    tax_id,
  } = validation.data;
  const svc = createServiceClientStatic();
  const { data: organization } = await svc
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .eq("is_active", true)
    .single();

  if (!organization) {
    return NextResponse.json(
      { error: "Organization not found. Check your organization code." },
      { status: 404 }
    );
  }

  const cookiesToSet: Array<{
    name: string;
    value: string;
    options?: CookieOptions;
  }> = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookiesToSet.push(...cookies);
        },
      },
    }
  );

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });

  if (signUpError) {
    return NextResponse.json(
      { error: normalizeSupabaseErrorMessage(signUpError) },
      { status: 400 }
    );
  }

  const userId = signUpData.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }

  const { error: profileError } = await svc.from("hd_profiles").upsert(
    {
      id: userId,
      full_name: name,
      organization_id: organization.id,
      role: "customer",
      is_active: true,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    await svc.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }

  if (company_name) {
    const { error: customerError } = await svc.from("hd_customers_info").upsert(
      {
        id: userId,
        company_name,
        industry: industry ?? "",
        business_details: business_details ?? "",
        tax_id: tax_id ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (customerError) {
      await svc.from("hd_profiles").delete().eq("id", userId);
      await svc.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: "Registration failed" }, { status: 500 });
    }
  }

  const locale = request.cookies.get("NEXT_LOCALE")?.value ?? "de";
  const prefix = locale === "de" ? "" : `/${locale}`;
  const redirectTo = `${prefix}/tickets`;

  if (signUpData.session) {
    const response = NextResponse.json({ redirectTo });
    for (const { name: cookieName, value, options } of cookiesToSet) {
      response.cookies.set(cookieName, value, { path: "/", ...options });
    }
    return response;
  }

  return NextResponse.json({ needsConfirmation: true });
}
