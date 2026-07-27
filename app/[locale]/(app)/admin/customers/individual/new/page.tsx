import { redirect } from "next/navigation";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { IndividualCustomerForm } from "@/components/admin/IndividualCustomerForm";
import { User } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "New Individual Customer" };
}

export default async function NewIndividualCustomerPage({
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
        <User className="w-5 h-5 text-indigo-400" />
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Alta de cliente individual</h1>
      </div>
      <IndividualCustomerForm />
    </div>
  );
}
