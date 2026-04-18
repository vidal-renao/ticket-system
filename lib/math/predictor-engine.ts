/**
 * Predictive Analytics Engine — Data Agnostic
 * Log-log OLS regression + Cooley-Tukey FFT + Z-score + Phase detection
 */

export interface DataPoint {
  date: Date;
  value: number;
}

export interface RegressionResult {
  exponent: number;
  logCoefficient: number;
  r2: number;
  sigma: number;
}

export interface Harmonic {
  index: number;
  binK: number;
  padN: number;
  amplitude: number;
  phase: number;
  periodDays: number;
}

export interface SeriesPoint {
  date: Date;
  actual: number;
  fairValue: number;
  support: number;
  resistance: number;
  residual: number;
  zScore: number;
}

export interface ForecastPoint {
  date: Date;
  fairValue: number;
  support: number;
  resistance: number;
}

export type MarketPhase = "accumulation" | "bullish" | "distribution" | "bearish";
export type Signal = "buy" | "sell" | "hold";

export interface CurrentMetrics {
  residual: number;
  zScore: number;
  percentile: number;
  phase: MarketPhase;
  signal: Signal;
  signalConfidence: number;
  nextPeak: { date: Date; estimatedValue: number } | null;
}

export interface PredictorOutput {
  regression: RegressionResult;
  series: SeriesPoint[];
  harmonics: Harmonic[];
  current: CurrentMetrics;
  forecast: ForecastPoint[];
  avgDaysBetweenSamples: number;
}

// ─── Cooley-Tukey radix-2 in-place DIT FFT ────────────────────────────────
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cRe = 1, cIm = 0;
      for (let k = 0; k < len >> 1; k++) {
        const uR = re[i + k], uI = im[i + k];
        const half = i + k + (len >> 1);
        const vR = re[half] * cRe - im[half] * cIm;
        const vI = re[half] * cIm + im[half] * cRe;
        re[i + k] = uR + vR; im[i + k] = uI + vI;
        re[half] = uR - vR;  im[half] = uI - vI;
        const nRe = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = nRe;
      }
    }
  }
}

function nextPow2(n: number): number {
  let p = 1; while (p < n) p <<= 1; return p;
}

// ─── Reconstruction ────────────────────────────────────────────────────────
export function reconstructAt(
  sampleIdx: number,
  harmonics: Harmonic[],
  active: boolean[],
): number {
  let sum = 0;
  for (let h = 0; h < harmonics.length; h++) {
    if (!active[h]) continue;
    const { amplitude, phase, binK, padN } = harmonics[h];
    sum += amplitude * Math.cos((2 * Math.PI * binK * sampleIdx) / padN + phase);
  }
  return sum;
}

// ─── Main entry point ──────────────────────────────────────────────────────
export function runPredictor(
  data: DataPoint[],
  forecastDays = 365,
): PredictorOutput {
  if (data.length < 8) throw new Error("Need at least 8 data points.");

  const sorted = [...data].sort((a, b) => a.date.getTime() - b.date.getTime());
  const n = sorted.length;
  const t0 = sorted[0].date.getTime();
  const dayIndices = sorted.map((p) => (p.date.getTime() - t0) / 86_400_000 + 1);

  const avgDays =
    n > 1 ? dayIndices[n - 1] / (n - 1) : 1;

  // ── OLS log-log regression ──────────────────────────────────────────────
  const valid = sorted
    .map((p, i) => ({ xi: Math.log10(dayIndices[i]), yi: Math.log10(p.value) }))
    .filter((v) => isFinite(v.xi) && isFinite(v.yi));

  const vn = valid.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (const { xi, yi } of valid) {
    sx += xi; sy += yi; sxy += xi * yi; sx2 += xi * xi;
  }
  const denom = vn * sx2 - sx * sx;
  const exponent = denom !== 0 ? (vn * sxy - sx * sy) / denom : 1;
  const logC = (sy - exponent * sx) / vn;

  const yMean = sy / vn;
  let ssTot = 0, ssRes = 0;
  for (const { xi, yi } of valid) {
    const yHat = exponent * xi + logC;
    ssRes += (yi - yHat) ** 2;
    ssTot += (yi - yMean) ** 2;
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  const residuals = sorted.map((p, i) => {
    if (p.value <= 0 || dayIndices[i] <= 0) return 0;
    return Math.log10(p.value) - (exponent * Math.log10(dayIndices[i]) + logC);
  });
  const sigma = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);

  // ── FFT on residuals ────────────────────────────────────────────────────
  const padN = nextPow2(n);
  const reArr = new Float64Array(padN);
  const imArr = new Float64Array(padN);
  for (let i = 0; i < n; i++) reArr[i] = residuals[i];
  fft(reArr, imArr);

  const bins: { k: number; amp: number; ph: number }[] = [];
  for (let k = 1; k <= padN >> 1; k++) {
    bins.push({
      k,
      amp: Math.sqrt(reArr[k] ** 2 + imArr[k] ** 2) / (padN >> 1),
      ph: Math.atan2(imArr[k], reArr[k]),
    });
  }
  bins.sort((a, b) => b.amp - a.amp);

  const harmonics: Harmonic[] = bins.slice(0, 8).map((b, i) => ({
    index: i,
    binK: b.k,
    padN,
    amplitude: b.amp,
    phase: b.ph,
    periodDays: (padN / b.k) * avgDays,
  }));

  const allActive = new Array<boolean>(8).fill(true);

  // ── Build series ────────────────────────────────────────────────────────
  const series: SeriesPoint[] = sorted.map((p, i) => {
    const logFV = exponent * Math.log10(dayIndices[i]) + logC;
    return {
      date: p.date,
      actual: p.value,
      fairValue: 10 ** logFV,
      support: 10 ** (logFV - 2 * sigma),
      resistance: 10 ** (logFV + 2 * sigma),
      residual: residuals[i],
      zScore: sigma > 0 ? residuals[i] / sigma : 0,
    };
  });

  // ── Current metrics ─────────────────────────────────────────────────────
  const last = n - 1;
  const lastZ = series[last].zScore;
  const sortedRes = [...residuals].sort((a, b) => a - b);
  const pct = Math.round(
    (sortedRes.filter((r) => r <= residuals[last]).length / n) * 100,
  );

  const currRec = reconstructAt(last, harmonics, allActive);
  const prevRec = reconstructAt(Math.max(0, last - 3), harmonics, allActive);
  const rising = currRec > prevRec;
  const positive = currRec > 0;

  const phase: MarketPhase =
    !positive && rising ? "accumulation" :
    positive  && rising ? "bullish" :
    positive  && !rising ? "distribution" : "bearish";

  let signal: Signal, signalConfidence: number;
  if (lastZ < -1.5)                                              { signal = "buy";  signalConfidence = 90; }
  else if (lastZ < -0.5 && (phase === "accumulation" || phase === "bullish"))
                                                                 { signal = "buy";  signalConfidence = 65; }
  else if (lastZ > 1.5)                                          { signal = "sell"; signalConfidence = 90; }
  else if (lastZ > 0.5  && (phase === "distribution" || phase === "bearish"))
                                                                 { signal = "sell"; signalConfidence = 70; }
  else                                                           { signal = "hold"; signalConfidence = 50; }

  // Next peak: first local maximum in reconstructed signal going forward
  const lastDay = dayIndices[last];
  const lastDate = sorted[last].date;
  let nextPeak: CurrentMetrics["nextPeak"] = null;
  let prev = currRec;
  for (let d = 1; d <= 730 && !nextPeak; d++) {
    const futIdx = last + d / avgDays;
    const curr = reconstructAt(futIdx, harmonics, allActive);
    if (d > 1 && curr < prev) {
      const peakDay = lastDay + d - 1;
      const logFVPeak = exponent * Math.log10(peakDay) + logC;
      nextPeak = {
        date: new Date(lastDate.getTime() + (d - 1) * 86_400_000),
        estimatedValue: 10 ** (logFVPeak + prev),
      };
    }
    prev = curr;
  }

  // ── Forecast ────────────────────────────────────────────────────────────
  const forecast: ForecastPoint[] = Array.from({ length: forecastDays }, (_, d) => {
    const futDay = lastDay + d + 1;
    const logFV = exponent * Math.log10(futDay) + logC;
    return {
      date: new Date(lastDate.getTime() + (d + 1) * 86_400_000),
      fairValue: 10 ** logFV,
      support: 10 ** (logFV - 2 * sigma),
      resistance: 10 ** (logFV + 2 * sigma),
    };
  });

  return {
    regression: { exponent, logCoefficient: logC, r2, sigma },
    series,
    harmonics,
    current: { residual: residuals[last], zScore: lastZ, percentile: pct, phase, signal, signalConfidence, nextPeak },
    forecast,
    avgDaysBetweenSamples: avgDays,
  };
}
