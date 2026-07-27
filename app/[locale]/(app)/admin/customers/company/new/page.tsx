import { redirect } from "next/navigation";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { CompanyCustomerForm } from "@/components/admin/CompanyCustomerForm";
import { Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "New Company" };
}

export default async function NewCompanyCustomerPage({
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
  if (!profile || profile.role !== "admin") {
    redirect(locale === "de" ? "/admin/users" : `/${locale}/admin/users`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 sm:p-6">
      <div className="mb-6 flex items-center gap-2">
        <Building2 className="w-5 h-5 text-indigo-400" />
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Alta de empresa</h1>
      </div>
      <CompanyCustomerForm />
    </div>
  );
}
