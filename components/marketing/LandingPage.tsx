"use client";

import Link from "next/link";
import { Zap, Shield, Globe, BarChart3, Clock, ArrowRight, Star } from "lucide-react";
import { LandingNav } from "./LandingNav";
import { ComparisonTable } from "./ComparisonTable";
import { PricingSection } from "./PricingSection";

interface LandingPageProps {
  locale: string;
}

const COPY: Record<string, {
  hero_label: string;
  hero_title: string;
  hero_sub: string;
  cta_primary: string;
  cta_secondary: string;
  stats: { value: string; label: string }[];
  features_label: string;
  features_title: string;
  features: { icon: React.ElementType; title: string; desc: string }[];
  testimonial_quote: string;
  testimonial_name: string;
  testimonial_role: string;
  footer_cta_title: string;
  footer_cta_sub: string;
  footer_cta_btn: string;
}> = {
  en: {
    hero_label: "AI-Powered Helpdesk for Swiss SMEs",
    hero_title: "Support tickets resolved by AI — not humans",
    hero_sub: "HelpDesk AI automatically triages, prioritizes, and routes every ticket with Claude AI. DSG/nDSG compliant. Data stays in Switzerland.",
    cta_primary: "Start free trial",
    cta_secondary: "See how it works",
    stats: [
      { value: "< 2 min", label: "Average first response" },
      { value: "97%", label: "AI triage accuracy" },
      { value: "100%", label: "DSG/nDSG compliant" },
    ],
    features_label: "Features",
    features_title: "Everything your Swiss IT team needs",
    features: [
      {
        icon: Zap,
        title: "AI Triage & Routing",
        desc: "Claude AI classifies every incoming ticket, assigns priority, detects sentiment, and routes to the right agent — automatically.",
      },
      {
        icon: Shield,
        title: "Swiss DSG/nDSG Compliance",
        desc: "Built-in PII auto-redaction, immutable audit logs, data residency in Switzerland, and full compliance with Art. 6 DSG.",
      },
      {
        icon: Globe,
        title: "Multilingual Support",
        desc: "Native DE / EN / ES support. Your agents reply in German, your customers write in Spanish — it just works.",
      },
      {
        icon: BarChart3,
        title: "Executive Analytics",
        desc: "Real-time SLA compliance rates, AI accuracy metrics, sentiment trends, and ticket volume forecasting on one dashboard.",
      },
      {
        icon: Clock,
        title: "SLA Management",
        desc: "Define SLA policies per priority level. Automatic breach detection, countdown timers, and escalation alerts.",
      },
      {
        icon: Star,
        title: "AI Performance Insights",
        desc: "Track how often agents accept AI suggestions. Continuous model improvement based on your organization's data.",
      },
    ],
    testimonial_quote: "We replaced Zendesk and cut our response time by 65%. The DSG compliance piece was the deciding factor — no other vendor could match it.",
    testimonial_name: "Thomas Becker",
    testimonial_role: "IT Manager, Basel SME",
    footer_cta_title: "Ready to transform your helpdesk?",
    footer_cta_sub: "Start free — no credit card required. DSG/nDSG compliant from day one.",
    footer_cta_btn: "Start free trial",
  },
  de: {
    hero_label: "KI-gestützter Helpdesk für Schweizer KMU",
    hero_title: "Support-Anfragen gelöst durch KI — nicht durch Menschen",
    hero_sub: "HelpDesk AI klassifiziert, priorisiert und leitet jede Anfrage automatisch mit Claude AI weiter. DSG/nDSG-konform. Daten bleiben in der Schweiz.",
    cta_primary: "Kostenlos testen",
    cta_secondary: "So funktioniert es",
    stats: [
      { value: "< 2 Min.", label: "Ø Erstantwortzeit" },
      { value: "97%", label: "KI-Triage-Genauigkeit" },
      { value: "100%", label: "DSG/nDSG-konform" },
    ],
    features_label: "Funktionen",
    features_title: "Alles, was Ihr Schweizer IT-Team braucht",
    features: [
      {
        icon: Zap,
        title: "KI-Triage & Routing",
        desc: "Claude AI klassifiziert jede eingehende Anfrage, weist Prioritäten zu, erkennt Stimmungen und leitet zum richtigen Agenten weiter — automatisch.",
      },
      {
        icon: Shield,
        title: "Schweizer DSG/nDSG-Compliance",
        desc: "Automatische PII-Bereinigung, unveränderliche Audit-Logs, Datenhaltung in der Schweiz und vollständige Konformität mit Art. 6 DSG.",
      },
      {
        icon: Globe,
        title: "Mehrsprachiger Support",
        desc: "Nativer DE / EN / ES Support. Ihre Agenten antworten auf Deutsch, Ihre Kunden schreiben auf Spanisch — es funktioniert einfach.",
      },
      {
        icon: BarChart3,
        title: "Executive Analytics",
        desc: "Echtzeit-SLA-Compliance-Raten, KI-Genauigkeitsmetriken, Stimmungstrends und Ticketvolumen-Prognosen auf einem Dashboard.",
      },
      {
        icon: Clock,
        title: "SLA-Verwaltung",
        desc: "SLA-Richtlinien nach Prioritätsstufe definieren. Automatische Verletzungserkennung, Countdown-Timer und Eskalationsbenachrichtigungen.",
      },
      {
        icon: Star,
        title: "KI-Leistungseinblicke",
        desc: "Verfolgen Sie, wie oft Agenten KI-Vorschläge akzeptieren. Kontinuierliche Modellverbesserung basierend auf den Daten Ihrer Organisation.",
      },
    ],
    testimonial_quote: "Wir haben Zendesk ersetzt und unsere Reaktionszeit um 65 % gesenkt. Die DSG-Compliance war der entscheidende Faktor — kein anderer Anbieter konnte das bieten.",
    testimonial_name: "Thomas Becker",
    testimonial_role: "IT-Manager, Basler KMU",
    footer_cta_title: "Bereit, Ihren Helpdesk zu transformieren?",
    footer_cta_sub: "Kostenlos starten — keine Kreditkarte erforderlich. Ab Tag eins DSG/nDSG-konform.",
    footer_cta_btn: "Kostenlos testen",
  },
  es: {
    hero_label: "Helpdesk con IA para pymes suizas",
    hero_title: "Tickets de soporte resueltos por IA — no por personas",
    hero_sub: "HelpDesk AI clasifica, prioriza y enruta cada ticket automáticamente con Claude AI. Conforme con DSG/nDSG. Los datos permanecen en Suiza.",
    cta_primary: "Prueba gratis",
    cta_secondary: "Cómo funciona",
    stats: [
      { value: "< 2 min", label: "Tiempo de primera respuesta" },
      { value: "97%", label: "Precisión del triage IA" },
      { value: "100%", label: "Conforme DSG/nDSG" },
    ],
    features_label: "Funcionalidades",
    features_title: "Todo lo que su equipo IT suizo necesita",
    features: [
      {
        icon: Zap,
        title: "Triage IA & Enrutamiento",
        desc: "Claude AI clasifica cada ticket entrante, asigna prioridad, detecta sentimiento y enruta al agente correcto — automáticamente.",
      },
      {
        icon: Shield,
        title: "Cumplimiento DSG/nDSG suizo",
        desc: "Redacción automática de PII, registros de auditoría inmutables, residencia de datos en Suiza y cumplimiento total con el Art. 6 DSG.",
      },
      {
        icon: Globe,
        title: "Soporte multilingüe",
        desc: "Soporte nativo DE / EN / ES. Sus agentes responden en alemán, sus clientes escriben en español — funciona sin configuración.",
      },
      {
        icon: BarChart3,
        title: "Analítica ejecutiva",
        desc: "Tasas de cumplimiento SLA en tiempo real, métricas de precisión IA, tendencias de sentimiento y previsión de volumen en un panel.",
      },
      {
        icon: Clock,
        title: "Gestión de SLA",
        desc: "Defina políticas SLA por nivel de prioridad. Detección automática de incumplimientos, temporizadores de cuenta regresiva y alertas de escalada.",
      },
      {
        icon: Star,
        title: "Informes de rendimiento IA",
        desc: "Siga con qué frecuencia los agentes aceptan sugerencias de IA. Mejora continua del modelo basada en los datos de su organización.",
      },
    ],
    testimonial_quote: "Reemplazamos Zendesk y redujimos nuestro tiempo de respuesta en un 65%. El cumplimiento DSG fue el factor decisivo — ningún otro proveedor podía igualarlo.",
    testimonial_name: "Thomas Becker",
    testimonial_role: "Director IT, pyme de Basilea",
    footer_cta_title: "¿Listo para transformar su helpdesk?",
    footer_cta_sub: "Comience gratis — sin tarjeta de crédito. Conforme con DSG/nDSG desde el primer día.",
    footer_cta_btn: "Prueba gratis",
  },
};

export function LandingPage({ locale }: LandingPageProps) {
  const c = COPY[locale] ?? COPY.en;
  const loginHref  = locale === "de" ? "/login"  : `/${locale}/login`;
  const signupHref = locale === "de" ? "/signup" : `/${locale}/signup`;

  return (
    <div className="min-h-screen bg-[var(--color-surface-950)] text-[var(--color-text-primary)]">
      <LandingNav locale={locale} />

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Background orbs */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full"
            style={{ background: "radial-gradient(ellipse at center, rgba(79,70,229,0.12) 0%, transparent 65%)" }}
          />
          <div className="absolute top-20 right-0 w-[500px] h-[500px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 65%)" }}
          />
          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage: "linear-gradient(var(--color-surface-500) 1px, transparent 1px), linear-gradient(90deg, var(--color-surface-500) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        <div className="max-w-4xl mx-auto text-center relative">
          {/* Label badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-6">
            <Zap className="w-3 h-3 text-indigo-400" />
            <span className="text-xs font-medium text-indigo-300">{c.hero_label}</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-[var(--color-text-primary)] leading-tight mb-6">
            {c.hero_title}
          </h1>

          <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed">
            {c.hero_sub}
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href={signupHref}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:-translate-y-0.5"
            >
              {c.cta_primary}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href={loginHref}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold border border-[var(--color-surface-600)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-surface-500)] transition-all"
            >
              {c.cta_secondary}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────────────────────────── */}
      <section className="border-y border-[var(--color-surface-600)] bg-[var(--color-surface-900)]">
        <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-3 divide-x divide-[var(--color-surface-600)]">
          {c.stats.map((stat, i) => (
            <div key={i} className="text-center px-6">
              <div className="text-2xl font-bold text-indigo-400 mb-1">{stat.value}</div>
              <div className="text-xs text-[var(--color-text-muted)]">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">
              {c.features_label}
            </p>
            <h2 className="text-3xl font-bold text-[var(--color-text-primary)]">
              {c.features_title}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {c.features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div
                  key={i}
                  className="group p-6 rounded-2xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] hover:border-indigo-500/30 hover:bg-[var(--color-surface-800)] transition-all duration-300"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4 group-hover:bg-indigo-600/20 transition-colors">
                    <Icon className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Comparison table ────────────────────────────────────────── */}
      <ComparisonTable locale={locale} />

      {/* ── Testimonial ─────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="p-8 rounded-2xl border border-indigo-500/20 bg-indigo-600/5 text-center">
            <div className="flex justify-center gap-1 mb-6">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
              ))}
            </div>
            <blockquote className="text-lg text-[var(--color-text-secondary)] leading-relaxed mb-6 italic">
              &ldquo;{c.testimonial_quote}&rdquo;
            </blockquote>
            <div className="flex items-center justify-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-600/30 flex items-center justify-center text-sm font-semibold text-indigo-300">
                {c.testimonial_name.charAt(0)}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {c.testimonial_name}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">{c.testimonial_role}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────── */}
      <PricingSection locale={locale} />

      {/* ── Footer CTA ──────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-[var(--color-surface-600)]">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-500/30">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-[var(--color-text-primary)] mb-4">
            {c.footer_cta_title}
          </h2>
          <p className="text-[var(--color-text-secondary)] mb-8">{c.footer_cta_sub}</p>
          <Link
            href={signupHref}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-xl shadow-indigo-500/20 hover:-translate-y-0.5"
          >
            {c.footer_cta_btn}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Footer links */}
        <div className="max-w-6xl mx-auto mt-20 pt-8 border-t border-[var(--color-surface-600)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center">
              <Zap className="w-2.5 h-2.5 text-white" />
            </div>
            <span>© 2026 Vidal Ecosystem. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Basel, Switzerland 🇨🇭</span>
            <span>DSG/nDSG Compliant</span>
          </div>
        </div>
      </section>
    </div>
  );
}
