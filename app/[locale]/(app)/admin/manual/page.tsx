import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, BookOpen } from "lucide-react";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FORCE_CLOSE_REASON_MIN } from "@/lib/force-close";
import {
  MANUAL_CUSTOMER_WINDOW_HOURS,
  MANUAL_GOOD_TO_KNOW,
  MANUAL_STAGES,
  type ManualRole,
} from "@/lib/manual-content";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("manual");
  return { title: t("title") };
}

const ROLE_BADGE: Record<ManualRole, string> = {
  admin: "border-indigo-400/25 bg-indigo-500/10 text-indigo-300",
  specialist: "border-cyan-400/25 bg-cyan-500/10 text-cyan-300",
  customer: "border-emerald-400/25 bg-emerald-500/10 text-emerald-300",
};

const strong = (chunks: ReactNode) => (
  <strong className="font-semibold text-[var(--color-text-primary)]">{chunks}</strong>
);

export default async function AdminManualPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("manual");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const loginPath = locale === "de" ? "/login" : `/${locale}/login`;
  if (!user) redirect(loginPath);

  // Administrators only, decided on the server from the authenticated
  // profile -- the sidebar and header links are conveniences, not the gate.
  const svc = createServiceClientStatic();
  const profile = await getCurrentProfile(svc, user.id);
  const ticketsPath = locale === "de" ? "/tickets" : `/${locale}/tickets`;
  if (!profile || profile.role !== "admin" || !profile.organization_id) redirect(ticketsPath);

  const adminPath = locale === "de" ? "/admin" : `/${locale}/admin`;
  const values = { b: strong, hours: MANUAL_CUSTOMER_WINDOW_HOURS, min: FORCE_CLOSE_REASON_MIN };
  const roles: ManualRole[] = ["admin", "specialist", "customer"];

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:p-6">
      <Link
        href={adminPath}
        className="mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-indigo-300 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t("back")}
      </Link>

      <header className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-400" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">{t("subtitle")}</p>
      </header>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("intro.title")}</h2>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            <p>{t("intro.body")}</p>
            <ul className="space-y-2">
              {roles.map((role) => (
                <li key={role} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-signal-blue)]" aria-hidden="true" />
                  <span>{t.rich(`intro.${role}`, values)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <nav aria-labelledby="manual-toc-title">
          <Card>
            <CardHeader>
              <h2 id="manual-toc-title" className="text-sm font-semibold text-[var(--color-text-primary)]">
                {t("tocTitle")}
              </h2>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-1 sm:grid-cols-2">
                {MANUAL_STAGES.map((stage, index) => (
                  <li key={stage.id}>
                    <a
                      href={`#stage-${stage.id}`}
                      className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-800)] hover:text-indigo-300 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <span className="font-mono text-xs text-[var(--color-text-muted)]">{index + 1}</span>
                      {t(`stages.${stage.id}.title`)}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    href="#good-to-know"
                    className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-800)] hover:text-indigo-300 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="font-mono text-xs text-[var(--color-text-muted)]">i</span>
                    {t("goodToKnow.title")}
                  </a>
                </li>
              </ol>
            </CardContent>
          </Card>
        </nav>

        {MANUAL_STAGES.map((stage, index) => {
          const base = `stages.${stage.id}`;
          const headingId = `stage-${stage.id}-title`;
          return (
            <section key={stage.id} id={`stage-${stage.id}`} aria-labelledby={headingId} className="scroll-mt-6">
              <Card>
                <CardHeader>
                  <p className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    {t("stageLabel", { number: index + 1 })}
                  </p>
                  <h2 id={headingId} className="mt-0.5 text-lg font-semibold text-[var(--color-text-primary)]">
                    {t(`${base}.title`)}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-[var(--color-text-muted)]">{t("whoLabel")}:</span>
                    {stage.roles.map((role) => (
                      <Badge key={role} className={ROLE_BADGE[role]}>
                        {t(`roles.${role}`)}
                      </Badge>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  <p>{t(`${base}.summary`)}</p>

                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      {t("stepsLabel")}
                    </h3>
                    <ol className="list-decimal space-y-2 pl-5 marker:text-[var(--color-text-muted)]">
                      {stage.steps.map((step) => (
                        <li key={step}>{t.rich(`${base}.${step}`, values)}</li>
                      ))}
                    </ol>
                  </div>

                  <div className="rounded-xl border border-[var(--color-signal-blue)]/25 bg-[var(--color-signal-blue)]/10 p-3">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      {t("resultLabel")}
                    </h3>
                    <p>{t.rich(`${base}.result`, values)}</p>
                  </div>

                  <div className="space-y-4">
                    {stage.images.map((image) => (
                      <figure key={image.src}>
                        <Image
                          src={image.src}
                          width={image.width}
                          height={image.height}
                          alt={t(`${base}.${image.altKey}`)}
                          sizes="(min-width: 896px) 832px, 100vw"
                          className="h-auto rounded-xl border border-[var(--color-surface-600)]"
                          style={{ width: "100%", maxWidth: image.width }}
                        />
                      </figure>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>
          );
        })}

        <section id="good-to-know" aria-labelledby="good-to-know-title" className="scroll-mt-6">
          <Card>
            <CardHeader>
              <h2 id="good-to-know-title" className="text-lg font-semibold text-[var(--color-text-primary)]">
                {t("goodToKnow.title")}
              </h2>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {MANUAL_GOOD_TO_KNOW.map((key) => (
                  <li key={key} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-signal-blue)]" aria-hidden="true" />
                    <span>{t.rich(`goodToKnow.${key}`, values)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
