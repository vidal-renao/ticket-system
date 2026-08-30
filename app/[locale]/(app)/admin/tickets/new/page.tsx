import { redirect } from "next/navigation";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { AdminTicketForm } from "@/components/admin/AdminTicketForm";
import type { CustomerOption } from "@/components/admin/CustomerPicker";
import { TicketPlus } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "New Ticket for Customer" };
}

export default async function AdminNewTicketPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(svc, user.id);
  if (!profile || profile.role !== "admin" || !profile.organization_id) {
    redirect(locale === "de" ? "/tickets" : `/${locale}/tickets`);
  }
  const orgId = profile.organization_id;

  const [{ data: customerRows }, { data: teamRows }, { data: authUsers }] = await Promise.all([
    svc
      .from("hd_profiles")
      .select("id, full_name, customer_type")
      .eq("organization_id", orgId)
      .eq("role", "customer")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("full_name"),
    svc.from("teams").select("id, name").eq("organization_id", orgId).order("name"),
    svc.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const customerIds = (customerRows ?? []).map((row) => row.id);
  const { data: customerInfos } = customerIds.length
    ? await svc.from("hd_customers_info").select("id, company_name").in("id", customerIds)
    : { data: [] };

  const companyById = Object.fromEntries(
    (customerInfos ?? []).map((info) => [info.id, info.company_name])
  );
  const emailById = Object.fromEntries(
    (authUsers?.users ?? []).map((authUser) => [authUser.id, authUser.email ?? null])
  );

  const customers: CustomerOption[] = (customerRows ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: emailById[row.id] ?? null,
    company_name: companyById[row.id] ?? null,
    customer_type: row.customer_type,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 sm:p-6">
      <div className="mb-2 flex items-center gap-2">
        <TicketPlus className="h-5 w-5 text-indigo-400" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          New ticket for a customer
        </h1>
      </div>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        The ticket is filed in the customer&apos;s name and behaves exactly like one they
        filed themselves — same routing, same SLA clock, same triage.
      </p>

      <AdminTicketForm customers={customers} teams={teamRows ?? []} />
    </div>
  );
}
