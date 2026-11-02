import { mean, stdev } from "./spc";

// Process capability, control-chart rules and limit tuning: the statistics a
// test engineer reaches for before moving a limit. Pure, so the limits pages,
// Ask FIXT and the tests all agree on the numbers.

export type Limits = { lsl: number | null; usl: number | null };

// Distributions -------------------------------------------------------------------------

/** Complementary error function, with under 1.2e-7 relative error, so tail ppm stays accurate. */
function erfc(x: number) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

/** P(Z ≤ z) for a standard normal. */
export function normalCdf(z: number) {
  return 0.5 * erfc(-z / Math.SQRT2);
}

function lnGamma(x: number) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number) {
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
function betaInc(x: number, a: number, b: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betacf(a, b, x)) / a : 1 - (front * betacf(b, a, 1 - x)) / b;
}

/** P(F > f) for an F distribution: the p-value of an ANOVA. */
export function fSurvival(f: number, df1: number, df2: number) {
  if (!(f > 0)) return 1;
  return betaInc(df2 / (df2 + df1 * f), df2 / 2, df1 / 2);
}

// Descriptive ---------------------------------------------------------------------------

/** Linear-interpolated quantile of sorted values (Excel's PERCENTILE.INC). */
export function quantile(sorted: number[], p: number) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}

/** Short-term σ from the average moving range (MR̄ / d2, d2 = 1.128). Leaves out slow drift and shifts. */
export function sigmaWithin(xs: number[]) {
  if (xs.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < xs.length; i++) sum += Math.abs(xs[i] - xs[i - 1]);
  return sum / (xs.length - 1) / 1.128;
}

function moments(xs: number[]) {
  const m = mean(xs);
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of xs) {
    const d = x - m;
    m2 += d * d;
    m3 += d ** 3;
    m4 += d ** 4;
  }
  const n = xs.length;
  m2 /= n;
  m3 /= n;
  m4 /= n;
  return { skew: m2 ? m3 / m2 ** 1.5 : 0, kurtosis: m2 ? m4 / m2 ** 2 - 3 : 0 };
}

/**
 * Anderson-Darling normality test. p < 0.05 means the data isn't normal
 * (bimodal, skewed or long-tailed), so normal-model ppm and Cpk are rough.
 */
export function andersonDarling(xs: number[]) {
  const n = xs.length;
  if (n < 8) return { a2: NaN, p: NaN };
  const m = mean(xs);
  const s = stdev(xs);
  if (!(s > 0)) return { a2: NaN, p: NaN };
  const z = [...xs].sort((a, b) => a - b).map((x) => Math.min(1 - 1e-12, Math.max(1e-12, normalCdf((x - m) / s))));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (2 * i + 1) * (Math.log(z[i]) + Math.log(1 - z[n - 1 - i]));
  const a2 = -n - sum / n;
  const a = a2 * (1 + 0.75 / n + 2.25 / n ** 2);
  const p =
    a >= 0.6 ? Math.exp(1.2937 - 5.709 * a + 0.0186 * a * a) : a >= 0.34 ? Math.exp(0.9177 - 4.279 * a - 1.38 * a * a) : a >= 0.2 ? 1 - Math.exp(-8.318 + 42.796 * a - 59.938 * a * a) : 1 - Math.exp(-13.436 + 101.14 * a - 223.73 * a * a);
  return { a2, p: Math.min(1, Math.max(0, p)) };
}

// Capability ----------------------------------------------------------------------------

export type Capability = {
  n: number;
  mean: number;
  /** Overall (long-term) σ, for Pp/Ppk and ppm. */
  sd: number;
  /** Within (short-term) σ from moving ranges, for Cp/Cpk. */
  sdWithin: number;
  min: number;
  max: number;
  cp: number | null;
  cpk: number | null;
  pp: number | null;
  ppk: number | null;
  /** Expected parts per million outside each limit, from a normal fit with the overall σ. */
  ppm: { below: number; above: number; total: number };
  /** What actually happened against these limits. */
  observed: { below: number; above: number; rate: number };
  skew: number;
  kurtosis: number;
  normality: { a2: number; p: number; normal: boolean };
};

const index = (m: number, s: number, { lsl, usl }: Limits) => {
  if (!(s > 0) || (lsl == null && usl == null)) return { full: null, k: null };
  const upper = usl == null ? Infinity : (usl - m) / (3 * s);
  const lower = lsl == null ? Infinity : (m - lsl) / (3 * s);
  return { full: lsl != null && usl != null ? (usl - lsl) / (6 * s) : null, k: Math.min(upper, lower) };
};

/** Cp/Cpk (within σ), Pp/Ppk (overall σ), expected and observed fallout against the limits. */
export function capability(xs: number[], limits: Limits): Capability {
  const m = mean(xs);
  const sd = stdev(xs);
  const sw = sigmaWithin(xs);
  const within = index(m, sw, limits);
  const overall = index(m, sd, limits);
  const below = limits.lsl == null || !(sd > 0) ? 0 : normalCdf((limits.lsl - m) / sd) * 1e6;
  const above = limits.usl == null || !(sd > 0) ? 0 : (1 - normalCdf((limits.usl - m) / sd)) * 1e6;
  const obsBelow = limits.lsl == null ? 0 : xs.filter((x) => x < limits.lsl!).length;
  const obsAbove = limits.usl == null ? 0 : xs.filter((x) => x > limits.usl!).length;
  const ad = andersonDarling(xs);
  return {
    n: xs.length,
    mean: m,
    sd,
    sdWithin: sw,
    min: xs.length ? Math.min(...xs) : NaN,
    max: xs.length ? Math.max(...xs) : NaN,
    cp: within.full,
    cpk: within.k,
    pp: overall.full,
    ppk: overall.k,
    ppm: { below, above, total: below + above },
    observed: { below: obsBelow, above: obsAbove, rate: xs.length ? (obsBelow + obsAbove) / xs.length : 0 },
    ...moments(xs),
    normality: { ...ad, normal: !(ad.p < 0.05) },
  };
}

// Control-chart rules -------------------------------------------------------------------

export type RuleKey = "beyond_3s" | "two_of_three" | "four_of_five" | "run_of_eight" | "trend_of_six";
export const RULES: Record<RuleKey, { label: string; hint: string }> = {
  beyond_3s: { label: "Beyond 3σ", hint: "One point outside the control limits." },
  two_of_three: { label: "2 of 3 beyond 2σ", hint: "Two of three points past 2σ on the same side." },
  four_of_five: { label: "4 of 5 beyond 1σ", hint: "Four of five points past 1σ on the same side." },
  run_of_eight: { label: "Run of 8", hint: "Eight points in a row on one side of center: a shift." },
  trend_of_six: { label: "Trend of 6", hint: "Six points in a row rising or falling: drift." },
};

export type Signal = { rule: RuleKey; index: number };

/** Western Electric rules (plus the trend rule) on values in time order. Each signal is where its pattern completes. */
export function controlSignals(xs: number[], center: number, sd: number): Signal[] {
  if (!(sd > 0)) return [];
  const z = xs.map((x) => (x - center) / sd);
  const out: Signal[] = [];
  const side = (v: number) => Math.sign(v);
  let run = 0;
  let trend = 0;
  for (let i = 0; i < z.length; i++) {
    if (Math.abs(z[i]) > 3) out.push({ rule: "beyond_3s", index: i });
    if (i >= 2) {
      const w = z.slice(i - 2, i + 1);
      for (const s of [1, -1]) if (side(z[i]) === s && z[i] * s > 2 && w.filter((v) => v * s > 2).length >= 2) out.push({ rule: "two_of_three", index: i });
    }
    if (i >= 4) {
      const w = z.slice(i - 4, i + 1);
      for (const s of [1, -1]) if (side(z[i]) === s && z[i] * s > 1 && w.filter((v) => v * s > 1).length >= 4) out.push({ rule: "four_of_five", index: i });
    }
    run = i > 0 && side(z[i]) !== 0 && side(z[i]) === side(z[i - 1]) ? run + 1 : 1;
    if (run === 8) out.push({ rule: "run_of_eight", index: i });
    const dir = i > 0 ? Math.sign(z[i] - z[i - 1]) : 0;
    const prev = i > 1 ? Math.sign(z[i - 1] - z[i - 2]) : 0;
    trend = dir !== 0 && dir === prev ? trend + 1 : dir !== 0 ? 1 : 0;
    // Six points rising or falling = five steps the same way.
    if (trend === 5) out.push({ rule: "trend_of_six", index: i });
  }
  return out;
}

/**
 * Whether the test is in statistical control. A stable process still trips a
 * rule now and then (about one point in 90 across these rules), so it takes
 * more than that to call it unstable.
 */
export function isStable(signals: Signal[], n: number) {
  const beyond = signals.filter((s) => s.rule === "beyond_3s").length;
  const shifts = signals.filter((s) => s.rule === "run_of_eight" || s.rule === "four_of_five").length;
  return beyond < Math.max(4, n * 0.02) && shifts < Math.max(4, n * 0.03) && signals.length < Math.max(8, n * 0.06);
}

/**
 * The bulk of the data, ignoring a minority cluster: median and MAD-based σ
 * (1.4826 × MAD matches σ for normal data), how many results sit more than
 * 4 robust σ out, and how many of those are isolated (the result before them
 * wasn't one). Isolated outliers come and go; a drift's stay.
 */
export function robustSpread(xs: number[]) {
  const sorted = [...xs].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const mad = quantile(
    xs.map((x) => Math.abs(x - median)).sort((a, b) => a - b),
    0.5,
  );
  const sd = 1.4826 * mad;
  // The cluster itself inflates the MAD, so a second pass re-flags against the
  // spread of what's left.
  const first = xs.filter((x) => !(sd > 0 && Math.abs(x - median) > 4 * sd));
  const m1 = mean(first);
  const s1 = stdev(first);
  const out = xs.map((x) => s1 > 0 && Math.abs(x - m1) > 3.5 * s1);
  const inliers = xs.filter((_, i) => !out[i]);
  const firstHalf = out.slice(0, Math.floor(xs.length / 2)).filter(Boolean).length;
  const outliers = out.filter(Boolean).length;
  return {
    median,
    sd,
    /** Mean and σ of everything but the outliers. */
    inliers: { mean: mean(inliers), sd: stdev(inliers) },
    outliers,
    isolated: out.filter((o, i) => o && !out[i - 1]).length,
    /** Share of the outliers in the first half of the history: near 0.5 when they're spread through it. */
    earlyShare: outliers ? firstHalf / outliers : 0,
  };
}

// Comparing groups ----------------------------------------------------------------------

export type GroupStat = { label: string; n: number; mean: number; sd: number };
export type Anova = { f: number; df1: number; df2: number; p: number };

/** One-way ANOVA: do the groups' means differ by more than their spread explains? */
export function anova(groups: number[][]): Anova | null {
  const gs = groups.filter((g) => g.length >= 2);
  const n = gs.reduce((s, g) => s + g.length, 0);
  if (gs.length < 2 || n - gs.length < 1) return null;
  const grand = mean(gs.flat());
  const ssb = gs.reduce((s, g) => s + g.length * (mean(g) - grand) ** 2, 0);
  const ssw = gs.reduce((s, g) => {
    const m = mean(g);
    return s + g.reduce((a, x) => a + (x - m) ** 2, 0);
  }, 0);
  const df1 = gs.length - 1;
  const df2 = n - gs.length;
  if (ssw === 0) return { f: Infinity, df1, df2, p: ssb > 0 ? 0 : 1 };
  const f = ssb / df1 / (ssw / df2);
  return { f, df1, df2, p: fSurvival(f, df1, df2) };
}

/** Mean and spread per group (shift, lot, board revision, station), largest group first. */
export function groupStats<T>(items: T[], key: (x: T) => string | null, value: (x: T) => number) {
  const by = new Map<string, number[]>();
  for (const x of items) {
    const k = key(x);
    if (k == null) continue;
    by.set(k, [...(by.get(k) ?? []), value(x)]);
  }
  const groups: GroupStat[] = [...by.entries()].map(([label, vs]) => ({ label, n: vs.length, mean: mean(vs), sd: stdev(vs) })).sort((a, b) => b.n - a.n);
  return { groups, anova: anova([...by.values()]) };
}

// Limit tuning --------------------------------------------------------------------------

export type LimitMethod = "cpk" | "percentile";

/** Rounds a limit to a sensible number of decimals for the spread (about σ / 10). */
export function roundLimit(v: number, sd: number) {
  if (!Number.isFinite(v)) return v;
  const decimals = sd > 0 ? Math.min(6, Math.max(0, 1 - Math.floor(Math.log10(sd)))) : 3;
  return Number(v.toFixed(decimals));
}

/**
 * Proposed limits from the data. Only the sides the test already limits are
 * set, so a one-sided test stays one-sided.
 *  - cpk: mean ± 3·target·σ (overall σ), so the process lands at that Ppk.
 *  - percentile: the empirical tails (p and 1 - p), widened by `margin` of the
 *    span between them; for data that isn't normal.
 */
export function suggestLimits(xs: number[], current: Limits, method: LimitMethod, param: number, margin = 0): Limits {
  const sides = current.lsl == null && current.usl == null ? { lower: true, upper: true } : { lower: current.lsl != null, upper: current.usl != null };
  const sd = stdev(xs);
  let lo: number;
  let hi: number;
  if (method === "cpk") {
    const m = mean(xs);
    lo = m - 3 * param * sd;
    hi = m + 3 * param * sd;
  } else {
    const sorted = [...xs].sort((a, b) => a - b);
    const qlo = quantile(sorted, param);
    const qhi = quantile(sorted, 1 - param);
    const pad = (qhi - qlo) * margin;
    lo = qlo - pad;
    hi = qhi + pad;
  }
  return { lsl: sides.lower ? roundLimit(lo, sd) : null, usl: sides.upper ? roundLimit(hi, sd) : null };
}

export type Impact = {
  current: { fails: number; yield: number };
  proposed: { fails: number; yield: number };
  /** Units that passed and would now fail (tightening catches these). */
  newlyFailing: number;
  /** Units that failed and would now pass (widening ships these). */
  newlyPassing: number;
};

const fails = (x: number, { lsl, usl }: Limits) => (lsl != null && x < lsl) || (usl != null && x > usl);

/** Replays history against proposed limits. */
export function limitImpact(xs: number[], current: Limits, proposed: Limits): Impact {
  let before = 0;
  let after = 0;
  let newlyFailing = 0;
  let newlyPassing = 0;
  for (const x of xs) {
    const a = fails(x, current);
    const b = fails(x, proposed);
    if (a) before++;
    if (b) after++;
    if (!a && b) newlyFailing++;
    if (a && !b) newlyPassing++;
  }
  const n = xs.length || 1;
  return { current: { fails: before, yield: 1 - before / n }, proposed: { fails: after, yield: 1 - after / n }, newlyFailing, newlyPassing };
}

// Assessment ----------------------------------------------------------------------------

export type Verdict = "no_limits" | "insufficient" | "test_issue" | "unstable" | "too_tight" | "off_center" | "marginal" | "capable" | "loose";

export const VERDICTS: Record<Verdict, { label: string; tone: string; rank: number }> = {
  test_issue: { label: "Test issue", tone: "bg-rose-50 text-rose-700 ring-rose-200", rank: 8 },
  unstable: { label: "Unstable", tone: "bg-rose-50 text-rose-700 ring-rose-200", rank: 7 },
  too_tight: { label: "Limits too tight", tone: "bg-rose-50 text-rose-700 ring-rose-200", rank: 6 },
  off_center: { label: "Off center", tone: "bg-amber-50 text-amber-800 ring-amber-200", rank: 5 },
  marginal: { label: "Marginal", tone: "bg-amber-50 text-amber-800 ring-amber-200", rank: 4 },
  loose: { label: "Limits loose", tone: "bg-sky-50 text-sky-700 ring-sky-200", rank: 3 },
  no_limits: { label: "No limits", tone: "bg-zinc-100 text-zinc-600 ring-zinc-200", rank: 2 },
  capable: { label: "Capable", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", rank: 1 },
  insufficient: { label: "Not enough data", tone: "bg-zinc-100 text-zinc-600 ring-zinc-200", rank: 0 },
};

/** Target Cpk for a capable process (the usual automotive / IPC bar). */
export const TARGET_CPK = 1.33;
/** Above this Ppk the limits are far enough out that a real shift would still pass. */
export const LOOSE_PPK = 3;
const MIN_N = 30;

export type Assessment = {
  verdict: Verdict;
  summary: string;
  /** Limits that would fix it, when moving limits is the right fix. */
  suggestion: Limits | null;
  /** Caveats, like data that isn't normal. */
  notes: string[];
};

const fmt = (v: number | null) => (v == null ? "none" : String(v));

/**
 * What a test engineer would conclude, in order: is there data, is the
 * process stable, then does its spread fit the limits. Limits are only worth
 * moving on a stable process; on an unstable one the fix is the process.
 */
export function assess(xs: number[], limits: Limits, cap: Capability, signals: Signal[]): Assessment {
  const notes: string[] = [];
  if (cap.n >= MIN_N && !cap.normality.normal)
    notes.push(`The data isn't normal (Anderson-Darling p = ${cap.normality.p < 0.001 ? "< 0.001" : cap.normality.p.toFixed(3)}${Math.abs(cap.skew) > 1 ? `, skew ${cap.skew.toFixed(1)}` : ""}), so Cpk and the ppm estimate are approximate. The percentile method fits it better.`);
  if (limits.lsl == null && limits.usl == null) {
    const s = cap.n >= MIN_N ? suggestLimits(xs, limits, "cpk", TARGET_CPK + 0.67) : null;
    return { verdict: "no_limits", summary: "No limits are set, so every unit passes and this test can't catch a defect.", suggestion: s, notes };
  }
  if (cap.n < MIN_N) return { verdict: "insufficient", summary: `Only ${cap.n} results. Capability needs at least ${MIN_N} to mean much.`, suggestion: null, notes };
  const ppk = cap.ppk ?? 0;
  // Most results inside the limits plus a separate cluster outside them that
  // comes and goes: that's the test (settling time, contact, fixture), not the
  // product. A drift's or a bad lot's outliers come in a row and late in the
  // history instead, and fall to "unstable".
  const robust = robustSpread(xs);
  const robustPpk = index(robust.inliers.mean, robust.inliers.sd, limits).k ?? 0;
  const scattered = robust.isolated >= robust.outliers * 0.6 && robust.earlyShare >= 0.2 && robust.earlyShare <= 0.8;
  if (!cap.normality.normal && cap.observed.rate >= 0.01 && robust.outliers / cap.n >= 0.01 && scattered && robustPpk >= 1)
    return {
      verdict: "test_issue",
      summary: `Most results sit well inside the limits (Ppk ${robustPpk.toFixed(2)} without the outliers), but ${((robust.outliers / cap.n) * 100).toFixed(1)}% read far outside the rest. A separate cluster like that is usually the test itself: settling time, probe contact or the fixture. Retest those units and fix the test; widening the limits would hide real failures.`,
      suggestion: null,
      notes,
    };
  if (!isStable(signals, cap.n))
    return {
      verdict: "unstable",
      summary: `The process isn't in statistical control (${signals.length} control-rule signals). Find and fix the cause first: limits tuned on unstable data bake the problem in.`,
      suggestion: null,
      notes,
    };
  if (ppk < 1) {
    if ((cap.pp ?? 0) >= TARGET_CPK)
      return {
        verdict: "off_center",
        summary: `The spread fits inside the limits (Pp ${cap.pp!.toFixed(2)}) but the process sits off center, so Ppk is only ${ppk.toFixed(2)}. Re-center the process or the fixture rather than moving limits.`,
        suggestion: null,
        notes,
      };
    const s = suggestLimits(xs, limits, cap.normality.normal ? "cpk" : "percentile", cap.normality.normal ? TARGET_CPK : 0.001, 0.1);
    return {
      verdict: "too_tight",
      summary: `The limits sit inside the process's natural spread (Ppk ${ppk.toFixed(2)}), so about ${Math.round(cap.ppm.total).toLocaleString()} ppm fail. If the design spec allows, ${fmt(s.lsl)} to ${fmt(s.usl)} would bring Ppk to about ${TARGET_CPK}. Otherwise the process needs less variation.`,
      suggestion: s,
      notes,
    };
  }
  if (ppk < TARGET_CPK) return { verdict: "marginal", summary: `Capable but with little margin (Ppk ${ppk.toFixed(2)}, target ${TARGET_CPK}). A small shift would start failing units.`, suggestion: null, notes };
  if (ppk > LOOSE_PPK) {
    const s = suggestLimits(xs, limits, "cpk", 2);
    return {
      verdict: "loose",
      summary: `The limits are far outside the spread (Ppk ${ppk.toFixed(2)}). A shift big enough to matter would still pass. Tightening to ${fmt(s.lsl)} to ${fmt(s.usl)} (Ppk 2.0) would catch drift sooner without failing good units.`,
      suggestion: s,
      notes,
    };
  }
  return { verdict: "capable", summary: `Capable and centered (Ppk ${ppk.toFixed(2)}). No change needed.`, suggestion: null, notes };
}

/** Everything about one test's results, for the list, the detail page and Ask FIXT. */
export function analyzeTest(xs: number[], limits: Limits, baseline: { mean: number | null; sd: number | null } = { mean: null, sd: null }) {
  const cap = capability(xs, limits);
  const center = baseline.mean ?? cap.mean;
  // A baseline from a few dozen results can understate σ; the short-term σ keeps
  // that from turning ordinary noise into signals.
  const sd = Math.max(baseline.sd ?? 0, cap.sdWithin);
  const signals = controlSignals(xs, center, sd);
  return { capability: cap, center, controlSd: sd, signals, assessment: assess(xs, limits, cap, signals) };
}
