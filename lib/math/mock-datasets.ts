import type { DataPoint } from "./predictor-engine";

export type DatasetKey = "sme-cashflow" | "real-estate-basel";

export interface Dataset {
  key: DatasetKey;
  label: string;
  description: string;
  unit: string;
  formatValue: (v: number) => string;
  data: DataPoint[];
}

// ─── SME Cashflow: monthly revenue Jan 2021 – Dec 2024 ───────────────────
function buildSMECashflow(): DataPoint[] {
  const start = new Date("2021-01-01");
  return Array.from({ length: 48 }, (_, m) => {
    const date = new Date(start);
    date.setMonth(date.getMonth() + m);
    const mo = date.getMonth(); // 0–11
    const trend = 68_000 * Math.exp(0.0088 * m);                  // ~11% annual
    const seasonal = 1 + 0.28 * Math.sin(2 * Math.PI * (mo - 2) / 12); // peak Nov-Dec
    const noise = 1 + 0.038 * Math.sin(m * 2.71828 + 1.618);
    return { date: new Date(date), value: Math.round(trend * seasonal * noise) };
  });
}

// ─── Real Estate Basel: quarterly price CHF/m² Q1 2018 – Q4 2024 ─────────
function buildRealEstateBasel(): DataPoint[] {
  const start = new Date("2018-01-01");
  return Array.from({ length: 28 }, (_, q) => {
    const date = new Date(start);
    date.setMonth(date.getMonth() + q * 3);
    const trend = 5_950 * Math.pow(1.055, q / 4);                 // ~5.5% annual
    const covid = (q >= 9 && q <= 11) ? 0.96 : 1.0;              // Q2–Q4 2020 dip
    const seasonal = 1 + 0.025 * Math.sin(2 * Math.PI * (q % 4) / 4);
    const noise = 1 + 0.018 * Math.sin(q * 1.41421 + 0.577);
    return { date: new Date(date), value: Math.round(trend * covid * seasonal * noise) };
  });
}

const CHF = new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 });

export const DATASETS: Record<DatasetKey, Dataset> = {
  "sme-cashflow": {
    key: "sme-cashflow",
    label: "SME Cashflow",
    description: "Monthly revenue — Swiss SME (Basel region)",
    unit: "CHF / month",
    formatValue: (v) => CHF.format(v),
    data: buildSMECashflow(),
  },
  "real-estate-basel": {
    key: "real-estate-basel",
    label: "Real Estate Basel",
    description: "Average sale price per m² — Kanton Basel-Stadt",
    unit: "CHF / m²",
    formatValue: (v) => `${CHF.format(v)}/m²`,
    data: buildRealEstateBasel(),
  },
};
