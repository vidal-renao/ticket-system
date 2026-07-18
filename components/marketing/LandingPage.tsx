import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Globe2,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  UsersRound,
  Zap,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LandingNav } from "./LandingNav";
import { AnimatedFeatureGrid } from "./AnimatedFeatureGrid";
import { AnimatedSection } from "./AnimatedSection";

interface LandingPageProps {
  locale: string;
  isLoggedIn?: boolean;
}

const CONTROL_COPY: Record<string, {
  eyebrow: string;
  panelTitle: string;
  panelStatus: string;
  queue: string;
  sla: string;
  owner: string;
  safeguards: string;
  safeguardsTitle: string;
  safeguardsBody: string;
  humanReview: string;
  tenantBoundary: string;
  auditTrail: string;
  builtFor: string;
}> = {
  de: {
    eyebrow: "Live-Arbeitsablauf",
    panelTitle: "Support-Leitstand",
    panelStatus: "Betriebsbereit",
    queue: "Aktive Warteschlange",
    sla: "SLA-Fenster",
    owner: "Zuständigkeit",
    safeguards: "Kontrollierte Automatisierung",
    safeguardsTitle: "KI unterstützt. Menschen entscheiden.",
    safeguardsBody: "Triage und Antwortvorschläge beschleunigen die Arbeit, ohne Kundenkommunikation automatisch zu versenden.",
    humanReview: "Menschliche Freigabe",
    tenantBoundary: "Mandantengrenzen",
    auditTrail: "Lebenszyklus-Audit",
    builtFor: "Für Supportteams mit klaren Verantwortlichkeiten",
  },
  en: {
    eyebrow: "Live workflow",
    panelTitle: "Support control room",
    panelStatus: "Operational",
    queue: "Active queue",
    sla: "SLA window",
    owner: "Ownership",
    safeguards: "Controlled automation",
    safeguardsTitle: "AI assists. People decide.",
    safeguardsBody: "Triage and reply suggestions accelerate the work without automatically sending customer communication.",
    humanReview: "Human approval",
    tenantBoundary: "Tenant boundaries",
    auditTrail: "Lifecycle audit",
    builtFor: "For support teams with explicit ownership",
  },
  es: {
    eyebrow: "Flujo en directo",
    panelTitle: "Centro de control",
    panelStatus: "Operativo",
    queue: "Cola activa",
    sla: "Ventana SLA",
    owner: "Responsabilidad",
    safeguards: "Automatización controlada",
    safeguardsTitle: "La IA asiste. Las personas deciden.",
    safeguardsBody: "El triage y las respuestas sugeridas aceleran el trabajo sin enviar comunicaciones al cliente automáticamente.",
    humanReview: "Aprobación humana",
    tenantBoundary: "Límites por organización",
    auditTrail: "Auditoría del ciclo",
    builtFor: "Para equipos de soporte con responsabilidad clara",
  },
};

const FEATURE_ICONS = ["Zap", "Shield", "Globe", "BarChart3", "Clock", "Star"] as const;

export async function LandingPage({ locale, isLoggedIn = false }: LandingPageProps) {
  const t = await getTranslations("landing");
  const copy = CONTROL_COPY[locale] ?? CONTROL_COPY.en;
  const prefix = locale === "de" ? "" : `/${locale}`;
  const loginHref = `${prefix}/login`;
  const dashboardHref = `${prefix}/dashboard`;
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "contact@vidallab.ch";
  const demoHref = `mailto:${contactEmail}?subject=${encodeURIComponent("HelpDesk AI product demo")}`;

  const features = FEATURE_ICONS.map((iconName, index) => ({
    iconName,
    title: t(`feature${index + 1}Title`),
    desc: t(`feature${index + 1}Desc`),
  }));

  const stats = [1, 2, 3].map((index) => ({
    value: t(`statsValue${index}`),
    label: t(`statsLabel${index}`),
  }));

  const steps = [1, 2, 3].map((index) => ({
    label: t(`step${index}Label`),
    title: t(`step${index}Title`),
    desc: t(`step${index}Desc`),
  }));

  return (
    <div className="landing-shell min-h-screen text-[var(--color-text-primary)]">
      <LandingNav locale={locale} isLoggedIn={isLoggedIn} />

      <main>
        <section className="relative overflow-hidden px-5 pb-20 pt-28 sm:px-8 lg:pb-28 lg:pt-36">
          <div className="landing-grid absolute inset-0" aria-hidden="true" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.92fr_1.08fr]">
            <AnimatedSection className="relative z-10 max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-brand-400)]/25 bg-[var(--color-brand-500)]/8 px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-200)]">
                <span className="status-pulse h-2 w-2 rounded-full bg-[var(--color-success)]" />
                {t("heroLabel")}
              </div>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">
                {copy.builtFor}
              </p>
              <h1 className="font-display text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
                {t("heroTitle")}
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">
                {t("heroSub")}
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href={isLoggedIn ? dashboardHref : demoHref} className="control-cta control-cta-primary">
                  {isLoggedIn ? t("ctaDashboard") : t("ctaPrimary")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                {!isLoggedIn && (
                  <Link href={loginHref} className="control-cta control-cta-secondary">
                    {t("ctaSecondary")}
                  </Link>
                )}
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.12} className="relative z-10">
              <div className="control-panel overflow-hidden rounded-[1.6rem] border border-white/10">
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-brand-200)]">{copy.eyebrow}</p>
                    <h2 className="mt-1 text-sm font-semibold">{copy.panelTitle}</h2>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-success)]/25 bg-[var(--color-success)]/8 px-2.5 py-1 text-[10px] font-semibold text-[var(--color-success)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {copy.panelStatus}
                  </span>
                </div>

                <div className="sla-pulse-line" aria-hidden="true" />

                <div className="grid gap-px bg-white/8 sm:grid-cols-3">
                  {[
                    { label: copy.queue, value: "12", icon: TicketCheck },
                    { label: copy.sla, value: "01:42", icon: Clock3 },
                    { label: copy.owner, value: "4 / 4", icon: UsersRound },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="bg-[var(--color-surface-900)] px-5 py-5">
                      <Icon className="mb-4 h-4 w-4 text-[var(--color-brand-300)]" aria-hidden="true" />
                      <p className="font-mono text-xl font-semibold tracking-tight">{value}</p>
                      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{label}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 p-4">
                  {[
                    { id: "TK-0241", title: "VPN access · Zürich", priority: "Critical", tone: "critical" },
                    { id: "TK-0240", title: "Device enrollment · Basel", priority: "High", tone: "high" },
                    { id: "TK-0238", title: "Mailbox permissions · Bern", priority: "Medium", tone: "medium" },
                  ].map((ticket) => (
                    <div key={ticket.id} className="ticket-preview grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-white/7 px-3 py-3">
                      <span className={`priority-rail priority-rail-${ticket.tone}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{ticket.title}</p>
                        <p className="mt-1 font-mono text-[10px] text-[var(--color-text-muted)]">{ticket.id}</p>
                      </div>
                      <span className="text-[10px] text-[var(--color-text-secondary)]">{ticket.priority}</span>
                    </div>
                  ))}
                </div>
              </div>
            </AnimatedSection>
          </div>
        </section>

        <section className="border-y border-white/8 bg-[var(--color-surface-900)]/75 px-5 sm:px-8">
          <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-white/8 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {stats.map((stat) => (
              <div key={stat.label} className="px-6 py-7 sm:px-8">
                <p className="font-mono text-lg font-semibold text-[var(--color-brand-200)]">{stat.value}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 max-w-2xl">
              <p className="section-kicker">{t("featuresLabel")}</p>
              <h2 className="font-display mt-3 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">{t("featuresTitle")}</h2>
            </div>
            <AnimatedFeatureGrid features={features} />
          </div>
        </section>

        <section className="border-y border-white/8 bg-[var(--color-surface-900)] px-5 py-24 sm:px-8">
          <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.78fr_1.22fr]">
            <AnimatedSection>
              <p className="section-kicker">{copy.safeguards}</p>
              <h2 className="font-display mt-3 text-4xl font-semibold tracking-[-0.035em]">{copy.safeguardsTitle}</h2>
              <p className="mt-5 max-w-lg leading-7 text-[var(--color-text-secondary)]">{copy.safeguardsBody}</p>
            </AnimatedSection>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: MessageSquareText, label: copy.humanReview },
                { icon: ShieldCheck, label: copy.tenantBoundary },
                { icon: BarChart3, label: copy.auditTrail },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="rounded-2xl border border-white/8 bg-[var(--color-surface-850)] p-5">
                  <Icon className="h-5 w-5 text-[var(--color-success)]" aria-hidden="true" />
                  <p className="mt-8 text-sm font-medium">{label}</p>
                  <CheckCircle2 className="mt-3 h-4 w-4 text-[var(--color-text-muted)]" aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <p className="section-kicker">{t("howTitle")}</p>
            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-white/8 bg-white/8 lg:grid-cols-3">
              {steps.map((step, index) => (
                <div key={step.title} className="bg-[var(--color-surface-900)] p-7">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-brand-200)]">{step.label}</span>
                    <span className="font-mono text-xs text-[var(--color-text-muted)]">0{index + 1}</span>
                  </div>
                  <h3 className="mt-10 text-base font-semibold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-12 sm:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[1.75rem] border border-[var(--color-brand-400)]/20 bg-[var(--color-brand-500)]/8 px-6 py-12 sm:px-12">
            <div className="grid items-end gap-8 md:grid-cols-[1fr_auto]">
              <div>
                <Sparkles className="h-5 w-5 text-[var(--color-brand-200)]" aria-hidden="true" />
                <h2 className="font-display mt-5 text-4xl font-semibold tracking-[-0.035em]">{t("footerCtaTitle")}</h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">{t("footerCtaSub")}</p>
              </div>
              <a href={demoHref} className="control-cta control-cta-primary">
                {t("footerCtaBtn")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 border-t border-white/8 pt-8 text-xs text-[var(--color-text-muted)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-brand-500)] text-white"><Zap className="h-3 w-3" /></span>
            <span>{t("footerCopy")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href={loginHref} className="hover:text-[var(--color-text-primary)]">{t("footerLogin")}</Link>
            <a href="https://github.com/vidal-renao" target="_blank" rel="noreferrer" className="hover:text-[var(--color-text-primary)]">{t("footerGitHub")}</a>
            <a href="https://linkedin.com/in/vidalrenao" target="_blank" rel="noreferrer" className="hover:text-[var(--color-text-primary)]">{t("footerLinkedIn")}</a>
            <span className="inline-flex items-center gap-1.5 text-[var(--color-success)]"><Globe2 className="h-3 w-3" />{t("footerDsg")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
