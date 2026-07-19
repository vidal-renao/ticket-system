import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Shield, ShieldAlert, Key, Users, Building2, Radio, Lock, UserCircle2 } from "lucide-react";
import { getOrgSettings } from "@/app/actions/org-settings";
import { PIIScrubbingToggle } from "@/components/settings/PIIScrubbingToggle";
import { OrgCodeDisplay } from "@/components/settings/OrgCodeDisplay";
import { CustomerProfileForm } from "@/components/settings/CustomerProfileForm";
import { AgentAvailabilityToggle } from "@/components/settings/AgentAvailabilityToggle";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { AvatarUpload } from "@/components/settings/AvatarUpload";
import { generateCif } from "@/lib/tax-id";

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
  let { data: profile, error: profileError } = await svc
    .from("profiles")
    .select("role, organization_id, full_name, avatar_url, availability_status")
    .eq("id", user.id)
    .maybeSingle();

  // Fallback if availability_status column hasn't been migrated yet
  if (!profile && profileError) {
    const fallback = await svc.from("profiles").select("role, organization_id, full_name").eq("id", user.id).maybeSingle();
    profile = fallback.data as typeof profile;
    profileError = fallback.error;
  }

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
      .maybeSingle();
    customerInfo = data ?? null;

    // Self-healing fiscal identity: companies onboarded before automatic
    // CIF/NIF assignment get one generated and persisted on first visit.
    if (!customerInfo?.tax_id?.trim()) {
      const companyName = customerInfo?.company_name?.trim() || profile.full_name?.trim() || user.email || user.id;
      const generated = generateCif(companyName);
      await svc.from("customers_info").upsert(
        {
          id: user.id,
          company_name: customerInfo?.company_name ?? companyName,
          industry: customerInfo?.industry ?? "",
          business_details: customerInfo?.business_details ?? "",
          tax_id: generated,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
      customerInfo = {
        company_name: customerInfo?.company_name ?? companyName,
        industry: customerInfo?.industry ?? "",
        business_details: customerInfo?.business_details ?? "",
        tax_id: generated,
      };
    }
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

  const employeeId = user.id.slice(0, 8).toUpperCase();
  const lastLogin = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString(locale === "de" ? "de-CH" : "en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "—";

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{t("subtitle")}</p>
      </div>

      {/* ── PROFILE HEADER ── */}
      <Card className="mb-5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCircle2 className="w-4 h-4 text-indigo-400" aria-hidden="true" />
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">My Profile</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <AvatarUpload
            userId={user.id}
            name={profile.full_name ?? user.email?.split("@")[0] ?? "User"}
            currentUrl={profile.avatar_url ?? null}
          />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-2 border-t border-[var(--color-surface-700)]">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Email</p>
              <p className="text-sm text-[var(--color-text-primary)]">{user.email}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
                {isCustomer ? "CIF/NIF" : "Employee ID"}
              </p>
              <p className="text-sm font-mono text-[var(--color-text-primary)]">
                {isCustomer ? customerInfo?.tax_id || "—" : employeeId}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Role</p>
              <p className="text-sm capitalize text-[var(--color-text-primary)]">{profile.role}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Last login</p>
              <p className="text-sm text-[var(--color-text-primary)]">{lastLogin}</p>
            </div>
            {agentProfile?.specialty && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Specialty</p>
                <p className="text-sm text-[var(--color-text-primary)]">{agentProfile.specialty}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── CHANGE PASSWORD ── */}
      <Card className="mb-5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-400" aria-hidden="true" />
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">Change Password</span>
          </div>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

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

      {/* ── AGENT / MANAGER: Availability + Team info ── */}
      {isAgent && (
        <>
          <Card className="mb-5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                  {t("availability")}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--color-text-muted)] mb-3">{t("availabilityDesc")}</p>
              <AgentAvailabilityToggle
                userId={user.id}
                initial={(profile.availability_status ?? "offline") as "online" | "offline" | "busy"}
              />
            </CardContent>
          </Card>

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
                <div className="flex items-center justify-between py-2 border-b border-[var(--color-surface-700)]">
                  <span className="text-xs text-[var(--color-text-muted)]">{t("yourSpecialty")}</span>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {agentProfile.specialty}
                  </span>
                </div>
              )}
              <p className="text-[11px] text-[var(--color-text-muted)] pt-1">
                {t("lockedFieldsNote")}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
