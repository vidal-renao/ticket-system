import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Shield, ShieldAlert, Key, Users, Building2 } from "lucide-react";
import { getOrgSettings } from "@/app/actions/org-settings";
import { PIIScrubbingToggle } from "@/components/settings/PIIScrubbingToggle";
import { OrgCodeDisplay } from "@/components/settings/OrgCodeDisplay";
import { CustomerProfileForm } from "@/components/settings/CustomerProfileForm";

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

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, organization_id, full_name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect(loginPath);

  const isAdmin    = profile.role === "admin";
  const isCustomer = profile.role === "customer";
  const isAgent    = profile.role === "agent" || profile.role === "manager";

  // Agent-specific fields fetched separately to avoid schema-cache failures
  let agentProfile: { team_id: string | null; specialty: string | null } | null = null;
  if (isAgent) {
    const { data } = await svc
      .from("profiles")
      .select("team_id, specialty")
      .eq("id", user.id)
      .single();
    agentProfile = data ?? null;
  }

  // Admin: fetch org settings + name
  let pii_scrubbing_enabled = false;
  let orgId: string | null = null;
  let orgName: string | null = null;
  if (isAdmin) {
    const orgSettings = await getOrgSettings();
    pii_scrubbing_enabled = orgSettings.pii_scrubbing_enabled;
    orgId = profile.organization_id ?? null;
    if (orgId) {
      const { data: org } = await svc.from("organizations").select("name").eq("id", orgId).single();
      orgName = org?.name ?? null;
    }
  }

  // Customer: fetch company profile
  let customerInfo: {
    company_name: string;
    industry: string;
    business_details: string;
    tax_id: string;
  } | null = null;
  if (isCustomer) {
    const { data } = await svc
      .from("customers_info")
      .select("company_name, industry, business_details, tax_id")
      .eq("id", user.id)
      .single();
    customerInfo = data ?? null;
  }

  // Agent/Manager: fetch team name
  let agentTeamName: string | null = null;
  if (isAgent && agentProfile?.team_id) {
    const { data: team } = await svc
      .from("teams")
      .select("name")
      .eq("id", agentProfile.team_id)
      .single();
    agentTeamName = team?.name ?? null;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{t("subtitle")}</p>
      </div>

      {/* ── ADMIN: Org Code + Compliance ── */}
      {isAdmin && (
        <>
          <Card className="mb-5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-400" aria-hidden="true" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                  {t("orgCode")}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <OrgCodeDisplay orgId={orgId} orgName={orgName} />
              <p className="text-[11px] text-[var(--color-text-muted)] mt-3 leading-relaxed">
                {t("orgCodeDesc")}
              </p>
            </CardContent>
          </Card>

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
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldAlert
                      className="w-3.5 h-3.5 text-[var(--color-text-secondary)]"
                      aria-hidden="true"
                    />
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
              <p className="text-[11px] text-[var(--color-text-muted)] border-t border-[var(--color-surface-600)] pt-4 leading-relaxed">
                ⚖️ {t("dsgNote")}
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── CUSTOMER: Company Profile ── */}
      {isCustomer && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-400" aria-hidden="true" />
              <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                {t("companyProfile")}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-[var(--color-text-muted)] mb-4 leading-relaxed">
              {t("companyProfileDesc")}
            </p>
            <CustomerProfileForm initial={customerInfo} />
          </CardContent>
        </Card>
      )}

      {/* ── AGENT / MANAGER: Team info ── */}
      {isAgent && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" aria-hidden="true" />
              <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                {t("teamInfo")}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-[var(--color-surface-700)]">
              <span className="text-xs text-[var(--color-text-muted)]">{t("yourTeam")}</span>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                {agentTeamName ?? (
                  <span className="text-[var(--color-text-muted)] italic text-xs">
                    {t("noTeamAssigned")}
                  </span>
                )}
              </span>
            </div>
            {agentProfile?.specialty && (
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-[var(--color-text-muted)]">{t("yourSpecialty")}</span>
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {agentProfile.specialty}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
