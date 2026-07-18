"use client";

import { useState, useMemo, useCallback } from "react";
import { TrendingUp, Activity, Zap, BarChart3, Target, ChevronDown, ChevronUp } from "lucide-react";
import { runPredictor, reconstructAt, type PredictorOutput } from "@/lib/math/predictor-engine";
import { DATASETS, type DatasetKey } from "@/lib/math/mock-datasets";
import { cn } from "@/lib/utils";

// ─── Chart helpers ─────────────────────────────────────────────────────────
const W = 800, H = 280, PX = 48, PY = 24;
const CW = W - PX * 2, CH = H - PY * 2;

function scX(d: Date, min: number, max: number) {
  return PX + ((d.getTime() - min) / (max - min)) * CW;
}
function scY(v: number, min: number, max: number) {
  return PY + CH - ((v - min) / (max - min)) * CH;
}
function linePath(pts: [number, number][]) {
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}
function areaPath(upper: [number, number][], lower: [number, number][]) {
  const up = linePath(upper);
  const dn = [...lower].reverse().map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return `${up} ${dn} Z`;
}

// ─── Phase colours ─────────────────────────────────────────────────────────
const PHASE_COLOR = {
  accumulation: "text-blue-400",
  bullish:      "text-emerald-400",
  distribution: "text-amber-400",
  bearish:      "text-red-400",
} as const;

const SIGNAL_CONFIG = {
  buy:  { label: "BUY",  cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/25 shadow-[0_0_20px_rgba(52,211,153,0.15)]" },
  sell: { label: "SELL", cls: "text-red-400    bg-red-400/10    border-red-400/25    shadow-[0_0_20px_rgba(248,113,113,0.15)]" },
  hold: { label: "HOLD", cls: "text-amber-400  bg-amber-400/10  border-amber-400/25  shadow-[0_0_20px_rgba(251,191,36,0.12)]"  },
} as const;

const HARMONIC_COLORS = [
  "#f97316","#6366f1","#22c55e","#a855f7",
  "#ec4899","#14b8a6","#f59e0b","#3b82f6",
];

// ─── Metric Card ────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3
                    shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_4px_16px_rgba(0,0,0,0.3)]">
      <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">{label}</p>
      <p className={cn("text-lg font-bold font-mono tabular-nums leading-none", accent ?? "text-white/90")}>{value}</p>
      {sub && <p className="text-[11px] text-white/40 mt-0.5 font-mono">{sub}</p>}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function PredictiveEngine() {
  const [datasetKey, setDatasetKey] = useState<DatasetKey>("sme-cashflow");
  const [activeH, setActiveH] = useState<boolean[]>(new Array(8).fill(true));
  const [showFourier, setShowFourier] = useState(false);

  const dataset = DATASETS[datasetKey];

  const output: PredictorOutput = useMemo(
    () => runPredictor(dataset.data, 365),
    [datasetKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const toggleHarmonic = useCallback((i: number) => {
    setActiveH((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  }, []);

  const toggleAll = useCallback((on: boolean) => setActiveH(new Array(8).fill(on)), []);

  // ── Compute reconstructed series with current active harmonics ────────────
  const reconstructedSeries = useMemo(
    () => output.series.map((_, i) => reconstructAt(i, output.harmonics, activeH)),
    [output, activeH],
  );

  // ── SVG coordinates ──────────────────────────────────────────────────────
  const { series, forecast, regression, current } = output;
  const allDates  = [...series.map((s) => s.date), ...forecast.map((f) => f.date)];
  const allValues = [
    ...series.map((s) => s.actual),
    ...series.map((s) => s.resistance),
    ...forecast.map((f) => f.resistance),
  ];
  const minT = Math.min(...allDates.map((d) => d.getTime()));
  const maxT = Math.max(...allDates.map((d) => d.getTime()));
  const rawMin = Math.min(...allValues), rawMax = Math.max(...allValues);
  const pad = (rawMax - rawMin) * 0.08;
  const minV = rawMin - pad, maxV = rawMax + pad;

  const x = (d: Date)  => scX(d, minT, maxT);
  const y = (v: number) => scY(v, minV, maxV);

  const bandUpper = series.map<[number, number]>((s) => [x(s.date), y(s.resistance)]);
  const bandLower = series.map<[number, number]>((s) => [x(s.date), y(s.support)]);
  const fcBandU   = forecast.map<[number, number]>((f) => [x(f.date), y(f.resistance)]);
  const fcBandL   = forecast.map<[number, number]>((f) => [x(f.date), y(f.support)]);

  // ── Residuals chart ──────────────────────────────────────────────────────
  const RW = 800, RH = 120, RPX = 48, RPY = 12;
  const RCW = RW - RPX * 2, RCH = RH - RPY * 2;
  const resMin = Math.min(...series.map((s) => s.residual));
  const resMax = Math.max(...series.map((s) => s.residual));
  const resPad = Math.max(Math.abs(resMin), Math.abs(resMax)) * 1.2 || 0.1;
  const ry = (v: number) => RPY + RCH - ((v + resPad) / (2 * resPad)) * RCH;
  const ry0 = ry(0);
  const barW = Math.max(2, (RCW / series.length) - 1);

  // ── Fourier chart: reconstructed vs residuals ────────────────────────────
  const FW = 800, FH = 120, FPX = 48, FPY = 12;
  const FCW = FW - FPX * 2, FCH = FH - FPY * 2;
  const fMin = Math.min(...reconstructedSeries, ...series.map((s) => s.residual));
  const fMax = Math.max(...reconstructedSeries, ...series.map((s) => s.residual));
  const fPad = (Math.abs(fMax) + Math.abs(fMin)) * 0.15 || 0.05;
  const fMinV = fMin - fPad, fMaxV = fMax + fPad;
  const fx = (_: unknown, i: number) => FPX + (i / (series.length - 1)) * FCW;
  const fy = (v: number) => FPY + FCH - ((v - fMinV) / (fMaxV - fMinV)) * FCH;

  const residualPath = series.map<[number, number]>((s, i) => [fx(null, i), fy(s.residual)]);
  const reconPath    = reconstructedSeries.map<[number, number]>((v, i) => [fx(null, i), fy(v)]);

  // ── X axis tick labels ───────────────────────────────────────────────────
  const tickCount = 6;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const t = minT + ((maxT - minT) * i) / (tickCount - 1);
    const d = new Date(t);
    return { x: scX(d, minT, maxT), label: d.toLocaleDateString("de-CH", { month: "short", year: "2-digit" }) };
  });

  const fmt = dataset.formatValue;
  const sig = SIGNAL_CONFIG[current.signal];

  // ── Today separator x ───────────────────────────────────────────────────
  const todayX = x(series[series.length - 1].date);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white/90 tracking-tight">Predictive Analytics</h1>
          <p className="text-sm text-white/40 mt-0.5 font-mono">
            Log-log regression · Fourier decomposition · Z-score signal
          </p>
        </div>
        {/* Dataset selector */}
        <div className="flex gap-1 p-1 rounded-lg border border-white/[0.06] bg-white/[0.02]">
          {(Object.keys(DATASETS) as DatasetKey[]).map((k) => (
            <button
              key={k}
              onClick={() => { setDatasetKey(k); setActiveH(new Array(8).fill(true)); }}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-opacity duration-150",
                datasetKey === k
                  ? "bg-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.35)]"
                  : "text-white/50 hover:text-white/70",
              )}
            >
              {DATASETS[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-5">
        {/* ── Left: charts ── */}
        <div className="space-y-4">
          {/* Main trend chart */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015]
                          shadow-[0_0_0_1px_rgba(99,102,241,0.06),0_8px_32px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.03)_inset]
                          overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.05]">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-medium text-white/60">Trend · {dataset.description}</span>
              <span className="ml-auto text-[10px] font-mono text-white/30">
                R² {(regression.r2 * 100).toFixed(1)}% · σ {regression.sigma.toFixed(3)}
              </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 280 }}>
              {/* ±2σ band — historical */}
              <path d={areaPath(bandUpper, bandLower)} fill="rgba(99,102,241,0.07)" />
              {/* ±2σ band — forecast */}
              <path d={areaPath(fcBandU, fcBandL)} fill="rgba(99,102,241,0.04)" />
              {/* Today divider */}
              <line x1={todayX} y1={PY} x2={todayX} y2={PY + CH}
                stroke="rgba(255,255,255,0.1)" strokeWidth={1} strokeDasharray="4 3" />
              {/* Fair value — historical */}
              <path
                d={linePath(series.map<[number, number]>((s) => [x(s.date), y(s.fairValue)]))}
                fill="none" stroke="#6366f1" strokeWidth={1.5} opacity={0.7}
              />
              {/* Fair value — forecast */}
              <path
                d={linePath(forecast.map<[number, number]>((f) => [x(f.date), y(f.fairValue)]))}
                fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.4}
              />
              {/* Resistance line */}
              <path
                d={linePath([...bandUpper, ...fcBandU])}
                fill="none" stroke="#6366f1" strokeWidth={0.75} opacity={0.3} strokeDasharray="3 4"
              />
              {/* Actual data line */}
              <path
                d={linePath(series.map<[number, number]>((s) => [x(s.date), y(s.actual)]))}
                fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={2}
              />
              {/* Data points */}
              {series.map((s, i) => (
                <circle key={i} cx={x(s.date)} cy={y(s.actual)} r={2.5}
                  fill={s.zScore < -1 ? "#34d399" : s.zScore > 1 ? "#f87171" : "#fff"}
                  opacity={0.6} />
              ))}
              {/* X axis */}
              {ticks.map((t, i) => (
                <g key={i}>
                  <line x1={t.x} y1={PY + CH} x2={t.x} y2={PY + CH + 4} stroke="rgba(255,255,255,0.15)" />
                  <text x={t.x} y={PY + CH + 14} textAnchor="middle"
                    fill="rgba(255,255,255,0.3)" fontSize={9} fontFamily="monospace">{t.label}</text>
                </g>
              ))}
              {/* Y axis labels */}
              {[minV + (maxV - minV) * 0.1, minV + (maxV - minV) * 0.5, minV + (maxV - minV) * 0.9].map((v, i) => (
                <text key={i} x={PX - 6} y={y(v) + 3} textAnchor="end"
                  fill="rgba(255,255,255,0.25)" fontSize={9} fontFamily="monospace">
                  {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
                </text>
              ))}
              {/* Legend */}
              <g transform={`translate(${PX + 8}, ${PY + 8})`}>
                <line x1={0} y1={6} x2={18} y2={6} stroke="white" strokeWidth={1.5} opacity={0.6} />
                <text x={22} y={10} fill="rgba(255,255,255,0.4)" fontSize={9} fontFamily="monospace">Actual</text>
                <line x1={60} y1={6} x2={78} y2={6} stroke="#6366f1" strokeWidth={1.5} opacity={0.7} />
                <text x={82} y={10} fill="rgba(255,255,255,0.4)" fontSize={9} fontFamily="monospace">Trend</text>
                <rect x={120} y={2} width={18} height={8} fill="rgba(99,102,241,0.15)" />
                <text x={142} y={10} fill="rgba(255,255,255,0.4)" fontSize={9} fontFamily="monospace">±2σ band</text>
              </g>
            </svg>
          </div>

          {/* Residuals chart */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015]
                          shadow-[0_4px_16px_rgba(0,0,0,0.35)] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.05]">
              <BarChart3 className="w-3.5 h-3.5 text-white/40" />
              <span className="text-xs font-medium text-white/60">Residuals (log scale)</span>
              <span className="ml-auto text-[10px] font-mono text-white/30">
                z-score current: <span className={current.zScore < 0 ? "text-emerald-400" : "text-red-400"}>
                  {current.zScore.toFixed(2)}
                </span>
              </span>
            </div>
            <svg viewBox={`0 0 ${RW} ${RH}`} className="w-full" style={{ height: 120 }}>
              {/* Zero line */}
              <line x1={RPX} y1={ry0} x2={RPX + RCW} y2={ry0}
                stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
              {/* ±2σ reference */}
              {[output.regression.sigma * 2, -output.regression.sigma * 2].map((v, i) => (
                <line key={i} x1={RPX} y1={ry(v)} x2={RPX + RCW} y2={ry(v)}
                  stroke="rgba(99,102,241,0.35)" strokeWidth={0.75} strokeDasharray="4 3" />
              ))}
              {/* Bars */}
              {series.map((s, i) => {
                const bx = RPX + (i / series.length) * RCW;
                const isPos = s.residual >= 0;
                const by = isPos ? ry(s.residual) : ry0;
                const bh = Math.abs(ry(s.residual) - ry0);
                return (
                  <rect key={i} x={bx} y={by} width={barW} height={Math.max(1, bh)}
                    fill={isPos ? "rgba(251,146,60,0.7)" : "rgba(96,165,250,0.7)"} />
                );
              })}
            </svg>
          </div>

          {/* Fourier panel (collapsible) */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015]
                          shadow-[0_4px_16px_rgba(0,0,0,0.35)] overflow-hidden">
            <button
              onClick={() => setShowFourier((v) => !v)}
              className="w-full flex items-center gap-2 px-5 py-3 border-b border-white/[0.05]
                         hover:bg-white/[0.02] transition-opacity"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-medium text-white/60">Fourier Decomposition</span>
              <span className="ml-auto mr-1 text-[10px] font-mono text-white/30">
                {activeH.filter(Boolean).length} / 8 harmonics active
              </span>
              {showFourier ? <ChevronUp className="w-3.5 h-3.5 text-white/30" /> : <ChevronDown className="w-3.5 h-3.5 text-white/30" />}
            </button>

            {showFourier && (
              <div className="p-4 space-y-4">
                {/* Harmonic toggles */}
                <div className="flex flex-wrap gap-2 items-center">
                  <button onClick={() => toggleAll(true)}
                    className="text-[10px] font-mono px-2.5 py-1 rounded border border-white/10 text-white/50 hover:text-white/70 transition-opacity">
                    All
                  </button>
                  <button onClick={() => toggleAll(false)}
                    className="text-[10px] font-mono px-2.5 py-1 rounded border border-white/10 text-white/50 hover:text-white/70 transition-opacity">
                    None
                  </button>
                  {output.harmonics.map((h, i) => (
                    <button key={i} onClick={() => toggleHarmonic(i)}
                      className={cn(
                        "text-[10px] font-mono px-2.5 py-1 rounded border transition-opacity",
                        activeH[i] ? "opacity-100" : "opacity-30",
                      )}
                      style={{
                        borderColor: `${HARMONIC_COLORS[i]}40`,
                        color: HARMONIC_COLORS[i],
                        backgroundColor: activeH[i] ? `${HARMONIC_COLORS[i]}12` : "transparent",
                      }}>
                      {i === 0 ? "Fund." : `H${i}`} · {h.periodDays >= 365
                        ? `${(h.periodDays / 365).toFixed(1)}y`
                        : `${Math.round(h.periodDays)}d`}
                    </button>
                  ))}
                </div>
                {/* Reconstruction chart */}
                <svg viewBox={`0 0 ${FW} ${FH}`} className="w-full" style={{ height: 120 }}>
                  <line x1={FPX} y1={fy(0)} x2={FPX + FCW} y2={fy(0)}
                    stroke="rgba(255,255,255,0.1)" strokeWidth={0.75} />
                  <path d={linePath(residualPath)} fill="none"
                    stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
                  <path d={linePath(reconPath)} fill="none"
                    stroke="#f97316" strokeWidth={1.5} />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar ── */}
        <aside className="space-y-3">
          {/* Signal badge */}
          <div className={cn(
            "rounded-xl border px-5 py-4 text-center",
            sig.cls,
          )}>
            <p className="text-[10px] font-mono uppercase tracking-widest opacity-60 mb-1">Signal</p>
            <p className="text-3xl font-black tracking-tighter">{sig.label}</p>
            <p className="text-sm font-mono mt-1 opacity-70">{current.signalConfidence}% confidence</p>
          </div>

          {/* Phase */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3
                          shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">Market Phase</p>
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-white/30" />
              <span className={cn("text-sm font-semibold capitalize", PHASE_COLOR[current.phase])}>
                {current.phase}
              </span>
            </div>
          </div>

          <MetricCard
            label="Current Value"
            value={fmt(series[series.length - 1].actual)}
            sub={`Fair value: ${fmt(series[series.length - 1].fairValue)}`}
          />
          <MetricCard
            label="Z-Score"
            value={current.zScore.toFixed(3)}
            sub={`${current.percentile}th percentile`}
            accent={current.zScore < -1 ? "text-emerald-400" : current.zScore > 1 ? "text-red-400" : "text-white/90"}
          />
          <MetricCard
            label="R² · Fit Quality"
            value={`${(regression.r2 * 100).toFixed(1)}%`}
            sub={`Exponent: ${regression.exponent.toFixed(3)}`}
          />
          <MetricCard
            label="Sigma (1σ)"
            value={regression.sigma.toFixed(4)}
            sub="Log-scale std deviation"
          />
          {current.nextPeak && (
            <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.04] px-4 py-3
                            shadow-[0_0_16px_rgba(99,102,241,0.08)]">
              <div className="flex items-center gap-1.5 mb-1">
                <Target className="w-3 h-3 text-indigo-400" />
                <p className="text-[10px] font-mono uppercase tracking-widest text-indigo-400/70">
                  Next Peak (est.)
                </p>
              </div>
              <p className="text-sm font-bold font-mono text-white/80">
                {fmt(current.nextPeak.estimatedValue)}
              </p>
              <p className="text-[11px] text-white/40 font-mono mt-0.5">
                {current.nextPeak.date.toLocaleDateString("de-CH", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[10px] text-white/20 font-mono text-center leading-relaxed px-1">
            Mathematical model only. Not financial advice.
            Past patterns ≠ future results.
          </p>
        </aside>
      </div>
    </div>
  );
}
