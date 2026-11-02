import { describe, expect, it } from "vitest";
import { computeRoi, costOfQuality, falseFailureStats, lotQuality, median, pareto, rankIssues, summarizeYield, yieldTrend } from "@/lib/fixt/metrics";
import { DEFAULT_SETTINGS, type Alert, type Failure, type Investigation, type YieldRow } from "@/lib/fixt/types";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

const failure = (o: Partial<Failure>): Failure => ({
  id: "f",
  station_id: "s1",
  test_id: null,
  lot_id: null,
  failed_at: ago(1),
  serial: null,
  mode: "x",
  shift: "A",
  board_rev: "C",
  retest_passed: null,
  false_failure: false,
  escaped: false,
  scrap_cost: 0,
  rework_minutes: 0,
  retest_minutes: 0,
  ...o,
});

const alert = (o: Partial<Alert>): Alert => ({
  id: "a",
  station_id: "s1",
  test_id: null,
  kind: "drift",
  classification: "fixture",
  title: "t",
  detail: null,
  baseline: null,
  current: null,
  unit: null,
  started_at: null,
  detected_at: ago(1),
  severity: "medium",
  units_at_risk: 0,
  status: "open",
  investigation_id: null,
  resolved_at: null,
  ...o,
});

const inv = (o: Partial<Investigation>): Investigation => ({
  id: "i",
  number: 1001,
  title: "t",
  station_id: null,
  product_id: null,
  status: "root_caused",
  severity: "high",
  units_at_risk: 0,
  failure_mode: null,
  classification: "fixture",
  hypothesis: null,
  confidence: null,
  evidence: [],
  suggested_test: null,
  diagnosis_model: null,
  diagnosed_at: null,
  assignee_id: null,
  assignee_name: null,
  opened_at: ago(3),
  root_caused_at: null,
  closed_at: null,
  share_token: null,
  updated_at: ago(0),
  ...o,
});

describe("yield", () => {
  const rows: YieldRow[] = [
    { line_id: "l", day: "2026-10-31", shift: "A", units: 100, first_pass: 95, final_pass: 99 },
    { line_id: "l", day: "2026-11-01", shift: "A", units: 100, first_pass: 97, final_pass: 100 },
    { line_id: "l", day: "2026-10-30", shift: "A", units: 100, first_pass: 90, final_pass: 98 },
  ];
  it("sums units and computes first-pass and final yield", () => {
    expect(summarizeYield(rows)).toMatchObject({ units: 300, firstPass: 282, finalPass: 297, fpy: 0.94 });
    expect(summarizeYield([]).fpy).toBe(0);
  });
  it("compares the latest window with the one before", () => {
    const t = yieldTrend(rows, 1, "2026-11-01");
    expect(t.current.fpy).toBe(0.97);
    expect(t.previous.fpy).toBe(0.95);
    expect(t.delta).toBeCloseTo(0.02);
  });
});

describe("pareto and ranking", () => {
  it("sorts largest first with cumulative share", () => {
    const p = pareto(["a", "b", "a", "c", "a", "b"], (x) => x);
    expect(p.map((r) => r.label)).toEqual(["a", "b", "c"]);
    expect(p[0].share).toBeCloseTo(0.5);
    expect(p[2].cumulative).toBeCloseTo(1);
  });
  it("ranks by severity, then units at risk", () => {
    const r = rankIssues([alert({ id: "1", severity: "medium", units_at_risk: 900 }), alert({ id: "2", severity: "critical" }), alert({ id: "3", severity: "medium", units_at_risk: 1000 })]);
    expect(r.map((a) => a.id)).toEqual(["2", "3", "1"]);
  });
  it("takes medians", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("ROI", () => {
  it("counts hours saved against the pre-FIXT baseline and prorates cost", () => {
    const settings = { ...DEFAULT_SETTINGS, baseline_root_cause_hours: 168, engineer_hourly_rate: 100, escape_cost: 1000, fixt_annual_price: 365_000 };
    const roi = computeRoi({
      now: NOW,
      days: 30,
      settings,
      alerts: [alert({ kind: "drift" }), alert({ kind: "calibration" }), alert({ kind: "false_failure", status: "resolved", station_id: "s2" })],
      investigations: [
        inv({ opened_at: ago(10), root_caused_at: new Date(NOW - 10 * 86_400_000 + 24 * 3_600_000).toISOString(), units_at_risk: 500 }),
        inv({ opened_at: ago(60), root_caused_at: ago(59) }), // outside the window
        inv({ status: "open" }),
      ],
      failures: [failure({ station_id: "s2", false_failure: true, retest_minutes: 60 }), failure({ escaped: true })],
    });
    expect(roi.catches).toBe(2);
    expect(roi.rootCaused).toBe(1);
    expect(roi.engineerHoursSaved).toBeCloseTo(144);
    expect(roi.retestHoursSaved).toBeCloseTo(1);
    expect(roi.escapesPrevented).toBe(5);
    expect(roi.fieldEscapes).toBe(1);
    expect(roi.value.total).toBeCloseTo(144 * 100 + 100 + 5000);
    expect(roi.cost).toBeCloseTo(30_000);
    expect(roi.multiple).toBeCloseTo(roi.value.total / 30_000);
  });
});

describe("quality", () => {
  it("computes lot ppm without false failures", () => {
    const lots = [{ id: "L1", part: "LDO", lot_code: "A", supplier: "X", received_on: null, units: 10_000, quarantined: false }];
    const q = lotQuality(lots, [failure({ lot_id: "L1" }), failure({ lot_id: "L1", false_failure: true }), failure({ lot_id: "L1", escaped: true })]);
    expect(q[0]).toMatchObject({ failures: 2, escapes: 1, ppm: 200 });
  });
  it("adds up cost of quality", () => {
    const c = costOfQuality([failure({ scrap_cost: 38, rework_minutes: 30, retest_minutes: 30 })], 100);
    expect(c).toEqual({ scrap: 38, reworkHours: 0.5, retestHours: 0.5, total: 138 });
  });
  it("computes retest pass rates per station, ignoring field returns", () => {
    const s = falseFailureStats([failure({ retest_passed: true, false_failure: true }), failure({ retest_passed: false }), failure({ escaped: true, retest_passed: true })]);
    expect(s[0]).toMatchObject({ failures: 2, retested: 2, retestPassed: 1, falseFailures: 1, retestPassRate: 0.5 });
  });
});
