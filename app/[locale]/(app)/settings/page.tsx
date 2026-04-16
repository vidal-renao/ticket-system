import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Shield, ShieldAlert } from "lucide-react";
import { getOrgSettings } from "@/app/actions/org-settings";
import { PIIScrubbingToggle } from "@/components/settings/PIIScrubbingToggle";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("settings");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const queuePath = locale === "de" ? "/queue" : `/${locale}/queue`;
  if (profile?.role !== "admin") redirect(queuePath);

  const { pii_scrubbing_enabled } = await getOrgSettings();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">
              {t("compliance")}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* PII Scrubbing row */}
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-3.5 h-3.5 text-[var(--color-text-secondary)]" aria-hidden="true" />
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {t("piiScrubbing")}
                </p>
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    pii_scrubbing_enabled
                      ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : "bg-[var(--color-surface-700)] text-[var(--color-text-muted)] border border-[var(--color-surface-600)]"
                  }`}
                >
                  {pii_scrubbing_enabled ? t("piiActive") : t("piiInactive")}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {t("piiScrubbingDesc")}
              </p>
            </div>
            <PIIScrubbingToggle enabled={pii_scrubbing_enabled} />
          </div>

          {/* DSG note */}
          <p className="text-[11px] text-[var(--color-text-muted)] border-t border-[var(--color-surface-600)] pt-4 leading-relaxed">
            ⚖️ {t("dsgNote")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
