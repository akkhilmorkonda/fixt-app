import { hoursBetween } from "./format";
import type { Alert, Failure, Investigation, Lot, Settings, Station, YieldRow } from "./types";

// Derived numbers for the fleet, analytics and ROI pages. Pure, so tests pin
// down exactly how each headline number is computed.

export type YieldSummary = { units: number; firstPass: number; finalPass: number; fpy: number; finalYield: number };

export function summarizeYield(rows: YieldRow[]): YieldSummary {
  const units = rows.reduce((s, r) => s + r.units, 0);
  const firstPass = rows.reduce((s, r) => s + r.first_pass, 0);
  const finalPass = rows.reduce((s, r) => s + r.final_pass, 0);
  return { units, firstPass, finalPass, fpy: units ? firstPass / units : 0, finalYield: units ? finalPass / units : 0 };
}

/** Yield for the latest `days` days vs. the `days` before, for trend arrows. */
export function yieldTrend(rows: YieldRow[], days: number, today: string) {
  const cut = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const prevCut = new Date(Date.parse(`${cut}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  const current = summarizeYield(rows.filter((r) => r.day >= cut));
  const previous = summarizeYield(rows.filter((r) => r.day >= prevCut && r.day < cut));
  return { current, previous, delta: current.fpy - previous.fpy };
}

/** Daily first-pass yield, oldest first. */
export function dailyYield(rows: YieldRow[]) {
  const by = new Map<string, YieldRow[]>();
  for (const r of rows) by.set(r.day, [...(by.get(r.day) ?? []), r]);
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, rs]) => ({ day, ...summarizeYield(rs) }));
}

/** Counts by key, largest first, with the running share (for a Pareto chart). */
export function pareto<T>(items: T[], key: (x: T) => string | null, weight: (x: T) => number = () => 1) {
  const totals = new Map<string, number>();
  for (const x of items) {
    const k = key(x);
    if (k == null) continue;
    totals.set(k, (totals.get(k) ?? 0) + weight(x));
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  let running = 0;
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => {
      running += value;
      return { label, value, share: sum ? value / sum : 0, cumulative: sum ? running / sum : 0 };
    });
}

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 } as const;

/** Open issues ranked by severity, then units at risk, then newest. */
export function rankIssues<T extends Pick<Alert, "severity" | "units_at_risk" | "detected_at">>(alerts: T[]) {
  return [...alerts].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.units_at_risk - a.units_at_risk || b.detected_at.localeCompare(a.detected_at),
  );
}

/** Hours from opening to root cause, for investigations that got there. */
export function timeToRootCause(inv: Pick<Investigation, "opened_at" | "root_caused_at">) {
  return inv.root_caused_at ? hoursBetween(inv.opened_at, inv.root_caused_at) : null;
}

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The share of at-risk units assumed to ship if a problem isn't caught on the line. */
export const ESCAPE_RATE = 0.01;

export type Roi = {
  days: number;
  catches: number;
  rootCaused: number;
  medianHoursToRootCause: number | null;
  baselineHours: number;
  engineerHoursSaved: number;
  retestHoursSaved: number;
  unitsProtected: number;
  escapesPrevented: number;
  fieldEscapes: number;
  value: { engineering: number; retest: number; escapes: number; total: number };
  cost: number;
  multiple: number | null;
};

/**
 * What FIXT was worth over a window.
 *  - catches: drift, anomaly and false-failure alerts the agents raised
 *  - engineer-hours saved: for each investigation root-caused in the window,
 *    the baseline time to root cause (before FIXT) minus the actual time
 *  - retest hours saved: retest time on false failures from fixed alerts (resolved ones)
 *  - escapes prevented: units at risk on root-caused investigations × ESCAPE_RATE
 *  - cost: the annual price, prorated to the window
 */
export function computeRoi(input: { alerts: Alert[]; investigations: Investigation[]; failures: Failure[]; settings: Settings; days: number; now?: number }): Roi {
  const now = input.now ?? Date.now();
  const since = now - input.days * 86_400_000;
  const inWindow = (iso: string | null) => iso != null && Date.parse(iso) >= since && Date.parse(iso) <= now;
  const s = input.settings;

  const catches = input.alerts.filter((a) => ["drift", "anomaly", "false_failure"].includes(a.kind) && inWindow(a.detected_at)).length;
  const caused = input.investigations.filter((i) => inWindow(i.root_caused_at));
  const hours = caused.map((i) => timeToRootCause(i)!).filter((h) => h != null);
  const engineerHoursSaved = hours.reduce((sum, h) => sum + Math.max(0, s.baseline_root_cause_hours - h), 0);

  const resolvedStations = new Set(input.alerts.filter((a) => a.kind === "false_failure" && a.status === "resolved").map((a) => a.station_id));
  const retestHoursSaved = input.failures.filter((f) => f.false_failure && resolvedStations.has(f.station_id) && inWindow(f.failed_at)).reduce((sum, f) => sum + f.retest_minutes / 60, 0);

  const unitsProtected = caused.reduce((sum, i) => sum + i.units_at_risk, 0);
  const escapesPrevented = Math.round(unitsProtected * ESCAPE_RATE);
  const fieldEscapes = input.failures.filter((f) => f.escaped && inWindow(f.failed_at)).length;

  const engineering = engineerHoursSaved * s.engineer_hourly_rate;
  const retest = retestHoursSaved * s.engineer_hourly_rate;
  const escapes = escapesPrevented * s.escape_cost;
  const total = engineering + retest + escapes;
  const cost = (s.fixt_annual_price * input.days) / 365;

  return {
    days: input.days,
    catches,
    rootCaused: caused.length,
    medianHoursToRootCause: median(hours),
    baselineHours: s.baseline_root_cause_hours,
    engineerHoursSaved,
    retestHoursSaved,
    unitsProtected,
    escapesPrevented,
    fieldEscapes,
    value: { engineering, retest, escapes, total },
    cost,
    multiple: cost > 0 ? total / cost : null,
  };
}

/** Failure rate per component lot, for the supplier comparison. */
export function lotQuality(lots: Lot[], failures: Failure[]) {
  return lots
    .map((l) => {
      const fails = failures.filter((f) => f.lot_id === l.id && !f.false_failure);
      return { ...l, failures: fails.length, escapes: fails.filter((f) => f.escaped).length, ppm: l.units ? Math.round((fails.length / l.units) * 1_000_000) : 0 };
    })
    .sort((a, b) => b.ppm - a.ppm);
}

/** Scrap, rework and retest totals: the cost of quality. */
export function costOfQuality(failures: Failure[], hourlyRate: number) {
  const scrap = failures.reduce((s, f) => s + f.scrap_cost, 0);
  const reworkHours = failures.reduce((s, f) => s + f.rework_minutes, 0) / 60;
  const retestHours = failures.reduce((s, f) => s + f.retest_minutes, 0) / 60;
  return { scrap, reworkHours, retestHours, total: scrap + (reworkHours + retestHours) * hourlyRate };
}

/** Station health, for fixture cards: how close to each maintenance limit. */
export function fixtureHealth(s: Station, today = new Date()) {
  const cycles = s.fixture_cycles / s.fixture_cycle_limit;
  const calDays = s.calibration_due ? Math.round((Date.parse(`${s.calibration_due}T00:00:00Z`) - today.getTime()) / 86_400_000) : null;
  const worst = Math.max(cycles, s.probe_wear_pct / 100, calDays == null ? 0 : calDays <= 0 ? 1 : calDays <= 7 ? 0.9 : 0);
  return { cycles, calDays, tone: worst >= 0.9 ? "bad" : worst >= 0.75 ? "warn" : "ok" } as const;
}

/** False-failure stats per station: how often a failed unit passes on retest. */
export function falseFailureStats(failures: Failure[]) {
  const by = new Map<string, { failures: number; retested: number; retestPassed: number; falseFailures: number; retestMinutes: number }>();
  for (const f of failures) {
    if (f.escaped) continue;
    const s = by.get(f.station_id) ?? { failures: 0, retested: 0, retestPassed: 0, falseFailures: 0, retestMinutes: 0 };
    s.failures++;
    if (f.retest_passed != null) s.retested++;
    if (f.retest_passed) s.retestPassed++;
    if (f.false_failure) s.falseFailures++;
    s.retestMinutes += f.retest_minutes;
    by.set(f.station_id, s);
  }
  return [...by.entries()]
    .map(([station_id, s]) => ({ station_id, ...s, retestPassRate: s.retested ? s.retestPassed / s.retested : 0 }))
    .sort((a, b) => b.retestPassRate * b.failures - a.retestPassRate * a.failures);
}
