// Statistical process control: the math behind drift detection, control
// charts and Cpk. Pure, so tests cover it and the ingest path, the seed and the
// station page all agree on the numbers.

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

/** Sample standard deviation (n - 1). */
export function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Process capability against the spec limits. With one limit it's the
 * one-sided index; with none it's null. Uses the sample's own spread.
 */
export function cpk(xs: number[], lsl: number | null, usl: number | null) {
  const m = mean(xs);
  const s = stdev(xs);
  if (!xs.length || s === 0 || (lsl == null && usl == null)) return null;
  const upper = usl == null ? Infinity : (usl - m) / (3 * s);
  const lower = lsl == null ? Infinity : (m - lsl) / (3 * s);
  return Math.min(upper, lower);
}

/** Control limits (mean ± 3σ) from the baseline. */
export function controlLimits(baselineMean: number, baselineSd: number) {
  return { center: baselineMean, ucl: baselineMean + 3 * baselineSd, lcl: baselineMean - 3 * baselineSd };
}

export type DriftResult = {
  drifting: boolean;
  /** How far the recent mean sits from baseline, in baseline standard deviations (signed). */
  sigmaShift: number;
  recentMean: number;
  /** Index into the series where the shift began (first point of the run that crossed). */
  startIndex: number | null;
};

/**
 * EWMA drift check on values in time order. Flags drift when the smoothed
 * value leaves the EWMA control band (L = 3) around the baseline. The start is
 * where the smoothed series last sat inside half the band, so the alert can say
 * "started at" rather than only "noticed at".
 *
 * λ = 0.2 catches a sustained shift of about 1σ within roughly ten units, while
 * a single outlier won't trip it.
 */
export function detectDrift(values: number[], baselineMean: number, baselineSd: number, lambda = 0.2, L = 3): DriftResult {
  if (!values.length || !(baselineSd > 0)) return { drifting: false, sigmaShift: 0, recentMean: mean(values), startIndex: null };
  // Steady-state EWMA standard deviation.
  const band = L * baselineSd * Math.sqrt(lambda / (2 - lambda));
  let z = baselineMean;
  let lastQuiet = -1;
  let crossed: number | null = null;
  for (let i = 0; i < values.length; i++) {
    z = lambda * values[i] + (1 - lambda) * z;
    const dev = Math.abs(z - baselineMean);
    if (dev <= band / 2) lastQuiet = i;
    if (dev > band && crossed === null) crossed = i;
    if (dev <= band) crossed = null;
  }
  const tail = values.slice(-Math.min(values.length, 20));
  const recentMean = mean(tail);
  return {
    drifting: crossed !== null,
    sigmaShift: (recentMean - baselineMean) / baselineSd,
    recentMean,
    startIndex: crossed === null ? null : Math.min(lastQuiet + 1, values.length - 1),
  };
}

/** How serious a drift is, from how far it moved and how close it now is to a limit. */
export function driftSeverity(sigmaShift: number, recentMean: number, lsl: number | null, usl: number | null, sd: number): "critical" | "high" | "medium" | "low" {
  const margin = Math.min(usl == null ? Infinity : usl - recentMean, lsl == null ? Infinity : recentMean - lsl);
  if (margin <= 0) return "critical";
  if (sd > 0 && margin < 2 * sd) return "high";
  if (Math.abs(sigmaShift) >= 2) return "high";
  if (Math.abs(sigmaShift) >= 1) return "medium";
  return "low";
}

/** Histogram bins for a distribution chart. */
export function histogram(xs: number[], bins = 24, range?: [number, number]) {
  if (!xs.length) return [];
  const lo = range?.[0] ?? Math.min(...xs);
  const hi = range?.[1] ?? Math.max(...xs);
  const width = (hi - lo) / bins || 1;
  const counts = Array.from({ length: bins }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 }));
  for (const x of xs) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / width)));
    counts[i].count++;
  }
  return counts;
}

export const pct = (num: number, den: number) => (den ? num / den : 0);
