"use client";

import { useState } from "react";
import { Check, X, Minus } from "lucide-react";

type CellValue = boolean | "partial" | string;

interface Feature {
  label: string;
  helpdesk: CellValue;
  zendesk: CellValue;
  freshdesk: CellValue;
  jira: CellValue;
}

const FEATURES_EN: Feature[] = [
  { label: "AI-powered triage", helpdesk: true, zendesk: "partial", freshdesk: "partial", jira: false },
  { label: "Swiss DSG/nDSG compliant", helpdesk: true, zendesk: false, freshdesk: false, jira: false },
  { label: "Data hosted in Switzerland", helpdesk: true, zendesk: false, freshdesk: false, jira: false },
  { label: "PII auto-redaction", helpdesk: true, zendesk: false, freshdesk: false, jira: false },
  { label: "Multilingual DE / EN / ES", helpdesk: true, zendesk: true, freshdesk: true, jira: "partial" },
  { label: "SLA management", helpdesk: true, zendesk: true, freshdesk: true, jira: true },
  { label: "AI sentiment analysis", helpdesk: true, zendesk: "partial", freshdesk: false, jira: false },
  { label: "Immutable audit logs", helpdesk: true, zendesk: "partial", freshdesk: false, jira: "partial" },
  { label: "Setup time", helpdesk: "< 1 day", zendesk: "Weeks", freshdesk: "Days", jira: "Weeks" },
  { label: "Starting price", helpdesk: "CHF 49/mo", zendesk: "$55/agent", freshdesk: "$15/agent", jira: "$17/agent" },
];

const FEATURES_DE: Feature[] = [
  { label: "KI-gestütztes Triage", helpdesk: true, zendesk: "partial", freshdesk: "partial", jira: false },
  { label: "DSG/nDSG-konform", helpdesk: true, zendesk: false, freshdesk: false, jira: false },
  { label: "Daten in der Schweiz gehostet", helpdesk: true, zendesk: false, freshdesk: false, jira: false },
  { label: "Automatische PII-Bereinigung", helpdesk: true, zendesk: false, freshdesk: false, jira: false },
  { label: "Mehrsprachig DE / EN / ES", helpdesk: true, zendesk: true, freshdesk: true, jira: "partial" },
  { label: "SLA-Verwaltung", helpdesk: true, zendesk: true, freshdesk: true, jira: true },
  { label: "KI-Stimmungsanalyse", helpdesk: true, zendesk: "partial", freshdesk: false, jira: false },
  { label: "Unveränderliche Audit-Logs", helpdesk: true, zendesk: "partial", freshdesk: false, jira: "partial" },
  { label: "Einrichtungszeit", helpdesk: "< 1 Tag", zendesk: "Wochen", freshdesk: "Tage", jira: "Wochen" },
  { label: "Einstiegspreis", helpdesk: "CHF 49/Mo.", zendesk: "$55/Agent", freshdesk: "$15/Agent", jira: "$17/Agent" },
];

const FEATURES_ES: Feature[] = [
  { label: "Triage con IA", helpdesk: true, zendesk: "partial", freshdesk: "partial", jira: false },
  { label: "Conforme con DSG/nDSG suiza", helpdesk: true, zendesk: false, freshdesk: false, jira: false },
  { label: "Datos alojados en Suiza", helpdesk: true, zendesk: false, freshdesk: false, jira: false },
  { label: "Redacción automática de PII", helpdesk: true, zendesk: false, freshdesk: false, jira: false },
  { label: "Multilingüe DE / EN / ES", helpdesk: true, zendesk: true, freshdesk: true, jira: "partial" },
  { label: "Gestión de SLA", helpdesk: true, zendesk: true, freshdesk: true, jira: true },
  { label: "Análisis de sentimiento IA", helpdesk: true, zendesk: "partial", freshdesk: false, jira: false },
  { label: "Registros de auditoría inmutables", helpdesk: true, zendesk: "partial", freshdesk: false, jira: "partial" },
  { label: "Tiempo de configuración", helpdesk: "< 1 día", zendesk: "Semanas", freshdesk: "Días", jira: "Semanas" },
  { label: "Precio inicial", helpdesk: "CHF 49/mes", zendesk: "$55/agente", freshdesk: "$15/agente", jira: "$17/agente" },
];

const FEATURES_BY_LOCALE: Record<string, Feature[]> = { de: FEATURES_DE, en: FEATURES_EN, es: FEATURES_ES };

const COLUMNS = ["helpdesk", "zendesk", "freshdesk", "jira"] as const;
type Column = typeof COLUMNS[number];

const COL_LABELS: Record<Column, string> = {
  helpdesk: "HelpDesk AI",
  zendesk: "Zendesk",
  freshdesk: "Freshdesk",
  jira: "Jira SM",
};

function Cell({ value, isOurs }: { value: CellValue; isOurs: boolean }) {
  if (typeof value === "string" && value !== "partial") {
    return (
      <td
        className={`px-4 py-3 text-center text-xs font-medium ${
          isOurs ? "text-indigo-300" : "text-[var(--color-text-muted)]"
        }`}
      >
        {value}
      </td>
    );
  }
  if (value === true) {
    return (
      <td className="px-4 py-3 text-center">
        <div className="flex justify-center">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isOurs ? "bg-indigo-500/20" : "bg-emerald-500/10"}`}>
            <Check className={`w-3 h-3 ${isOurs ? "text-indigo-400" : "text-emerald-400"}`} />
          </div>
        </div>
      </td>
    );
  }
  if (value === "partial") {
    return (
      <td className="px-4 py-3 text-center">
        <div className="flex justify-center">
          <div className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Minus className="w-3 h-3 text-amber-400" />
          </div>
        </div>
      </td>
    );
  }
  return (
    <td className="px-4 py-3 text-center">
      <div className="flex justify-center">
        <div className="w-5 h-5 rounded-full bg-[var(--color-surface-700)] flex items-center justify-center">
          <X className="w-3 h-3 text-[var(--color-text-muted)]" />
        </div>
      </div>
    </td>
  );
}

export function ComparisonTable({ locale }: { locale: string }) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const features = FEATURES_BY_LOCALE[locale] ?? FEATURES_EN;

  const sectionTitle: Record<string, string> = {
    de: "Warum HelpDesk AI?",
    en: "Why HelpDesk AI?",
    es: "¿Por qué HelpDesk AI?",
  };
  const sectionSub: Record<string, string> = {
    de: "Der einzige Helpdesk, der von Grund auf für den Schweizer Markt entwickelt wurde.",
    en: "The only helpdesk built from the ground up for the Swiss market.",
    es: "El único helpdesk construido desde cero para el mercado suizo.",
  };
  const partialLabel: Record<string, string> = {
    de: "= Als Add-on verfügbar",
    en: "= Available as add-on",
    es: "= Disponible como complemento",
  };

  return (
    <section className="py-24 px-6 bg-[var(--color-surface-950)]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">
            {locale === "de" ? "Vergleich" : locale === "es" ? "Comparativa" : "Comparison"}
          </p>
          <h2 className="text-3xl font-bold text-[var(--color-text-primary)] mb-4">
            {sectionTitle[locale] ?? sectionTitle.en}
          </h2>
          <p className="text-[var(--color-text-secondary)] max-w-xl mx-auto">
            {sectionSub[locale] ?? sectionSub.en}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-surface-600)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-surface-600)]">
                <th className="px-4 py-4 text-left text-xs font-medium text-[var(--color-text-muted)] w-1/3">
                  Feature
                </th>
                {COLUMNS.map((col) => (
                  <th
                    key={col}
                    className={`px-4 py-4 text-center text-xs font-semibold ${
                      col === "helpdesk"
                        ? "text-indigo-400 bg-indigo-600/5"
                        : "text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {COL_LABELS[col]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((feature, i) => (
                <tr
                  key={i}
                  onMouseEnter={() => setHoveredRow(i)}
                  onMouseLeave={() => setHoveredRow(null)}
                  className={`border-b border-[var(--color-surface-600)] last:border-0 transition-colors ${
                    hoveredRow === i ? "bg-[var(--color-surface-800)]" : i % 2 === 0 ? "bg-[var(--color-surface-900)]" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                    {feature.label}
                  </td>
                  {COLUMNS.map((col) => (
                    <Cell
                      key={col}
                      value={feature[col]}
                      isOurs={col === "helpdesk"}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-4 text-xs text-[var(--color-text-muted)]">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Minus className="w-2.5 h-2.5 text-amber-400" />
            </div>
            <span>{partialLabel[locale] ?? partialLabel.en}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
