import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { canCreateTicket, getCurrentUserContext } from "@/lib/auth/permissions";
import { NewTicketForm } from "@/components/tickets/NewTicketForm";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("tickets");
  return { title: t("submitRequest") };
}

export default async function NewTicketPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("tickets");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(locale === "de" ? "/login" : `/${locale}/login`);

  const ctx = await getCurrentUserContext();
  if (!canCreateTicket(ctx)) redirect(locale === "de" ? "/settings" : `/${locale}/settings`);

  const svc = createServiceClientStatic();
  const orgId = ctx?.organizationId ?? null;
  let teams: Array<{ id: string; name: string }> = [];

  if (orgId) {
    const { data } = await svc
      .from("teams")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name");
    teams = data ?? [];
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t("submitRequest")}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">{t("aiDescription")}</p>
      </div>
      <NewTicketForm teams={teams} />
    </div>
  );
}
