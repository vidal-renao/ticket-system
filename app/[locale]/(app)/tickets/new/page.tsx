import { getTranslations } from "next-intl/server";
import { NewTicketForm } from "@/components/tickets/NewTicketForm";

export async function generateMetadata() {
  const t = await getTranslations("tickets");
  return { title: t("submitRequest") };
}

export default async function NewTicketPage() {
  const t = await getTranslations("tickets");

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t("submitRequest")}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {t("aiDescription")}
        </p>
      </div>
      <NewTicketForm />
    </div>
  );
}
