"use server";

import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface CustomerProfileInput {
  company_name: string;
  industry: string;
  business_details: string;
  tax_id: string;
}

export async function saveCustomerProfile(
  data: CustomerProfileInput
): Promise<{ ok: true } | { error: string }> {
  if (!data.company_name?.trim()) return { error: "Company name is required" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "customer") return { error: "Forbidden" };

  const { error } = await svc.from("customers_info").upsert(
    {
      id: user.id,
      company_name: data.company_name.trim(),
      industry: data.industry.trim(),
      business_details: data.business_details.trim(),
      tax_id: data.tax_id.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
