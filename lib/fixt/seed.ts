import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { currentTenant } from "@/lib/tenant";
import { isoDay } from "./format";
import { hashKey } from "./repo";
import { mean, stdev } from "./spc";

// Demo data: a believable two-site fleet with the stories FIXT is built for
// (fixture drift, a bad component lot, false failures, a field return, a
// station that reads high against its siblings, a bring-up in EVT). Loaded on
// request from the empty fleet page, into the signed-in organization only, and
// removable from Settings.

const DAY = 86_400_000;

/** Deterministic PRNG so every demo looks the same. */
function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(next(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, normal, pick: <T>(xs: T[]) => xs[Math.floor(next() * xs.length)], int: (a: number, b: number) => a + Math.floor(next() * (b - a + 1)) };
}

type TestSpec = { name: string; unit: string; nominal: number; sd: number; lsl: number | null; usl: number | null };

const TESTS: Record<string, TestSpec[]> = {
  ict: [
    { name: "VBAT rail", unit: "V", nominal: 3.3, sd: 0.018, lsl: 3.2, usl: 3.4 },
    { name: "1V8 rail", unit: "V", nominal: 1.8, sd: 0.009, lsl: 1.75, usl: 1.85 },
    { name: "R12 pull-up", unit: "kΩ", nominal: 10, sd: 0.08, lsl: 9.5, usl: 10.5 },
  ],
  fct: [
    { name: "HR LED drive current", unit: "mA", nominal: 20, sd: 0.35, lsl: 18, usl: 22 },
    { name: "Accelerometer self-test", unit: "g", nominal: 1.0, sd: 0.015, lsl: 0.9, usl: 1.1 },
    { name: "Charge current", unit: "mA", nominal: 450, sd: 6, lsl: 420, usl: 480 },
  ],
  rf: [
    { name: "BLE TX power", unit: "dBm", nominal: 4, sd: 0.25, lsl: 2, usl: 6 },
    { name: "Crystal frequency offset", unit: "kHz", nominal: 0, sd: 6, lsl: -40, usl: 40 },
  ],
  eol: [
    { name: "Standby current", unit: "µA", nominal: 15, sd: 1.6, lsl: null, usl: 22 },
    { name: "Battery capacity", unit: "mAh", nominal: 300, sd: 4, lsl: 280, usl: 320 },
  ],
};

const SEQUENCE: Record<string, string> = { ict: "ICT_PulseBand", fct: "FCT_Main", rf: "RF_Cal_Verify", eol: "EOL_Pack" };

export async function loadDemoData() {
  const { tenantId } = await currentTenant();
  const { count } = await createAdminSupabase().from("fx_stations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (count) return false;
  // Not one transaction, so a failure part-way removes what was written.
  try {
    await seed(tenantId);
  } catch (err) {
    await clearFleetData().catch(() => undefined);
    throw err;
  }
  return true;
}

async function seed(tenantId: string) {
  const db = createAdminSupabase();
  const r = rng(20261101);
  const now = Date.now();
  const ins = async <T extends Record<string, unknown>>(table: string, rows: T[], select = "id") => {
    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < rows.length; i += 1000) {
      const { data, error } = await db.from(table).insert(rows.slice(i, i + 1000).map((x) => ({ tenant_id: tenantId, ...x }))).select(select);
      if (error) throw new Error(`Demo data: ${table}: ${error.message}`);
      out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    }
    return out as (T & { id: string })[];
  };

  // Products, sites, lines ---------------------------------------------------------------
  const [band, charger] = await ins("fx_products", [
    { name: "Pulse Band", sku: "PB-300", board_rev: "C", stage: "production" },
    { name: "Dock Charger", sku: "DC-110", board_rev: "B", stage: "production" },
  ]);
  const [fremont, penang] = await ins("fx_sites", [
    { name: "Fremont", location: "Fremont, CA (in-house)", timezone: "America/Los_Angeles" },
    { name: "Penang CM", location: "Penang, Malaysia (contract manufacturer)", timezone: "Asia/Kuala_Lumpur" },
  ]);
  const lines = await ins("fx_lines", [
    { site_id: fremont.id, product_id: band.id, name: "Fremont L1", autonomy: "approve" },
    { site_id: fremont.id, product_id: band.id, name: "Fremont L2", autonomy: "approve" },
    { site_id: penang.id, product_id: charger.id, name: "Penang L1", autonomy: "suggest" },
    { site_id: penang.id, product_id: band.id, name: "Penang L2", autonomy: "approve" },
  ]);
  const [fl1, fl2, pl1, pl2] = lines;

  // Stations -----------------------------------------------------------------------------
  const layout: { line: (typeof lines)[number]; prefix: string; kinds: [string, string][] }[] = [
    { line: fl1, prefix: "FRE1", kinds: [["ict", "ICT-1"], ["fct", "FCT-1"], ["fct", "FCT-2"], ["fct", "FCT-3"], ["rf", "RF-1"], ["eol", "EOL-1"]] },
    { line: fl2, prefix: "FRE2", kinds: [["ict", "ICT-1"], ["fct", "FCT-1"], ["fct", "FCT-2"], ["rf", "RF-1"], ["eol", "EOL-1"]] },
    { line: pl1, prefix: "PEN1", kinds: [["ict", "ICT-1"], ["fct", "FCT-1"], ["fct", "FCT-2"], ["eol", "EOL-1"]] },
    { line: pl2, prefix: "PEN2", kinds: [["ict", "ICT-1"], ["fct", "FCT-1"], ["rf", "RF-1"], ["eol", "EOL-1"]] },
  ];
  const stationRows = layout.flatMap(({ line, prefix, kinds }) =>
    kinds.map(([kind, name]) => {
      const cycles = r.int(18_000, 82_000);
      const calibrated = new Date(now - r.int(10, 80) * DAY);
      return {
        line_id: line.id,
        name: `${prefix} ${name}`,
        kind,
        status: "running",
        executive: prefix.startsWith("PEN") ? "python" : "teststand",
        sequence_name: SEQUENCE[kind],
        sequence_version: `2.${r.int(3, 6)}.${r.int(0, 4)}`,
        fixture_id: `FX-${kind.toUpperCase()}-${r.int(100, 999)}`,
        fixture_cycles: cycles,
        fixture_cycle_limit: 100_000,
        probe_wear_pct: Math.round((cycles / 100_000) * 80 + r.next() * 10),
        calibrated_at: isoDay(calibrated),
        calibration_due: isoDay(new Date(calibrated.getTime() + 90 * DAY)),
        last_seen_at: new Date(now - r.int(1, 8) * 60_000).toISOString(),
      };
    }),
  );
  const stations = await ins("fx_stations", stationRows, "id, name, kind, line_id");
  const st = (name: string) => stations.find((s) => s.name === name)!;

  // Story stations.
  const drifting = st("FRE1 FCT-3"); // HR LED current creeping up: probe wear
  const highReader = st("PEN2 RF-1"); // reads high against its siblings
  const lotStation = st("PEN1 ICT-1"); // VBAT failures after an LDO lot change
  const falseFail = st("FRE2 EOL-1"); // standby current fails good units
  const offline = st("PEN1 FCT-2");
  const calDue = st("FRE2 RF-1");

  await db.from("fx_stations").update({ status: "alarming", probe_wear_pct: 91, fixture_cycles: 94_200 }).eq("tenant_id", tenantId).eq("id", drifting.id);
  await db.from("fx_stations").update({ status: "alarming" }).eq("tenant_id", tenantId).in("id", [lotStation.id, falseFail.id]);
  await db.from("fx_stations").update({ status: "offline", last_seen_at: new Date(now - 3.2 * 3_600_000).toISOString() }).eq("tenant_id", tenantId).eq("id", offline.id);
  await db.from("fx_stations").update({ status: "idle" }).eq("tenant_id", tenantId).eq("id", st("PEN2 EOL-1").id);
  await db
    .from("fx_stations")
    .update({ calibrated_at: isoDay(new Date(now - 86 * DAY)), calibration_due: isoDay(new Date(now + 4 * DAY)) })
    .eq("tenant_id", tenantId)
    .eq("id", calDue.id);

  // Lots ---------------------------------------------------------------------------------
  const lots = await ins("fx_lots", [
    { part: "LDO regulator 3.3V (U4)", lot_code: "LDO-2238", supplier: "Apex Semi", received_on: isoDay(new Date(now - 24 * DAY)), units: 12_000 },
    { part: "LDO regulator 3.3V (U4)", lot_code: "LDO-2241", supplier: "Kestrel Components", received_on: isoDay(new Date(now - 6 * DAY)), units: 10_000 },
    { part: "Li-Po cell 300mAh", lot_code: "CELL-0917", supplier: "Volta Cells", received_on: isoDay(new Date(now - 30 * DAY)), units: 8_000 },
    { part: "Li-Po cell 300mAh", lot_code: "CELL-1002", supplier: "Volta Cells", received_on: isoDay(new Date(now - 9 * DAY)), units: 8_000 },
    { part: "BLE module", lot_code: "BLE-5521", supplier: "Nordwave", received_on: isoDay(new Date(now - 40 * DAY)), units: 20_000 },
    { part: "Charge IC", lot_code: "CHG-778", supplier: "Apex Semi", received_on: isoDay(new Date(now - 18 * DAY)), units: 15_000 },
  ], "id, lot_code");
  const lot = (code: string) => lots.find((l) => l.lot_code === code)!;
  const lotChange = now - 5.5 * DAY;

  // Tests and measurements ---------------------------------------------------------------
  const testRows = stations.flatMap((s) =>
    TESTS[s.kind].map((t) => ({ station_id: s.id, name: t.name, unit: t.unit, lsl: t.lsl, usl: t.usl, nominal: t.nominal })),
  );
  const tests = await ins("fx_tests", testRows, "id, name, station_id");
  const spec = (name: string) => Object.values(TESTS).flat().find((t) => t.name === name)!;
  const testOf = (stationId: string, name: string) => tests.find((t) => t.station_id === stationId && t.name === name)!;

  const DAYS = 14;
  const PER_DAY = 12;
  const measurements: Record<string, unknown>[] = [];
  const failures: Record<string, unknown>[] = [];
  const baselines = new Map<string, number[]>();
  const driftStart = now - 3 * DAY;
  const shiftOf = (t: number) => (["C", "A", "A", "B", "B", "C"] as const)[Math.floor(new Date(t).getUTCHours() / 4)];

  for (const t of tests) {
    const s = spec(t.name);
    const station = stations.find((x) => x.id === t.station_id)!;
    if (station.id === offline.id) continue;
    const values: number[] = [];
    for (let i = 0; i < DAYS * PER_DAY; i++) {
      const at = now - DAYS * DAY + (i + r.next() * 0.8) * (DAY / PER_DAY);
      let v = s.nominal + r.normal() * s.sd;
      // Fixture drift: about +0.6 mA a day since it started, plus extra noise from a worn probe.
      if (station.id === drifting.id && t.name === "HR LED drive current" && at > driftStart) v += ((at - driftStart) / DAY) * 0.6 + r.normal() * 0.15;
      // Station offset: this RF station reads ~2% high.
      if (station.id === highReader.id && t.name === "BLE TX power") v += 0.32;
      // Bad LDO lot: VBAT sits low and spreads out.
      const badLot = station.id === lotStation.id && at > lotChange;
      if (badLot && t.name === "VBAT rail") v = 3.245 + r.normal() * 0.03;
      // Standby current: a settling-time problem, so some good units read high on the first try.
      const flaky = station.id === falseFail.id && t.name === "Standby current" && r.next() < 0.11;
      if (flaky) v = s.usl! + 0.5 + r.next() * 4;
      const passed = (s.lsl == null || v >= s.lsl) && (s.usl == null || v <= s.usl);
      const serial = `${station.name.slice(0, 4)}${String(100000 + i * 37 + r.int(0, 36)).slice(-6)}`;
      const lotCode = t.name === "VBAT rail" ? (at > lotChange && station.id === lotStation.id ? "LDO-2241" : "LDO-2238") : t.name.includes("Battery") ? (at > now - 8 * DAY ? "CELL-1002" : "CELL-0917") : null;
      measurements.push({ test_id: t.id, measured_at: new Date(at).toISOString(), value: v, passed, serial, shift: shiftOf(at), board_rev: "C", lot_code: lotCode });
      if (at < now - 7 * DAY) values.push(v);
      if (!passed) {
        failures.push({
          station_id: station.id,
          test_id: t.id,
          lot_id: lotCode ? lot(lotCode).id : null,
          failed_at: new Date(at).toISOString(),
          serial,
          mode: `${t.name} ${s.usl != null && v > s.usl ? "high" : "low"}`,
          shift: shiftOf(at),
          board_rev: "C",
          retest_passed: flaky ? r.next() < 0.92 : r.next() < 0.15,
          false_failure: flaky,
          escaped: false,
          scrap_cost: flaky ? 0 : 38,
          rework_minutes: flaky ? 0 : r.int(15, 45),
          retest_minutes: r.int(3, 8),
        });
      }
    }
    baselines.set(t.id, values);
  }
  // Older failures (15 to 30 days ago) so 30-day analytics have history.
  for (let i = 0; i < 120; i++) {
    const s = r.pick(stations.filter((x) => x.id !== offline.id));
    const t = r.pick(tests.filter((x) => x.station_id === s.id));
    const at = now - (15 + r.next() * 15) * DAY;
    failures.push({
      station_id: s.id,
      test_id: t.id,
      lot_id: null,
      failed_at: new Date(at).toISOString(),
      serial: `${s.name.slice(0, 4)}${r.int(100000, 999999)}`,
      mode: `${t.name} ${r.next() < 0.5 ? "high" : "low"}`,
      shift: shiftOf(at),
      board_rev: r.next() < 0.3 ? "B" : "C",
      retest_passed: r.next() < 0.2,
      false_failure: false,
      escaped: false,
      scrap_cost: 38,
      rework_minutes: r.int(15, 45),
      retest_minutes: r.int(3, 8),
    });
  }
  // Field returns.
  for (let i = 0; i < 9; i++) {
    const s = st("FRE1 FCT-1");
    const at = now - r.int(1, 12) * DAY;
    failures.push({
      station_id: s.id,
      test_id: testOf(s.id, "Charge current").id,
      lot_id: lot("CHG-778").id,
      failed_at: new Date(at).toISOString(),
      serial: `FRE1${r.int(100000, 999999)}`,
      mode: "Won't charge (field return)",
      shift: shiftOf(at),
      board_rev: "C",
      retest_passed: false,
      false_failure: false,
      escaped: true,
      scrap_cost: 1200,
      rework_minutes: 60,
      retest_minutes: 10,
    });
  }
  for (let i = 0; i < measurements.length; i += 2000) {
    const { error } = await db.from("fx_measurements").insert(measurements.slice(i, i + 2000).map((m) => ({ tenant_id: tenantId, ...m })));
    if (error) throw new Error(`Demo data: measurements: ${error.message}`);
  }
  await ins("fx_failures", failures);

  // Baselines from the first week (golden behavior).
  for (const t of tests) {
    const v = baselines.get(t.id);
    if (!v?.length) continue;
    await db
      .from("fx_tests")
      .update({ baseline_mean: mean(v), baseline_sd: stdev(v), baseline_at: new Date(now - 7 * DAY).toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", t.id);
  }

  // Yield --------------------------------------------------------------------------------
  const yieldRows: Record<string, unknown>[] = [];
  for (const l of lines) {
    for (let d = DAYS - 1; d >= 0; d--) {
      const day = isoDay(new Date(now - d * DAY));
      for (const shift of ["A", "B", "C"] as const) {
        const units = r.int(320, 520) - (shift === "C" ? 90 : 0);
        let fpy = 0.965 + r.normal() * 0.006;
        if (l.id === fl1.id && d <= 3) fpy -= 0.012 * (4 - d);
        if (l.id === pl1.id && d <= 5) fpy -= 0.025;
        if (l.id === fl2.id) fpy -= 0.018;
        const first = Math.round(units * Math.min(0.995, fpy));
        const final = Math.min(units, first + Math.round((units - first) * (0.7 + r.next() * 0.25)));
        yieldRows.push({ line_id: l.id, day, shift, units, first_pass: first, final_pass: final });
      }
    }
  }
  {
    const { error } = await db.from("fx_yield").insert(yieldRows.map((y) => ({ tenant_id: tenantId, ...y })));
    if (error) throw new Error(`Demo data: yield: ${error.message}`);
  }

  // Investigations -----------------------------------------------------------------------
  const ago = (days: number) => new Date(now - days * DAY).toISOString();
  let number = 1000;
  const inv = async (row: Record<string, unknown>) => (await ins("fx_investigations", [{ number: ++number, ...row }]))[0];

  // History, for ROI and similar-failure lookups.
  const past: [string, string, string, number, number][] = [
    ["ICT opens on J3 after fixture swap", "fixture", "R12 pull-up high", 58, 9],
    ["RF TX power low on PEN2 RF-1", "fixture", "BLE TX power low", 51, 14],
    ["Accelerometer self-test failures, shift C", "environmental", "Accelerometer self-test low", 44, 20],
    ["1V8 rail low after sequence 2.4.0", "test_program", "1V8 rail low", 37, 6],
    ["Battery capacity low, cell lot CELL-0811", "component_lot", "Battery capacity low", 33, 28],
    ["Charge current high on FRE2 FCT-1", "fixture", "Charge current high", 26, 11],
    ["Crystal offset drift on FRE1 RF-1", "environmental", "Crystal frequency offset high", 21, 16],
    ["VBAT rail low, LDO lot LDO-2190", "component_lot", "VBAT rail low", 17, 22],
    ["HR LED current low after rework", "product_defect", "HR LED drive current low", 12, 31],
  ];
  for (const [title, cls, mode, openedDaysAgo, hours] of past) {
    await inv({
      title,
      station_id: r.pick(stations).id,
      product_id: band.id,
      status: "closed",
      severity: r.pick(["high", "medium", "medium", "low"]),
      units_at_risk: r.int(40, 400),
      failure_mode: mode,
      classification: cls,
      hypothesis: `Root cause confirmed: ${title.toLowerCase()}.`,
      confidence: 0.8 + r.next() * 0.15,
      evidence: [],
      opened_at: ago(openedDaysAgo),
      root_caused_at: new Date(now - openedDaysAgo * DAY + hours * 3_600_000).toISOString(),
      closed_at: new Date(now - openedDaysAgo * DAY + (hours + 20) * 3_600_000).toISOString(),
      diagnosis_model: "claude-opus-5-5",
      diagnosed_at: ago(openedDaysAgo - 0.2),
    });
  }

  const ledTest = testOf(drifting.id, "HR LED drive current");
  const inv1 = await inv({
    title: "HR LED drive current drifting high on FRE1 FCT-3",
    station_id: drifting.id,
    product_id: band.id,
    status: "testing",
    severity: "high",
    units_at_risk: 1460,
    failure_mode: "HR LED drive current high",
    classification: "fixture",
    hypothesis:
      "Pogo pin P7 on fixture FX-FCT on FRE1 FCT-3 is worn and adding contact resistance in the LED sense path, so the station reads the current high. The units are fine: the same serials read normal on FCT-1 and FCT-2, and the shift started as the fixture passed 90,000 cycles.",
    confidence: 0.86,
    evidence: [
      { label: "Only this station moved", detail: "FCT-1 and FCT-2 on the same line read 20.0 mA on the same product and lots; FCT-3 is up to 21.4 mA.", supports: true },
      { label: "Fixture past 90K cycles", detail: "94,200 cycles on a 100,000 cycle fixture; probe wear estimated at 91%.", supports: true },
      { label: "Gradual, not a step", detail: "The mean rose about 0.5 mA a day for 3 days, which is how wear looks. A lot change shows as a step.", supports: true },
      { label: "No board or lot change", detail: "Board rev C and LED lot unchanged since Oct 12.", supports: true },
      { label: "Retest on a golden unit not run yet", detail: "A known-good unit on FCT-3 would confirm the station, not the product.", supports: false },
    ],
    suggested_test: {
      name: "Golden-unit check on FRE1 FCT-3",
      rationale: "If the golden unit reads high on FCT-3 and normal on FCT-1, the fixture is the cause and the parts are good.",
      steps: ["Run golden unit GU-PB-007 on FCT-3 three times", "Run the same unit on FCT-1 three times", "Compare HR LED drive current; a gap over 0.5 mA confirms the fixture"],
      minutes: 15,
    },
    diagnosis_model: "claude-opus-5-5",
    diagnosed_at: ago(0.6),
    opened_at: ago(2.4),
    assignee_name: "Priya Raman",
  });

  const vbatTest = testOf(lotStation.id, "VBAT rail");
  const inv2 = await inv({
    title: "VBAT rail failures on PEN1 ICT-1 after LDO lot change",
    station_id: lotStation.id,
    product_id: charger.id,
    status: "root_caused",
    severity: "critical",
    units_at_risk: 2350,
    failure_mode: "VBAT rail low",
    classification: "component_lot",
    hypothesis:
      "LDO lot LDO-2241 from Kestrel Components regulates about 55 mV low with three times the usual spread. Every VBAT failure since it went on the line came from that lot; the previous lot from Apex Semi has none in the same window.",
    confidence: 0.93,
    evidence: [
      { label: "Failures start with the lot", detail: "First failure 4 hours after LDO-2241 was kitted on Oct 27. None from LDO-2238 since.", supports: true },
      { label: "Different supplier", detail: "LDO-2241 is the first lot from Kestrel Components (second source).", supports: true },
      { label: "Spread, not only a shift", detail: "Standard deviation went from 18 mV to 30 mV, which points at the part rather than the fixture.", supports: true },
      { label: "Other stations agree", detail: "PEN1 FCT-1 sees lower charge efficiency on the same serials.", supports: true },
    ],
    suggested_test: null,
    diagnosis_model: "claude-opus-5-5",
    diagnosed_at: ago(4.5),
    opened_at: ago(5.2),
    root_caused_at: ago(4.6),
    assignee_name: "Wei Lin",
  });

  const inv3 = await inv({
    title: "Pulse Band field returns: won't charge",
    station_id: st("FRE1 FCT-1").id,
    product_id: band.id,
    status: "open",
    severity: "high",
    units_at_risk: 600,
    failure_mode: "Won't charge (field return)",
    classification: "product_defect",
    hypothesis:
      "Nine returned units share charge IC lot CHG-778 and all passed FCT charge current near the upper limit (472 to 479 mA). Likely a marginal charge IC that passes at room temperature and fails warm. Not confirmed.",
    confidence: 0.58,
    evidence: [
      { label: "Same charge IC lot", detail: "9 of 9 returns use CHG-778.", supports: true },
      { label: "Passed near the limit", detail: "Factory charge current on the returns averaged 475 mA against a 480 mA limit; the line averages 450.", supports: true },
      { label: "Only 9 returns so far", detail: "Small sample; 15,000 units from that lot shipped.", supports: false },
    ],
    suggested_test: {
      name: "Hot charge test on retained CHG-778 units",
      rationale: "If the returns fail when warm, 10 retained units from the same lot at 45 °C should show charge current dropping out.",
      steps: ["Pull 10 retained units from lot CHG-778 and 10 from CHG-751", "Run the FCT charge test in the thermal chamber at 45 °C", "Compare dropout rate between lots"],
      minutes: 90,
    },
    diagnosis_model: "claude-opus-5-5",
    diagnosed_at: ago(0.3),
    opened_at: ago(1.1),
  });

  // Timelines.
  const tl = (investigation_id: string, rows: [number, string, string, string | null, Record<string, unknown>?][]) =>
    ins(
      "fx_timeline",
      rows.map(([d, kind, title, detail, data]) => ({ investigation_id, at: ago(d), kind, title, detail, data: data ?? {} })),
    );
  await tl(inv1.id, [
    [9, "factory_log", "Fixture FX-FCT on FRE1 FCT-3 passed 90,000 cycles", "Maintenance interval is 100,000 cycles."],
    [3, "test_data", "HR LED drive current starts rising on FRE1 FCT-3", "Baseline 20.0 mA (σ 0.35). Rising about 0.5 mA a day.", { baseline: 20.0, unit: "mA" }],
    [2.4, "agent", "Drift agent flagged the drift", "EWMA left the control band. Siblings FCT-1 and FCT-2 unchanged."],
    [2.3, "board_rev", "No board revision change", "All units rev C since Oct 12."],
    [2.3, "component_lot", "No LED lot change", "LED lot LED-4410 on all three FCT stations."],
    [0.6, "agent", "Diagnosis: fixture probe wear (86%)", "Recommended recalibration and pogo pin replacement; asked for approval."],
  ]);
  await tl(inv2.id, [
    [6, "component_lot", "LDO lot LDO-2241 received from Kestrel Components", "First lot from the second-source supplier."],
    [5.5, "factory_log", "LDO-2241 kitted to Penang L1", null],
    [5.3, "test_data", "VBAT rail failures begin on PEN1 ICT-1", "Mean 3.245 V vs. baseline 3.300 V; spread up 1.7×."],
    [5.2, "agent", "Drift agent opened an investigation", null],
    [4.6, "agent", "Diagnosis: component lot LDO-2241 (93%)", "Recommended quarantining the lot."],
    [4.5, "engineer", "Wei Lin quarantined LDO-2241", "Supplier notified; 8D requested from Kestrel."],
  ]);
  await tl(inv3.id, [
    [12, "field_return", "First return: won't charge", "RMA-30881, 41 days in the field."],
    [4, "field_return", "Eight more returns, same symptom", "RMA-30902 to RMA-30957."],
    [1.1, "agent", "Diagnosis agent joined factory data to the returns", "All nine passed FCT charge current between 472 and 479 mA."],
    [0.3, "agent", "Hypothesis: marginal charge IC lot CHG-778 (58%)", "Suggested a hot charge test on retained units."],
  ]);

  // Comments and feedback.
  await ins("fx_comments", [
    { investigation_id: inv1.id, user_id: "demo", author: "Priya Raman", body: "Pogo pins for FX-FCT are in the crib. Can swap at the B/C shift change.", created_at: ago(0.5) },
    { investigation_id: inv2.id, user_id: "demo", author: "Wei Lin", body: "Kestrel confirmed a process change on their side in week 42. 8D due Friday.", created_at: ago(3.9) },
    { investigation_id: inv2.id, user_id: "demo", author: "Maya Ortiz", body: "Shared with the Penang team so they can hold the remaining reels.", created_at: ago(3.5) },
  ]);
  await ins("fx_feedback", [{ investigation_id: inv2.id, user_id: "demo", user_name: "Wei Lin", verdict: "right", note: "Matches what Kestrel told us.", hypothesis: "LDO lot LDO-2241" }]);

  // Alerts -------------------------------------------------------------------------------
  const sibMean = 4.0;
  const alerts = await ins("fx_alerts", [
    {
      station_id: drifting.id,
      test_id: ledTest.id,
      kind: "drift",
      classification: "fixture",
      title: "HR LED drive current drifting high on FRE1 FCT-3",
      detail: "Up 1.4 mA from baseline over 3 days. Sibling stations unchanged.",
      baseline: 20.0,
      current: 21.4,
      unit: "mA",
      started_at: ago(3),
      detected_at: ago(2.4),
      severity: "high",
      units_at_risk: 1460,
      status: "acknowledged",
      investigation_id: inv1.id,
    },
    {
      station_id: highReader.id,
      test_id: testOf(highReader.id, "BLE TX power").id,
      kind: "anomaly",
      classification: "fixture",
      title: "PEN2 RF-1 reads BLE TX power 8% high vs. its siblings",
      detail: "4.32 dBm against 4.00 dBm on FRE1 RF-1 and FRE2 RF-1 for the same product. Steady for 14 days, so it's an offset, not drift.",
      baseline: sibMean,
      current: 4.32,
      unit: "dBm",
      started_at: ago(14),
      detected_at: ago(1.5),
      severity: "medium",
      units_at_risk: 0,
      status: "open",
    },
    {
      station_id: lotStation.id,
      test_id: vbatTest.id,
      kind: "drift",
      classification: "component_lot",
      title: "VBAT rail low on PEN1 ICT-1",
      detail: "Mean 3.245 V vs. baseline 3.300 V, starting with LDO lot LDO-2241.",
      baseline: 3.3,
      current: 3.245,
      unit: "V",
      started_at: ago(5.4),
      detected_at: ago(5.2),
      severity: "critical",
      units_at_risk: 2350,
      status: "acknowledged",
      investigation_id: inv2.id,
    },
    {
      station_id: falseFail.id,
      test_id: testOf(falseFail.id, "Standby current").id,
      kind: "false_failure",
      classification: "test_program",
      title: "Standby current failing good units on FRE2 EOL-1",
      detail: "11% of units fail standby current on the first run and 92% of those pass on retest. The measurement starts before the PMIC settles.",
      baseline: 15,
      current: 24.1,
      unit: "µA",
      started_at: ago(14),
      detected_at: ago(0.9),
      severity: "high",
      units_at_risk: 0,
      status: "open",
    },
    {
      station_id: calDue.id,
      test_id: null,
      kind: "calibration",
      classification: "fixture",
      title: "FRE2 RF-1 calibration due in 4 days",
      detail: "RF power meter calibration expires; schedule before then to avoid a line stop.",
      detected_at: ago(0.2),
      severity: "low",
      units_at_risk: 0,
      status: "open",
    },
    {
      station_id: offline.id,
      test_id: null,
      kind: "offline",
      classification: "unknown",
      title: "PEN1 FCT-2 stopped reporting",
      detail: "No results for 3 hours. The Python connector on this station hasn't checked in.",
      detected_at: ago(0.13),
      severity: "medium",
      units_at_risk: 0,
      status: "open",
    },
  ]);
  const [aDrift, aHigh, aLot, aFalse] = alerts;

  // Actions ------------------------------------------------------------------------------
  const stationNow = await db.from("fx_stations").select("calibrated_at, calibration_due").eq("tenant_id", tenantId).eq("id", drifting.id).single();
  const actions = await ins("fx_actions", [
    {
      station_id: drifting.id,
      test_id: ledTest.id,
      investigation_id: inv1.id,
      alert_id: aDrift.id,
      kind: "recalibrate",
      title: "Recalibrate FRE1 FCT-3 and replace pogo pin P7",
      rationale: "The station, not the product, is reading high. Recalibrating and replacing the worn pin should bring it back to its siblings. About 1,460 units a day would otherwise be measured on a drifting station.",
      change: { field: "calibration", before: stationNow.data, after: "today + 90 days" },
      status: "proposed",
      proposed_at: ago(0.6),
    },
    {
      station_id: falseFail.id,
      test_id: testOf(falseFail.id, "Standby current").id,
      alert_id: aFalse.id,
      kind: "update_sequence",
      title: "Add 400 ms PMIC settle before standby current on FRE2 EOL-1",
      rationale: "92% of standby current failures pass on retest. Waiting for the PMIC to settle removes the false failures without loosening the 22 µA limit. Saves about 6 retest-hours a day.",
      change: { field: "sequence_version", before: "2.4.1", after: "2.4.2" },
      status: "proposed",
      proposed_at: ago(0.8),
    },
    {
      station_id: highReader.id,
      test_id: testOf(highReader.id, "BLE TX power").id,
      alert_id: aHigh.id,
      kind: "recalibrate",
      title: "Recalibrate the RF path on PEN2 RF-1",
      rationale: "Reads 0.32 dB high against two sibling stations on the same product. A path-loss recalibration with the reference unit should remove the offset.",
      change: { field: "calibration", before: null, after: "today + 90 days" },
      status: "proposed",
      proposed_at: ago(1.4),
    },
    {
      station_id: lotStation.id,
      test_id: vbatTest.id,
      investigation_id: inv2.id,
      alert_id: aLot.id,
      kind: "quarantine_lot",
      title: "Quarantine LDO lot LDO-2241",
      rationale: "All VBAT failures since Oct 27 are from this lot.",
      change: { lot_id: lot("LDO-2241").id, lot_code: "LDO-2241", before: false, after: true },
      status: "applied",
      proposed_at: ago(4.6),
      decided_by: "demo",
      decided_by_name: "Wei Lin",
      decided_at: ago(4.5),
      applied_at: ago(4.5),
    },
    {
      station_id: st("FRE1 RF-1").id,
      test_id: testOf(st("FRE1 RF-1").id, "Crystal frequency offset").id,
      kind: "update_baseline",
      title: "Update crystal offset baseline on FRE1 RF-1 for board rev C",
      rationale: "Rev C moved the crystal load caps; the new normal is 2 kHz higher and stable.",
      change: { field: "baseline", before: { mean: 0, sd: 6 }, after: { mean: 2, sd: 6 } },
      status: "applied",
      proposed_at: ago(10),
      decided_by: "demo",
      decided_by_name: "Priya Raman",
      decided_at: ago(9.8),
      applied_at: ago(9.8),
    },
    {
      station_id: st("FRE2 FCT-1").id,
      kind: "change_limit",
      title: "Widen charge current upper limit to 490 mA on FRE2 FCT-1",
      rationale: "Proposed after three marginal failures.",
      change: { field: "usl", before: 480, after: 490 },
      status: "rejected",
      proposed_at: ago(8),
      decided_by: "demo",
      decided_by_name: "Maya Ortiz",
      decided_at: ago(7.9),
      decision_note: "Not loosening a charge limit while we have field returns on charging.",
    },
  ]);
  await db.from("fx_lots").update({ quarantined: true }).eq("tenant_id", tenantId).eq("id", lot("LDO-2241").id);

  // Agent log ----------------------------------------------------------------------------
  const logRows: [number, string, string, string, string | null, string | null, string | null][] = [
    [0.13, "drift", "observed", "PEN1 FCT-2 stopped reporting 3 hours ago; paged the Penang line lead", offline.id, null, null],
    [0.2, "drift", "observed", "FRE2 RF-1 calibration expires in 4 days", calDue.id, null, null],
    [0.3, "diagnosis", "decided", "INV-1012: marginal charge IC lot CHG-778 (58%). Suggested a hot charge test", null, inv3.id, null],
    [0.6, "diagnosis", "asked", "Caught drift on FRE1 FCT-3, recommended recalibration, awaiting approval", drifting.id, inv1.id, actions[0].id],
    [0.8, "drift", "asked", "Standby current on FRE2 EOL-1 is failing good units; proposed a 400 ms settle, awaiting approval", falseFail.id, null, actions[1].id],
    [0.9, "drift", "observed", "False-failure rate on FRE2 EOL-1 standby current at 11%, retest pass 92%", falseFail.id, null, null],
    [1.1, "diagnosis", "observed", "Joined 9 field returns to factory data: all passed charge current near the limit", null, inv3.id, null],
    [1.4, "drift", "asked", "PEN2 RF-1 reads 0.32 dB high vs. siblings; proposed RF path recalibration", highReader.id, null, actions[2].id],
    [2.4, "drift", "observed", "HR LED drive current on FRE1 FCT-3 left its control band (+1.4 mA)", drifting.id, inv1.id, null],
    [3.0, "drift", "decided", "Shift C accelerometer readings are 0.4% lower: within the shift baseline, not paging", null, null, null],
    [4.5, "operator", "decided", "Wei Lin approved: Quarantine LDO lot LDO-2241", lotStation.id, inv2.id, actions[3].id],
    [4.6, "diagnosis", "decided", "INV-1011: LDO lot LDO-2241 regulates 55 mV low (93%)", lotStation.id, inv2.id, null],
    [5.2, "drift", "observed", "VBAT rail on PEN1 ICT-1 dropped 55 mV in one step after a lot change", lotStation.id, inv2.id, null],
    [7.9, "operator", "decided", "Maya Ortiz rejected: Widen charge current upper limit to 490 mA", st("FRE2 FCT-1").id, null, actions[5].id],
    [9.8, "operator", "decided", "Priya Raman approved: Update crystal offset baseline for board rev C", st("FRE1 RF-1").id, null, actions[4].id],
    [10, "drift", "decided", "Rev C crystal offset is a new normal, not drift; proposed a baseline update", st("FRE1 RF-1").id, null, actions[4].id],
  ];
  await ins(
    "fx_agent_log",
    logRows.map(([d, agent, kind, message, station_id, investigation_id, action_id]) => ({ at: ago(d), agent, kind, message, station_id, investigation_id, action_id })),
  );

  // Bring-up -----------------------------------------------------------------------------
  const [ring] = await ins("fx_products", [{ name: "Halo Ring", sku: "HR-100", board_rev: "EVT2", stage: "bringup" }]);
  await ins("fx_bringups", [
    {
      product_id: ring.id,
      name: "Halo Ring",
      stage: "evt",
      schematic_name: "HaloRing_EVT2_schematic.pdf",
      firmware_name: "halo-fw-0.9.3.hex",
      design_notes: "nRF54 SoC, 22 mAh cell, PPG with 2 LEDs + 1 PD, NFC coil, wireless charging (Qi), 1V8 and 3V0 rails.",
      plan: [
        { name: "3V0 rail", function: "Power", net: "VDD_3V0", method: "Bed-of-nails DMM", lsl: 2.94, usl: 3.06, unit: "V" },
        { name: "1V8 rail", function: "Power", net: "VDD_1V8", method: "Bed-of-nails DMM", lsl: 1.76, usl: 1.84, unit: "V" },
        { name: "Sleep current", function: "Power", net: "VBAT", method: "SMU, 2 s settle", lsl: null, usl: 4, unit: "µA" },
        { name: "PPG LED1 current", function: "Sensing", net: "LED1_K", method: "Firmware drive + sense resistor", lsl: 9, usl: 11, unit: "mA" },
        { name: "PPG LED2 current", function: "Sensing", net: "LED2_K", method: "Firmware drive + sense resistor", lsl: 9, usl: 11, unit: "mA" },
        { name: "Photodiode dark count", function: "Sensing", net: "PD_OUT", method: "Firmware read, fixture lid closed", lsl: null, usl: 120, unit: "counts" },
        { name: "BLE TX power", function: "Radio", net: "ANT", method: "Conducted, RF shield box", lsl: -2, usl: 4, unit: "dBm" },
        { name: "Qi charge current", function: "Charging", net: "VCHG", method: "Reference Qi pad", lsl: 30, usl: 45, unit: "mA" },
        { name: "NFC field detect", function: "Radio", net: "NFC1/NFC2", method: "Reader at 10 mm", lsl: null, usl: null, unit: "pass/fail" },
      ],
      coverage: [
        { area: "Power rails", total: 6, tested: 5 },
        { area: "Sensing (PPG)", total: 5, tested: 3 },
        { area: "Radio (BLE, NFC)", total: 4, tested: 2 },
        { area: "Charging", total: 3, tested: 1 },
        { area: "Firmware functions", total: 12, tested: 7 },
      ],
      plan_model: "claude-opus-5-5",
      golden_units: 3,
      golden_target: 5,
    },
  ]);

  // Integrations, handoffs, settings -----------------------------------------------------
  const conn = (kind: string, name: string, synced: number, status = "connected", error: string | null = null) => ({
    kind,
    name,
    status,
    last_sync_at: new Date(now - r.int(1, 20) * 60_000).toISOString(),
    records_synced: synced,
    last_error: error,
    key_hash: hashKey(`fxk_${randomBytes(24).toString("base64url")}`),
    key_prefix: "fxk_demo",
  });
  await ins("fx_connectors", [
    conn("teststand", "Fremont TestStand stations", 412_880),
    conn("python", "Penang Python harness", 238_410, "error", "PEN1 FCT-2: no check-in for 3 hours"),
    conn("mes", "MES (unit routing)", 96_200),
    conn("erp", "ERP (lots and receiving)", 1_840),
    conn("field_returns", "RMA system", 212),
  ]);
  // Preview connectors: settings instead of an ingest key.
  const preview = (kind: string, name: string, synced: number, config: Record<string, string>) => ({ ...conn(kind, name, synced), key_hash: null, key_prefix: null, config });
  await ins("fx_connectors", [
    preview("snowflake", "Snowflake (test data warehouse)", 2_418_903, { account: "pulsewear-prod", warehouse: "FIXT_WH", database: "TEST_DATA" }),
    preview("jira", "Jira (failure analysis)", 37, { site: "pulsewear.atlassian.net", project: "FA" }),
    preview("google_drive", "Google Drive (test specs)", 146, { folder: "Test engineering / Pulse Band" }),
    preview("onedrive", "SharePoint (Penang CM reports)", 58, { folder: "Penang CM / Weekly reports" }),
  ]);
  await ins("fx_handoffs", [
    { line_id: fl1.id, shift: "B", user_id: "demo", author: "Priya Raman", body: "FCT-3 still reading high on HR LED. Pins staged for the swap; don't scrap any HR LED failures from FCT-3, retest them on FCT-1.", created_at: ago(0.4) },
    { line_id: pl1.id, shift: "A", user_id: "demo", author: "Wei Lin", body: "LDO-2241 reels are on hold in the cage. Running LDO-2238 until the 8D comes back. FCT-2 network cable replaced, still not reporting.", created_at: ago(0.2) },
    { line_id: fl2.id, shift: "C", user_id: "demo", author: "Maya Ortiz", body: "EOL-1 standby current false failures continue. Retesting everything that fails once.", created_at: ago(0.9) },
  ]);
  await db.from("fx_settings").upsert({ tenant_id: tenantId, demo_loaded_at: new Date().toISOString() }, { onConflict: "tenant_id" });
}

/** Removes every FIXT row the organization has (demo or not). Settings stay. */
export async function clearFleetData() {
  const { tenantId } = await currentTenant();
  const db = createAdminSupabase();
  // Children first where the foreign keys don't cascade from a parent being deleted.
  for (const table of ["fx_agent_log", "fx_actions", "fx_alerts", "fx_timeline", "fx_comments", "fx_feedback", "fx_investigations", "fx_failures", "fx_lots", "fx_handoffs", "fx_bringups", "fx_sites", "fx_products", "fx_connectors"]) {
    const { error } = await db.from(table).delete().eq("tenant_id", tenantId);
    if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
  }
  await db.from("fx_settings").update({ demo_loaded_at: null }).eq("tenant_id", tenantId);
}
