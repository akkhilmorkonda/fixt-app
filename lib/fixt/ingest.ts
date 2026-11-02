import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { measure } from "./format";
import { absolute, notify } from "./notify";
import { hashKey } from "./repo";
import { detectDrift, driftSeverity, mean, stdev } from "./spc";
import type { IngestResult } from "./validate";

// The ingest path: test executives (TestStand, Python, LabVIEW) and CSV
// uploads post results here with a connector key. There's no session, so the
// key alone decides the organization. After storing results, the drift agent
// checks every test that got new data and raises alerts and proposed changes.

const BASELINE_MIN = 30;
const WINDOW = 200;

export async function connectorForKey(key: string | null) {
  if (!key || !/^fxk_[A-Za-z0-9_-]{20,64}$/.test(key)) return null;
  const { data, error } = await createAdminSupabase()
    .from("fx_connectors")
    .select("id, tenant_id, name, status, tenants!inner(status)")
    .eq("key_hash", hashKey(key))
    .maybeSingle<{ id: string; tenant_id: string; name: string; status: string; tenants: { status: string } }>();
  if (error) throw new Error(`Failed to check connector key: ${error.message}`);
  if (!data || data.tenants.status !== "active") return null;
  return data;
}

const shiftFor = (iso: string) => (["C", "A", "A", "B", "B", "C"] as const)[Math.floor(new Date(iso).getUTCHours() / 4)];

/**
 * Stores a batch for one organization. Unknown stations and tests are created
 * (under an "Unassigned" line at an "Unassigned" site) so nothing is dropped;
 * engineers can move them later.
 */
export async function ingest(tenantId: string, connectorId: string, rows: IngestResult[]) {
  const db = createAdminSupabase();
  const must = <T>(r: { data: T; error: { message: string } | null }, what: string) => {
    if (r.error) throw new Error(`Ingest: ${what}: ${r.error.message}`);
    return r.data;
  };
  const one = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
    const d = must(r, what);
    if (d == null) throw new Error(`Ingest: ${what}: no row returned`);
    return d;
  };

  // Stations.
  const names = [...new Set(rows.map((r) => r.station))];
  let stations = must(await db.from("fx_stations").select("id, name").eq("tenant_id", tenantId).in("name", names).returns<{ id: string; name: string }[]>(), "stations") ?? [];
  const missing = names.filter((n) => !stations.some((s) => s.name === n));
  if (missing.length) {
    const site =
      must(await db.from("fx_sites").select("id").eq("tenant_id", tenantId).eq("name", "Unassigned").maybeSingle<{ id: string }>(), "site") ??
      one(await db.from("fx_sites").insert({ tenant_id: tenantId, name: "Unassigned" }).select("id").single<{ id: string }>(), "create site");
    const line =
      must(await db.from("fx_lines").select("id").eq("tenant_id", tenantId).eq("site_id", site.id).eq("name", "Unassigned").maybeSingle<{ id: string }>(), "line") ??
      one(await db.from("fx_lines").insert({ tenant_id: tenantId, site_id: site.id, name: "Unassigned", autonomy: "suggest" }).select("id").single<{ id: string }>(), "create line");
    const created = must(
      await db
        .from("fx_stations")
        .upsert(missing.map((name) => ({ tenant_id: tenantId, line_id: line.id, name })), { onConflict: "tenant_id,name", ignoreDuplicates: true })
        .select("id, name")
        .returns<{ id: string; name: string }[]>(),
      "create stations",
    );
    stations = [...stations, ...(created ?? [])];
  }
  const stationId = new Map(stations.map((s) => [s.name, s.id]));

  // Tests.
  const testKeys = [...new Map(rows.map((r) => [`${r.station}\u0000${r.test}`, r])).values()];
  const existing = must(
    await db.from("fx_tests").select("id, station_id, name, unit, lsl, usl").eq("tenant_id", tenantId).in("station_id", [...stationId.values()]).returns<{ id: string; station_id: string; name: string; unit: string; lsl: number | null; usl: number | null }[]>(),
    "tests",
  ) ?? [];
  const testId = new Map(existing.map((t) => [`${t.station_id}\u0000${t.name}`, t]));
  const newTests = testKeys.filter((r) => !testId.has(`${stationId.get(r.station)}\u0000${r.test}`));
  if (newTests.length) {
    const created = must(
      await db
        .from("fx_tests")
        .upsert(
          newTests.map((r) => ({ tenant_id: tenantId, station_id: stationId.get(r.station), name: r.test, unit: r.unit ?? "", lsl: r.lsl ?? null, usl: r.usl ?? null })),
          { onConflict: "tenant_id,station_id,name", ignoreDuplicates: true },
        )
        .select("id, station_id, name, unit, lsl, usl")
        .returns<typeof existing>(),
      "create tests",
    );
    for (const t of created ?? []) testId.set(`${t.station_id}\u0000${t.name}`, t);
  }

  // Measurements.
  const now = new Date().toISOString();
  const measurements = rows.map((r) => {
    const t = testId.get(`${stationId.get(r.station)}\u0000${r.test}`)!;
    const lsl = r.lsl !== undefined ? r.lsl : t.lsl;
    const usl = r.usl !== undefined ? r.usl : t.usl;
    const at = r.measured_at ?? now;
    return {
      tenant_id: tenantId,
      test_id: t.id,
      measured_at: at,
      value: r.value,
      passed: r.passed ?? ((lsl == null || r.value >= lsl) && (usl == null || r.value <= usl)),
      serial: r.serial ?? null,
      shift: r.shift ?? shiftFor(at),
      board_rev: r.board_rev ?? null,
      lot_code: r.lot ?? null,
    };
  });
  for (let i = 0; i < measurements.length; i += 2000) must(await db.from("fx_measurements").insert(measurements.slice(i, i + 2000)), "measurements");

  // Reporting again means the station is back: offline (or idle) becomes running.
  const seen = [...new Set(rows.map((r) => stationId.get(r.station)!))];
  await db.from("fx_stations").update({ status: "running" }).eq("tenant_id", tenantId).in("id", seen).in("status", ["offline", "idle"]);
  await db.from("fx_stations").update({ last_seen_at: now }).eq("tenant_id", tenantId).in("id", seen);
  const { data: conn } = await db.from("fx_connectors").select("records_synced").eq("tenant_id", tenantId).eq("id", connectorId).single<{ records_synced: number }>();
  await db.from("fx_connectors").update({ last_sync_at: now, records_synced: Number(conn?.records_synced ?? 0) + rows.length, status: "connected", last_error: null }).eq("tenant_id", tenantId).eq("id", connectorId);

  const touched = [...new Set(measurements.map((m) => m.test_id))];
  const alerts = await checkDrift(tenantId, touched);
  return { stored: measurements.length, stationsCreated: missing.length, testsCreated: newTests.length, alerts };
}

/** The drift agent: one EWMA check per test that got new data. Returns how many alerts it raised. */
export async function checkDrift(tenantId: string, testIds: string[]) {
  const db = createAdminSupabase();
  let raised = 0;
  for (const id of testIds) {
    const { data: t } = await db
      .from("fx_tests")
      .select("id, station_id, name, unit, lsl, usl, baseline_mean, baseline_sd")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle<{ id: string; station_id: string; name: string; unit: string; lsl: number | null; usl: number | null; baseline_mean: number | null; baseline_sd: number | null }>();
    if (!t) continue;
    const { data: rows } = await db.from("fx_measurements").select("measured_at, value").eq("tenant_id", tenantId).eq("test_id", id).order("measured_at", { ascending: false }).limit(WINDOW).returns<{ measured_at: string; value: number }[]>();
    const series = (rows ?? []).reverse();

    // No baseline yet: the first BASELINE_MIN results become it.
    if (t.baseline_mean == null || t.baseline_sd == null) {
      if (series.length >= BASELINE_MIN) {
        const v = series.slice(0, BASELINE_MIN).map((r) => r.value);
        await db.from("fx_tests").update({ baseline_mean: mean(v), baseline_sd: stdev(v), baseline_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", id);
      }
      continue;
    }
    const result = detectDrift(series.map((r) => r.value), t.baseline_mean, t.baseline_sd);
    if (!result.drifting) continue;

    // One open alert per test at a time.
    const { data: open } = await db.from("fx_alerts").select("id").eq("tenant_id", tenantId).eq("test_id", id).in("status", ["open", "acknowledged"]).limit(1);
    if (open?.length) continue;

    const { data: station } = await db.from("fx_stations").select("id, name, line_id, calibrated_at, calibration_due").eq("tenant_id", tenantId).eq("id", t.station_id).single<{ id: string; name: string; line_id: string; calibrated_at: string | null; calibration_due: string | null }>();
    const { data: line } = await db.from("fx_lines").select("autonomy").eq("tenant_id", tenantId).eq("id", station!.line_id).single<{ autonomy: string }>();
    const severity = driftSeverity(result.sigmaShift, result.recentMean, t.lsl, t.usl, t.baseline_sd);
    const dir = result.sigmaShift > 0 ? "high" : "low";
    const startedAt = result.startIndex != null ? series[result.startIndex].measured_at : null;
    const title = `${t.name} drifting ${dir} on ${station!.name}`;
    const detail = `Recent mean ${measure(result.recentMean, t.unit)} vs. baseline ${measure(t.baseline_mean, t.unit)} (${result.sigmaShift >= 0 ? "+" : ""}${result.sigmaShift.toFixed(1)}σ).`;

    const { data: alert } = await db
      .from("fx_alerts")
      .insert({ tenant_id: tenantId, station_id: t.station_id, test_id: id, kind: "drift", title: title.slice(0, 200), detail, baseline: t.baseline_mean, current: result.recentMean, unit: t.unit, started_at: startedAt, severity })
      .select("id")
      .single<{ id: string }>();
    raised++;

    // Propose a recalibration; under "suggest" it's only a recommendation in the log.
    if (line?.autonomy !== "suggest") {
      const { data: action } = await db
        .from("fx_actions")
        .insert({
          tenant_id: tenantId,
          station_id: t.station_id,
          test_id: id,
          alert_id: alert!.id,
          kind: "recalibrate",
          title: `Recalibrate ${station!.name}`.slice(0, 200),
          rationale: `${detail} A drift on one station usually means the fixture or instrument moved. Recalibrate, then check the next 20 results against siblings.`,
          change: { field: "calibration", before: { calibrated_at: station!.calibrated_at, calibration_due: station!.calibration_due }, after: "today + 90 days" },
          status: "proposed",
        })
        .select("id")
        .single<{ id: string }>();
      await db.from("fx_agent_log").insert({
        tenant_id: tenantId,
        agent: "drift",
        kind: "asked",
        message: `Caught drift on ${station!.name} (${t.name}), recommended recalibration, awaiting approval`.slice(0, 500),
        station_id: t.station_id,
        action_id: action?.id ?? null,
        inputs: { sigma_shift: result.sigmaShift, recent_mean: result.recentMean, baseline: t.baseline_mean },
      });
    } else {
      await db.from("fx_agent_log").insert({ tenant_id: tenantId, agent: "drift", kind: "observed", message: `Caught drift on ${station!.name} (${t.name}); line is suggest-only, so no change proposed`.slice(0, 500), station_id: t.station_id });
    }
    await db.from("fx_stations").update({ status: "alarming" }).eq("tenant_id", tenantId).eq("id", t.station_id).eq("status", "running");
    await notify(tenantId, { title, detail, severity, url: absolute(`/stations/${t.station_id}`), dedupKey: `drift-${id}` });
  }
  return raised;
}
