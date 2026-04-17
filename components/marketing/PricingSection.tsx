"use client";

import { useState } from "react";
import { Check, Zap } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  monthly: number;
  annual: number;
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  badge?: string;
}

const PLANS_EN: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    monthly: 49,
    annual: 39,
    description: "Perfect for small teams getting started with AI support.",
    features: [
      "Up to 5 agents",
      "500 tickets / month",
      "AI triage & auto-routing",
      "3 locales (DE / EN / ES)",
      "SLA management",
      "Email support",
    ],
    cta: "Start free trial",
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 149,
    annual: 119,
    description: "Full-featured for growing Swiss SMEs that need compliance.",
    features: [
      "Up to 15 agents",
      "Unlimited tickets",
      "Advanced analytics & SLA forecasting",
      "PII auto-redaction (DSG/nDSG)",
      "AI sentiment analysis",
      "Priority support",
      "Audit logs (immutable)",
    ],
    cta: "Start free trial",
    highlighted: true,
    badge: "Most popular",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: 0,
    annual: 0,
    description: "Custom deployment for large organizations and multi-tenant setups.",
    features: [
      "Unlimited agents",
      "Multi-organization support",
      "Custom AI model fine-tuning",
      "Dedicated Swiss data residency",
      "SSO / Entra ID integration",
      "SLA guarantees (99.9% uptime)",
      "Dedicated account manager",
    ],
    cta: "Contact sales",
  },
];

const PLANS_DE: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    monthly: 49,
    annual: 39,
    description: "Ideal für kleine Teams, die mit KI-Support starten.",
    features: [
      "Bis zu 5 Agenten",
      "500 Anfragen / Monat",
      "KI-Triage & Auto-Routing",
      "3 Sprachen (DE / EN / ES)",
      "SLA-Verwaltung",
      "E-Mail-Support",
    ],
    cta: "Kostenlos testen",
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 149,
    annual: 119,
    description: "Vollständig für wachsende Schweizer KMU mit Compliance-Anforderungen.",
    features: [
      "Bis zu 15 Agenten",
      "Unbegrenzte Anfragen",
      "Erweiterte Analysen & SLA-Prognose",
      "Automatische PII-Bereinigung (DSG/nDSG)",
      "KI-Stimmungsanalyse",
      "Priority-Support",
      "Unveränderliche Audit-Logs",
    ],
    cta: "Kostenlos testen",
    highlighted: true,
    badge: "Beliebteste Option",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: 0,
    annual: 0,
    description: "Individuelle Lösung für grosse Organisationen und Multi-Tenant-Setups.",
    features: [
      "Unbegrenzte Agenten",
      "Multi-Organisationsunterstützung",
      "Individuelles KI-Modelltraining",
      "Dedizierte Schweizer Datenhaltung",
      "SSO / Entra ID Integration",
      "SLA-Garantien (99.9% Verfügbarkeit)",
      "Persönlicher Account Manager",
    ],
    cta: "Vertrieb kontaktieren",
  },
];

const PLANS_ES: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    monthly: 49,
    annual: 39,
    description: "Ideal para equipos pequeños que comienzan con soporte IA.",
    features: [
      "Hasta 5 agentes",
      "500 tickets / mes",
      "Triage IA y enrutamiento automático",
      "3 idiomas (DE / EN / ES)",
      "Gestión de SLA",
      "Soporte por correo",
    ],
    cta: "Prueba gratis",
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 149,
    annual: 119,
    description: "Completo para pymes suizas en crecimiento con requisitos de cumplimiento.",
    features: [
      "Hasta 15 agentes",
      "Tickets ilimitados",
      "Analítica avanzada y previsión SLA",
      "Redacción automática de PII (DSG/nDSG)",
      "Análisis de sentimiento IA",
      "Soporte prioritario",
      "Registros de auditoría (inmutables)",
    ],
    cta: "Prueba gratis",
    highlighted: true,
    badge: "Más popular",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: 0,
    annual: 0,
    description: "Despliegue personalizado para grandes organizaciones y configuraciones multi-tenant.",
    features: [
      "Agentes ilimitados",
      "Soporte multi-organización",
      "Ajuste fino de modelo IA personalizado",
      "Residencia de datos suiza dedicada",
      "SSO / integración Entra ID",
      "Garantías SLA (99.9% uptime)",
      "Gestor de cuenta dedicado",
    ],
    cta: "Contactar ventas",
  },
];

const PLANS_BY_LOCALE: Record<string, Plan[]> = { de: PLANS_DE, en: PLANS_EN, es: PLANS_ES };

const TOGGLE_LABELS: Record<string, { monthly: string; annual: string; save: string }> = {
  de: { monthly: "Monatlich", annual: "Jährlich", save: "20% sparen" },
  en: { monthly: "Monthly", annual: "Annual", save: "Save 20%" },
  es: { monthly: "Mensual", annual: "Anual", save: "Ahorra 20%" },
};

const CURRENCY_LABEL: Record<string, string> = {
  de: "CHF / Monat",
  en: "CHF / month",
  es: "CHF / mes",
};

interface PricingSectionProps {
  locale: string;
}

export function PricingSection({ locale }: PricingSectionProps) {
  const [annual, setAnnual] = useState(false);
  const plans = PLANS_BY_LOCALE[locale] ?? PLANS_EN;
  const labels = TOGGLE_LABELS[locale] ?? TOGGLE_LABELS.en;

  return (
    <section id="pricing" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">
            {locale === "de" ? "Preise" : locale === "es" ? "Precios" : "Pricing"}
          </p>
          <h2 className="text-3xl font-bold text-[var(--color-text-primary)] mb-4">
            {locale === "de"
              ? "Transparente Preise in CHF"
              : locale === "es"
              ? "Precios transparentes en CHF"
              : "Transparent pricing in CHF"}
          </h2>
          <p className="text-[var(--color-text-secondary)] max-w-xl mx-auto">
            {locale === "de"
              ? "Keine versteckten Kosten. Jederzeit kündbar. MWST nicht inbegriffen."
              : locale === "es"
              ? "Sin costes ocultos. Cancele cuando quiera. IVA no incluido."
              : "No hidden fees. Cancel anytime. VAT not included."}
          </p>

          {/* Toggle */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <span
              className={`text-sm font-medium transition-colors ${
                !annual ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"
              }`}
            >
              {labels.monthly}
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className="relative w-12 h-6 rounded-full transition-colors"
              style={{ backgroundColor: annual ? "rgb(79 70 229)" : "var(--color-surface-600)" }}
              aria-checked={annual}
              role="switch"
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  annual ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
            <span
              className={`text-sm font-medium transition-colors ${
                annual ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"
              }`}
            >
              {labels.annual}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
              {labels.save}
            </span>
          </div>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-6 border transition-all duration-300 flex flex-col ${
                plan.highlighted
                  ? "bg-indigo-600/10 border-indigo-500/40 shadow-xl shadow-indigo-500/10"
                  : "bg-[var(--color-surface-900)] border-[var(--color-surface-600)] hover:border-[var(--color-surface-500)]"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold text-white bg-indigo-600 shadow-lg shadow-indigo-500/30 uppercase tracking-wider">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      plan.highlighted ? "bg-indigo-600" : "bg-[var(--color-surface-700)]"
                    }`}
                  >
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                    {plan.name}
                  </h3>
                </div>

                <div className="mt-4 mb-2">
                  {plan.id === "enterprise" ? (
                    <span className="text-2xl font-bold text-[var(--color-text-primary)]">
                      {locale === "de" ? "Auf Anfrage" : locale === "es" ? "A consultar" : "Custom"}
                    </span>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold text-[var(--color-text-primary)]">
                        CHF {annual ? plan.annual : plan.monthly}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {CURRENCY_LABEL[locale] ?? CURRENCY_LABEL.en}
                      </span>
                    </div>
                  )}
                  {annual && plan.id !== "enterprise" && (
                    <p className="text-xs text-emerald-400 mt-1">
                      {locale === "de"
                        ? `CHF ${plan.monthly - plan.annual} gespart`
                        : locale === "es"
                        ? `CHF ${plan.monthly - plan.annual} ahorrados`
                        : `CHF ${plan.monthly - plan.annual} saved`}
                      {" "}/ {locale === "de" ? "Monat" : locale === "es" ? "mes" : "month"}
                    </p>
                  )}
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]">
                    <Check className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  plan.highlighted
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                    : "bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-text-primary)] border border-[var(--color-surface-600)]"
                }`}
                onClick={() => {
                  // TODO: Stripe checkout — implement /api/checkout with STRIPE_SECRET_KEY
                  if (plan.id === "enterprise") {
                    window.location.href = `mailto:hello@helpdesk.ai?subject=Enterprise inquiry`;
                  } else {
                    alert("Stripe checkout coming soon — add STRIPE_SECRET_KEY to enable payments.");
                  }
                }}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
