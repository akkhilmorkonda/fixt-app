import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { currentTenant } from "@/lib/tenant";
import { isoDay } from "./format";
import {
  DEFAULT_SETTINGS,
  CONNECTOR_KINDS,
  LINE_CHANGING,
  connectorKindOf,
  type AgentAction,
  type AgentLogEntry,
  type Alert,
  type AlertChannel,
  type Autonomy,
  type Bringup,
  type Comment,
  type Connector,
  type Failure,
  type Feedback,
  type Handoff,
  type Investigation,
  type Line,
  type Lot,
  type Measurement,
  type Product,
  type Role,
  type Settings,
  type Site,
  type Station,
  type TestDef,
  type TimelineEvent,
  type YieldRow,
} from "./types";

// All FIXT data access. Every function starts from currentTenant() and filters
// every query by its tenant_id, so nothing here can read or change another
// organization's rows. Inputs must already be validated (lib/fixt/validate.ts).

export class FixtError extends Error {}

async function ctx() {
  const tenant = await currentTenant();
  return { ...tenant, db: createAdminSupabase() };
}

function must<T>(r: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (r.error) {
    if (r.error.code === "23505") throw new FixtError("That already exists");
    if (r.error.code === "23514") throw new FixtError("One of the values isn't allowed");
    throw new Error(`Failed to ${what}: ${r.error.message}`);
  }
  return r.data;
}

function one<T>(r: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  const d = must(r, what);
  if (d == null) throw new Error(`Failed to ${what}: no row returned`);
  return d;
}

/** The signed-in person, for "approved by" and comment authors. */
export async function actor() {
  const { userId } = await currentTenant();
  const user = await currentUser();
  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Engineer";
  return { id: userId, name: name.slice(0, 120) };
}

const STATION_COLUMNS =
  "id, line_id, name, kind, status, executive, sequence_name, sequence_version, fixture_id, fixture_cycles, fixture_cycle_limit, probe_wear_pct, calibrated_at, calibration_due, last_seen_at";
const TEST_COLUMNS = "id, station_id, name, unit, lsl, usl, nominal, baseline_mean, baseline_sd, baseline_at";
const ALERT_COLUMNS =
  "id, station_id, test_id, kind, classification, title, detail, baseline, current, unit, started_at, detected_at, severity, units_at_risk, status, investigation_id, resolved_at";
const INVESTIGATION_COLUMNS =
  "id, number, title, station_id, product_id, status, severity, units_at_risk, failure_mode, classification, hypothesis, confidence, evidence, suggested_test, diagnosis_model, diagnosed_at, assignee_id, assignee_name, opened_at, root_caused_at, closed_at, share_token, updated_at";
const ACTION_COLUMNS =
  "id, station_id, test_id, investigation_id, alert_id, kind, title, rationale, change, status, proposed_at, decided_by, decided_by_name, decided_at, decision_note, applied_at, rolled_back_at";
const FAILURE_COLUMNS = "id, station_id, test_id, lot_id, failed_at, serial, mode, shift, board_rev, retest_passed, false_failure, escaped, scrap_cost, rework_minutes, retest_minutes";
const LOG_COLUMNS = "id, at, agent, kind, message, station_id, investigation_id, action_id, inputs, outcome";

const num = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]) => {
  for (const k of keys) if (row[k] != null) (row as Record<keyof T, unknown>)[k] = Number(row[k]);
  return row;
};

// Fleet ---------------------------------------------------------------------------------

export type Fleet = { sites: Site[]; products: Product[]; lines: Line[]; stations: Station[] };

export async function getFleet(): Promise<Fleet> {
  const { tenantId, db } = await ctx();
  const [sites, products, lines, stations] = await Promise.all([
    db.from("fx_sites").select("id, name, location, timezone").eq("tenant_id", tenantId).order("name").returns<Site[]>(),
    db.from("fx_products").select("id, name, sku, board_rev, stage").eq("tenant_id", tenantId).order("name").returns<Product[]>(),
    db.from("fx_lines").select("id, site_id, product_id, name, autonomy").eq("tenant_id", tenantId).order("name").returns<Line[]>(),
    db.from("fx_stations").select(STATION_COLUMNS).eq("tenant_id", tenantId).order("name").returns<Station[]>(),
  ]);
  return {
    sites: must(sites, "load sites") ?? [],
    products: must(products, "load products") ?? [],
    lines: must(lines, "load lines") ?? [],
    stations: (must(stations, "load stations") ?? []).map((s) => num(s, ["probe_wear_pct"])),
  };
}

export async function getYield(days = 14): Promise<YieldRow[]> {
  const { tenantId, db } = await ctx();
  const since = isoDay(new Date(Date.now() - days * 86_400_000));
  return (
    must(
      await db.from("fx_yield").select("line_id, day, shift, units, first_pass, final_pass").eq("tenant_id", tenantId).gte("day", since).order("day").returns<YieldRow[]>(),
      "load yield",
    ) ?? []
  );
}

export type StationDetail = {
  station: Station;
  line: Line | null;
  tests: (TestDef & { samples: Measurement[] })[];
  alerts: Alert[];
  failures: Failure[];
  actions: AgentAction[];
  /** Same-kind stations elsewhere, with the same tests' recent means, for "reads 2% high vs. its siblings". */
  siblings: { station: Station; means: Record<string, number> }[];
};

export async function getStation(id: string, samplesPerTest = 300): Promise<StationDetail | null> {
  const { tenantId, db } = await ctx();
  const station = must(await db.from("fx_stations").select(STATION_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle<Station>(), "load station");
  if (!station) return null;
  num(station, ["probe_wear_pct"]);
  const [line, tests, alerts, failures, actions, siblings] = await Promise.all([
    db.from("fx_lines").select("id, site_id, product_id, name, autonomy").eq("tenant_id", tenantId).eq("id", station.line_id).maybeSingle<Line>(),
    db.from("fx_tests").select(TEST_COLUMNS).eq("tenant_id", tenantId).eq("station_id", id).order("name").returns<TestDef[]>(),
    db.from("fx_alerts").select(ALERT_COLUMNS).eq("tenant_id", tenantId).eq("station_id", id).order("detected_at", { ascending: false }).limit(20).returns<Alert[]>(),
    db.from("fx_failures").select(FAILURE_COLUMNS).eq("tenant_id", tenantId).eq("station_id", id).order("failed_at", { ascending: false }).limit(200).returns<Failure[]>(),
    db.from("fx_actions").select(ACTION_COLUMNS).eq("tenant_id", tenantId).eq("station_id", id).order("proposed_at", { ascending: false }).limit(20).returns<AgentAction[]>(),
    db.from("fx_stations").select(STATION_COLUMNS).eq("tenant_id", tenantId).eq("kind", station.kind).neq("id", id).returns<Station[]>(),
  ]);
  const testRows = must(tests, "load tests") ?? [];
  const withSamples = await Promise.all(
    testRows.map(async (t) => {
      const rows = must(
        await db
          .from("fx_measurements")
          .select("measured_at, value, passed, serial, shift, board_rev, lot_code")
          .eq("tenant_id", tenantId)
          .eq("test_id", t.id)
          .order("measured_at", { ascending: false })
          .limit(samplesPerTest)
          .returns<Measurement[]>(),
        "load measurements",
      );
      return { ...t, samples: (rows ?? []).reverse() };
    }),
  );

  // Sibling means for the same test names, from their last 50 measurements.
  const sibStations = must(siblings, "load sibling stations") ?? [];
  const names = testRows.map((t) => t.name);
  const sibs = await Promise.all(
    sibStations.slice(0, 6).map(async (s) => {
      const sibTests = must(
        await db.from("fx_tests").select("id, name").eq("tenant_id", tenantId).eq("station_id", s.id).in("name", names.length ? names : ["-"]).returns<{ id: string; name: string }[]>(),
        "load sibling tests",
      );
      const means: Record<string, number> = {};
      for (const t of sibTests ?? []) {
        const rows = must(
          await db.from("fx_measurements").select("value").eq("tenant_id", tenantId).eq("test_id", t.id).order("measured_at", { ascending: false }).limit(50).returns<{ value: number }[]>(),
          "load sibling measurements",
        );
        if (rows?.length) means[t.name] = rows.reduce((a, r) => a + r.value, 0) / rows.length;
      }
      return { station: num(s, ["probe_wear_pct"]), means };
    }),
  );

  return {
    station,
    line: must(line, "load line"),
    tests: withSamples,
    alerts: must(alerts, "load alerts") ?? [],
    failures: (must(failures, "load failures") ?? []).map((f) => num(f, ["scrap_cost"])),
    actions: must(actions, "load actions") ?? [],
    siblings: sibs,
  };
}

export async function getTest(testId: string) {
  const { tenantId, db } = await ctx();
  return must(await db.from("fx_tests").select(TEST_COLUMNS).eq("tenant_id", tenantId).eq("id", testId).maybeSingle<TestDef>(), "load test");
}

export async function setAutonomy(lineId: string, autonomy: Autonomy) {
  const { tenantId, db } = await ctx();
  const who = await actor();
  const rows = must(await db.from("fx_lines").update({ autonomy }).eq("tenant_id", tenantId).eq("id", lineId).select("id, name"), "update autonomy");
  if (!rows?.length) return false;
  await log({ agent: "operator", kind: "decided", message: `${who.name} set ${rows[0].name} to ${autonomy.replace("_", " ")}`, inputs: { line_id: lineId, autonomy } });
  return true;
}

// Alerts --------------------------------------------------------------------------------

export async function listAlerts(opts: { status?: Alert["status"][]; kind?: Alert["kind"][]; limit?: number } = {}): Promise<Alert[]> {
  const { tenantId, db } = await ctx();
  let q = db.from("fx_alerts").select(ALERT_COLUMNS).eq("tenant_id", tenantId);
  if (opts.status?.length) q = q.in("status", opts.status);
  if (opts.kind?.length) q = q.in("kind", opts.kind);
  return must(await q.order("detected_at", { ascending: false }).limit(opts.limit ?? 200).returns<Alert[]>(), "load alerts") ?? [];
}

export async function setAlertStatus(id: string, status: Alert["status"]) {
  const { tenantId, db } = await ctx();
  const who = await actor();
  const rows = must(
    await db
      .from("fx_alerts")
      .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select("id, title, station_id"),
    "update alert",
  );
  if (!rows?.length) return false;
  await log({ agent: "operator", kind: "decided", message: `${who.name} marked "${rows[0].title}" ${status}`, station_id: rows[0].station_id });
  return true;
}

/** Opens an investigation for an alert (or returns the one it already has). */
export async function investigateAlert(alertId: string) {
  const { tenantId, db } = await ctx();
  const alert = must(await db.from("fx_alerts").select(ALERT_COLUMNS).eq("tenant_id", tenantId).eq("id", alertId).maybeSingle<Alert>(), "load alert");
  if (!alert) return null;
  if (alert.investigation_id) return alert.investigation_id;
  const station = must(await db.from("fx_stations").select("id, name, line_id").eq("tenant_id", tenantId).eq("id", alert.station_id).maybeSingle<{ id: string; name: string; line_id: string }>(), "load station");
  const line = station
    ? must(await db.from("fx_lines").select("product_id").eq("tenant_id", tenantId).eq("id", station.line_id).maybeSingle<{ product_id: string | null }>(), "load line")
    : null;
  const id = await createInvestigation({
    title: alert.title,
    station_id: alert.station_id,
    product_id: line?.product_id ?? null,
    severity: alert.severity,
    units_at_risk: alert.units_at_risk,
    classification: alert.classification,
    failure_mode: alert.kind === "false_failure" ? "False failure" : alert.title,
  });
  must(await db.from("fx_alerts").update({ investigation_id: id, status: "acknowledged" }).eq("tenant_id", tenantId).eq("id", alertId), "link alert");
  await addTimeline(id, {
    at: alert.started_at ?? alert.detected_at,
    kind: "test_data",
    title: alert.title,
    detail: alert.detail,
    data: { baseline: alert.baseline, current: alert.current, unit: alert.unit },
  });
  return id;
}

// Investigations ------------------------------------------------------------------------

export async function listInvestigations(opts: { status?: Investigation["status"][]; limit?: number } = {}): Promise<Investigation[]> {
  const { tenantId, db } = await ctx();
  let q = db.from("fx_investigations").select(INVESTIGATION_COLUMNS).eq("tenant_id", tenantId);
  if (opts.status?.length) q = q.in("status", opts.status);
  const rows = must(await q.order("opened_at", { ascending: false }).limit(opts.limit ?? 200).returns<Investigation[]>(), "load investigations") ?? [];
  return rows.map((r) => num(r, ["confidence"]));
}

export type InvestigationDetail = {
  investigation: Investigation;
  timeline: TimelineEvent[];
  comments: Comment[];
  feedback: Feedback[];
  actions: AgentAction[];
  station: Station | null;
  product: Product | null;
  similar: Investigation[];
};

export async function getInvestigation(id: string): Promise<InvestigationDetail | null> {
  const { tenantId, db } = await ctx();
  const inv = must(await db.from("fx_investigations").select(INVESTIGATION_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle<Investigation>(), "load investigation");
  if (!inv) return null;
  num(inv, ["confidence"]);
  return { investigation: inv, ...(await investigationParts(db, tenantId, inv)) };
}

async function investigationParts(db: ReturnType<typeof createAdminSupabase>, tenantId: string, inv: Investigation) {
  const [timeline, comments, feedback, actions, station, product, similar] = await Promise.all([
    db.from("fx_timeline").select("id, at, kind, title, detail, data").eq("tenant_id", tenantId).eq("investigation_id", inv.id).order("at").returns<TimelineEvent[]>(),
    db.from("fx_comments").select("id, user_id, author, body, created_at").eq("tenant_id", tenantId).eq("investigation_id", inv.id).order("created_at").returns<Comment[]>(),
    db.from("fx_feedback").select("id, user_id, user_name, verdict, note, created_at").eq("tenant_id", tenantId).eq("investigation_id", inv.id).order("created_at").returns<Feedback[]>(),
    db.from("fx_actions").select(ACTION_COLUMNS).eq("tenant_id", tenantId).eq("investigation_id", inv.id).order("proposed_at").returns<AgentAction[]>(),
    inv.station_id ? db.from("fx_stations").select(STATION_COLUMNS).eq("tenant_id", tenantId).eq("id", inv.station_id).maybeSingle<Station>() : Promise.resolve({ data: null, error: null }),
    inv.product_id ? db.from("fx_products").select("id, name, sku, board_rev, stage").eq("tenant_id", tenantId).eq("id", inv.product_id).maybeSingle<Product>() : Promise.resolve({ data: null, error: null }),
    // Similar: same classification or failure mode, anywhere in the organization.
    db
      .from("fx_investigations")
      .select(INVESTIGATION_COLUMNS)
      .eq("tenant_id", tenantId)
      .neq("id", inv.id)
      .or([inv.classification && inv.classification !== "unknown" ? `classification.eq.${inv.classification}` : null, inv.failure_mode ? `failure_mode.eq."${inv.failure_mode.replace(/"/g, "")}"` : null].filter(Boolean).join(",") || "id.is.null")
      .order("opened_at", { ascending: false })
      .limit(5)
      .returns<Investigation[]>(),
  ]);
  return {
    timeline: must(timeline, "load timeline") ?? [],
    comments: must(comments, "load comments") ?? [],
    feedback: must(feedback, "load feedback") ?? [],
    actions: must(actions, "load actions") ?? [],
    station: must(station, "load station") as Station | null,
    product: must(product, "load product") as Product | null,
    similar: (must(similar, "load similar") ?? []).map((r) => num(r, ["confidence"])),
  };
}

export async function createInvestigation(fields: {
  title: string;
  station_id: string | null;
  product_id: string | null;
  severity: Investigation["severity"];
  units_at_risk: number;
  classification: Investigation["classification"];
  failure_mode: string | null;
}) {
  const { tenantId, db } = await ctx();
  const number = must(await db.rpc("fx_next_investigation_number", { p_tenant_id: tenantId }), "number investigation") as number;
  const row = one(
    await db
      .from("fx_investigations")
      .insert({ tenant_id: tenantId, number, ...fields })
      .select("id")
      .single<{ id: string }>(),
    "create investigation",
  );
  await log({ agent: "diagnosis", kind: "observed", message: `Opened INV-${number}: ${fields.title}`.slice(0, 500), investigation_id: row.id, station_id: fields.station_id });
  return row.id;
}

export async function updateInvestigation(id: string, fields: Partial<Pick<Investigation, "status" | "assignee_id" | "assignee_name" | "severity">>) {
  const { tenantId, db } = await ctx();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { ...fields };
  if (fields.status === "root_caused") patch.root_caused_at = now;
  if (fields.status === "closed") patch.closed_at = now;
  if (fields.status === "open" || fields.status === "testing") Object.assign(patch, { closed_at: null });
  const rows = must(await db.from("fx_investigations").update(patch).eq("tenant_id", tenantId).eq("id", id).select("id, number, root_caused_at"), "update investigation");
  if (!rows?.length) return false;
  if (fields.status) {
    const who = await actor();
    await addTimeline(id, { at: now, kind: "engineer", title: `${who.name} set status to ${fields.status.replace("_", " ")}` });
  }
  return true;
}

/** Stores a diagnosis from the agent (or the seed) on the investigation. */
export async function saveDiagnosis(
  id: string,
  d: { hypothesis: string; confidence: number; classification: Investigation["classification"]; evidence: Investigation["evidence"]; suggested_test: Investigation["suggested_test"]; model: string },
) {
  const { tenantId, db } = await ctx();
  const rows = must(
    await db
      .from("fx_investigations")
      .update({
        hypothesis: d.hypothesis,
        confidence: d.confidence,
        classification: d.classification,
        evidence: d.evidence,
        suggested_test: d.suggested_test,
        diagnosis_model: d.model,
        diagnosed_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select("id, number"),
    "save diagnosis",
  );
  if (!rows?.length) return false;
  await addTimeline(id, { at: new Date().toISOString(), kind: "agent", title: `New hypothesis (${Math.round(d.confidence * 100)}% confidence)`, detail: d.hypothesis });
  await log({ agent: "diagnosis", kind: "decided", message: `INV-${rows[0].number}: ${d.hypothesis}`.slice(0, 500), investigation_id: id, inputs: { model: d.model, confidence: d.confidence } });
  return true;
}

export async function addTimeline(investigationId: string, e: { at: string; kind: TimelineEvent["kind"]; title: string; detail?: string | null; data?: Record<string, unknown> }) {
  const { tenantId, db } = await ctx();
  must(
    await db.from("fx_timeline").insert({ tenant_id: tenantId, investigation_id: investigationId, at: e.at, kind: e.kind, title: e.title.slice(0, 200), detail: e.detail ?? null, data: e.data ?? {} }),
    "add timeline event",
  );
}

/** One click: queue the agent's suggested test on the station, recorded as an applied run_test action. */
export async function runSuggestedTest(id: string) {
  const { tenantId, db } = await ctx();
  const inv = must(await db.from("fx_investigations").select(INVESTIGATION_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle<Investigation>(), "load investigation");
  if (!inv || !inv.suggested_test || !inv.station_id) return null;
  const who = await actor();
  const now = new Date().toISOString();
  const action = one(
    await db
      .from("fx_actions")
      .insert({
        tenant_id: tenantId,
        station_id: inv.station_id,
        investigation_id: id,
        kind: "run_test",
        title: inv.suggested_test.name.slice(0, 200),
        rationale: inv.suggested_test.rationale.slice(0, 2000),
        change: { steps: inv.suggested_test.steps, minutes: inv.suggested_test.minutes },
        status: "applied",
        decided_by: who.id,
        decided_by_name: who.name,
        decided_at: now,
        applied_at: now,
      })
      .select("id")
      .single<{ id: string }>(),
    "queue test",
  );
  must(await db.from("fx_investigations").update({ status: "testing" }).eq("tenant_id", tenantId).eq("id", id).in("status", ["open"]), "update status");
  await addTimeline(id, { at: now, kind: "test_run", title: `${who.name} approved: ${inv.suggested_test.name}`, detail: `Queued on the station. About ${inv.suggested_test.minutes} minutes. Results arrive through the station's connector.` });
  await log({ agent: "diagnosis", kind: "acted", message: `Queued "${inv.suggested_test.name}" for INV-${inv.number} (approved by ${who.name})`.slice(0, 500), investigation_id: id, station_id: inv.station_id, action_id: action.id });
  return action.id;
}

export async function addComment(investigationId: string, body: string) {
  const { tenantId, db } = await ctx();
  const who = await actor();
  const exists = must(await db.from("fx_investigations").select("id").eq("tenant_id", tenantId).eq("id", investigationId).maybeSingle(), "load investigation");
  if (!exists) return false;
  must(await db.from("fx_comments").insert({ tenant_id: tenantId, investigation_id: investigationId, user_id: who.id, author: who.name, body }), "add comment");
  return true;
}

/** An engineer's verdict on the current hypothesis. One per person; giving it again replaces it. */
export async function giveFeedback(investigationId: string, verdict: Feedback["verdict"], note: string | null) {
  const { tenantId, db } = await ctx();
  const who = await actor();
  const inv = must(await db.from("fx_investigations").select("id, number, hypothesis").eq("tenant_id", tenantId).eq("id", investigationId).maybeSingle<{ id: string; number: number; hypothesis: string | null }>(), "load investigation");
  if (!inv) return false;
  must(
    await db
      .from("fx_feedback")
      .upsert({ tenant_id: tenantId, investigation_id: investigationId, user_id: who.id, user_name: who.name, verdict, note, hypothesis: inv.hypothesis, created_at: new Date().toISOString() }, { onConflict: "tenant_id,investigation_id,user_id" }),
    "save feedback",
  );
  await log({ agent: "operator", kind: "feedback", message: `${who.name} said the INV-${inv.number} diagnosis was ${verdict === "partly" ? "partly right" : verdict}`, investigation_id: investigationId, inputs: { verdict, note } });
  return true;
}

/** Turns the read-only share link on (returns its token) or off (returns null). */
export async function setSharing(investigationId: string, on: boolean) {
  const { tenantId, db } = await ctx();
  const token = on ? randomBytes(24).toString("base64url") : null;
  const rows = must(
    await db.from("fx_investigations").update({ share_token: token }).eq("tenant_id", tenantId).eq("id", investigationId).select("id, number"),
    "update sharing",
  );
  if (!rows?.length) throw new FixtError("That investigation no longer exists");
  const who = await actor();
  await log({ agent: "operator", kind: "decided", message: `${who.name} ${on ? "shared" : "stopped sharing"} INV-${rows[0].number} by link`, investigation_id: investigationId });
  return token;
}

/**
 * A shared investigation, for the public /share page. The token is the only
 * credential, so this is the one read that doesn't start from a session; it
 * returns only what the shared page shows.
 */
export async function getSharedInvestigation(token: string) {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const db = createAdminSupabase();
  const { data: row, error } = await db.from("fx_investigations").select(`tenant_id, ${INVESTIGATION_COLUMNS}`).eq("share_token", token).maybeSingle<Investigation & { tenant_id: string }>();
  if (error) throw new Error(`Failed to load shared investigation: ${error.message}`);
  if (!row) return null;
  const { data: tenant } = await db.from("tenants").select("name, status").eq("id", row.tenant_id).maybeSingle<{ name: string; status: string }>();
  if (tenant?.status !== "active") return null;
  const { tenant_id: tenantId, ...inv } = row;
  const parts = await investigationParts(db, tenantId, num(inv as Investigation, ["confidence"]));
  return { organization: tenant.name, investigation: inv as Investigation, timeline: parts.timeline, comments: parts.comments, station: parts.station, product: parts.product };
}

// Agent actions -------------------------------------------------------------------------

export async function listActions(opts: { status?: AgentAction["status"][]; limit?: number } = {}): Promise<AgentAction[]> {
  const { tenantId, db } = await ctx();
  let q = db.from("fx_actions").select(ACTION_COLUMNS).eq("tenant_id", tenantId);
  if (opts.status?.length) q = q.in("status", opts.status);
  return must(await q.order("proposed_at", { ascending: false }).limit(opts.limit ?? 200).returns<AgentAction[]>(), "load actions") ?? [];
}

export async function countPendingApprovals() {
  const { tenantId, db } = await ctx();
  const { count, error } = await db.from("fx_actions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "proposed");
  if (error) throw new Error(`Failed to count approvals: ${error.message}`);
  return count ?? 0;
}

/** Writes a change to the line. `forward` applies change.after; otherwise it restores change.before (rollback). */
async function writeChange(db: ReturnType<typeof createAdminSupabase>, tenantId: string, a: AgentAction, forward: boolean) {
  const c = a.change as Record<string, unknown>;
  const value = forward ? c.after : c.before;
  const today = new Date();
  switch (a.kind) {
    case "change_limit": {
      if ((c.field !== "lsl" && c.field !== "usl") || !a.test_id) throw new FixtError("This change has no limit to set");
      must(await db.from("fx_tests").update({ [c.field]: value }).eq("tenant_id", tenantId).eq("id", a.test_id), "change limit");
      return;
    }
    case "update_baseline": {
      if (!a.test_id) throw new FixtError("This change has no test");
      const v = value as { mean: number; sd: number } | null;
      must(await db.from("fx_tests").update({ baseline_mean: v?.mean ?? null, baseline_sd: v?.sd ?? null, baseline_at: today.toISOString() }).eq("tenant_id", tenantId).eq("id", a.test_id), "update baseline");
      return;
    }
    case "update_sequence": {
      must(await db.from("fx_stations").update({ sequence_version: String(value ?? "") || null }).eq("tenant_id", tenantId).eq("id", a.station_id), "update sequence");
      return;
    }
    case "recalibrate": {
      const before = (c.before ?? {}) as { calibrated_at?: string | null; calibration_due?: string | null };
      const patch = forward
        ? { calibrated_at: isoDay(today), calibration_due: isoDay(new Date(today.getTime() + 90 * 86_400_000)), status: "running" }
        : { calibrated_at: before.calibrated_at ?? null, calibration_due: before.calibration_due ?? null };
      must(await db.from("fx_stations").update(patch).eq("tenant_id", tenantId).eq("id", a.station_id), "recalibrate");
      return;
    }
    case "quarantine_lot": {
      if (typeof c.lot_id !== "string") throw new FixtError("This change has no lot");
      must(await db.from("fx_lots").update({ quarantined: forward }).eq("tenant_id", tenantId).eq("id", c.lot_id), "quarantine lot");
      return;
    }
    case "run_test":
      return;
  }
}

/** Approves (and applies) or rejects a proposed action. */
export async function decideAction(id: string, approve: boolean, note: string | null) {
  const { tenantId, db } = await ctx();
  const who = await actor();
  const a = must(await db.from("fx_actions").select(ACTION_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle<AgentAction>(), "load action");
  if (!a) return false;
  if (a.status !== "proposed") throw new FixtError("Someone already decided this one. Refresh the page.");
  const now = new Date().toISOString();
  if (approve) await writeChange(db, tenantId, a, true);
  must(
    await db
      .from("fx_actions")
      .update({ status: approve ? "applied" : "rejected", decided_by: who.id, decided_by_name: who.name, decided_at: now, decision_note: note, applied_at: approve ? now : null })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .eq("status", "proposed"),
    "decide action",
  );
  if (approve && a.alert_id) must(await db.from("fx_alerts").update({ status: "resolved", resolved_at: now }).eq("tenant_id", tenantId).eq("id", a.alert_id), "resolve alert");
  await log({
    agent: "operator",
    kind: "decided",
    message: `${who.name} ${approve ? "approved" : "rejected"}: ${a.title}`.slice(0, 500),
    station_id: a.station_id,
    investigation_id: a.investigation_id,
    action_id: a.id,
    inputs: { note },
    outcome: approve ? "applied" : "rejected",
  });
  if (a.investigation_id) await addTimeline(a.investigation_id, { at: now, kind: "engineer", title: `${who.name} ${approve ? "approved and applied" : "rejected"}: ${a.title}`, detail: note });
  return true;
}

/** Undoes an applied change by restoring what it replaced. */
export async function rollbackAction(id: string) {
  const { tenantId, db } = await ctx();
  const who = await actor();
  const a = must(await db.from("fx_actions").select(ACTION_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle<AgentAction>(), "load action");
  if (!a) return false;
  if (a.status !== "applied" || !LINE_CHANGING.includes(a.kind)) throw new FixtError("Only applied changes to the line can be rolled back");
  await writeChange(db, tenantId, a, false);
  const now = new Date().toISOString();
  must(await db.from("fx_actions").update({ status: "rolled_back", rolled_back_at: now, rolled_back_by: who.id }).eq("tenant_id", tenantId).eq("id", id), "roll back");
  await log({ agent: "operator", kind: "acted", message: `${who.name} rolled back: ${a.title}`.slice(0, 500), station_id: a.station_id, action_id: a.id, outcome: "rolled_back" });
  if (a.investigation_id) await addTimeline(a.investigation_id, { at: now, kind: "engineer", title: `${who.name} rolled back: ${a.title}` });
  return true;
}

// Agent log -----------------------------------------------------------------------------

export async function listAgentLog(opts: { limit?: number; agent?: string; before?: number } = {}): Promise<AgentLogEntry[]> {
  const { tenantId, db } = await ctx();
  let q = db.from("fx_agent_log").select(LOG_COLUMNS).eq("tenant_id", tenantId);
  if (opts.agent) q = q.eq("agent", opts.agent);
  if (opts.before) q = q.lt("id", opts.before);
  return must(await q.order("at", { ascending: false }).order("id", { ascending: false }).limit(opts.limit ?? 50).returns<AgentLogEntry[]>(), "load agent log") ?? [];
}

export async function log(e: Omit<Partial<AgentLogEntry>, "id"> & Pick<AgentLogEntry, "agent" | "kind" | "message">) {
  const { tenantId, db } = await ctx();
  must(await db.from("fx_agent_log").insert({ tenant_id: tenantId, ...e, message: e.message.slice(0, 500) }), "write agent log");
}

/** Every diagnosis verdict, for the agent trust page (and future evals). */
export async function listFeedback(limit = 100) {
  const { tenantId, db } = await ctx();
  return (
    must(
      await db
        .from("fx_feedback")
        .select("id, investigation_id, user_name, verdict, note, hypothesis, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(limit)
        .returns<(Feedback & { investigation_id: string; hypothesis: string | null })[]>(),
      "load feedback",
    ) ?? []
  );
}

// Quality data --------------------------------------------------------------------------

export async function listFailures(days = 30): Promise<Failure[]> {
  const { tenantId, db } = await ctx();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  // PostgREST caps a response at 1,000 rows, so page through (up to 20,000).
  const rows: Failure[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const page = must(
      await db.from("fx_failures").select(FAILURE_COLUMNS).eq("tenant_id", tenantId).gte("failed_at", since).order("failed_at", { ascending: false }).order("id").range(from, from + 999).returns<Failure[]>(),
      "load failures",
    ) ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows.map((f) => num(f, ["scrap_cost"]));
}

export async function listLots(): Promise<Lot[]> {
  const { tenantId, db } = await ctx();
  return must(await db.from("fx_lots").select("id, part, lot_code, supplier, received_on, units, quarantined").eq("tenant_id", tenantId).order("received_on", { ascending: false }).returns<Lot[]>(), "load lots") ?? [];
}

// Bring-up ------------------------------------------------------------------------------

const BRINGUP_COLUMNS = "id, product_id, name, stage, schematic_name, firmware_name, design_notes, plan, coverage, plan_model, golden_units, golden_target, created_at, updated_at";

export async function listBringups(): Promise<Bringup[]> {
  const { tenantId, db } = await ctx();
  return must(await db.from("fx_bringups").select(BRINGUP_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).returns<Bringup[]>(), "load bring-ups") ?? [];
}

export async function getBringup(id: string): Promise<Bringup | null> {
  const { tenantId, db } = await ctx();
  return must(await db.from("fx_bringups").select(BRINGUP_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle<Bringup>(), "load bring-up");
}

export async function createBringup(fields: { name: string; schematic_name: string | null; firmware_name: string | null; design_notes: string | null; golden_target: number }) {
  const { tenantId, db } = await ctx();
  const product = one(await db.from("fx_products").insert({ tenant_id: tenantId, name: fields.name, stage: "bringup" }).select("id").single<{ id: string }>(), "create product");
  const row = one(await db.from("fx_bringups").insert({ tenant_id: tenantId, product_id: product.id, ...fields }).select("id").single<{ id: string }>(), "create bring-up");
  await log({ agent: "bringup", kind: "observed", message: `New bring-up: ${fields.name}` });
  return row.id;
}

export async function updateBringup(id: string, fields: Partial<Pick<Bringup, "stage" | "golden_units" | "plan" | "coverage" | "plan_model" | "design_notes">>) {
  const { tenantId, db } = await ctx();
  const rows = must(await db.from("fx_bringups").update(fields).eq("tenant_id", tenantId).eq("id", id).select("id, name, product_id"), "update bring-up");
  if (!rows?.length) return false;
  if (fields.stage === "production_ready" && rows[0].product_id)
    must(await db.from("fx_products").update({ stage: "production" }).eq("tenant_id", tenantId).eq("id", rows[0].product_id), "update product");
  return true;
}

// Collaboration -------------------------------------------------------------------------

export async function listHandoffs(limit = 40): Promise<Handoff[]> {
  const { tenantId, db } = await ctx();
  return must(await db.from("fx_handoffs").select("id, line_id, shift, user_id, author, body, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(limit).returns<Handoff[]>(), "load handoffs") ?? [];
}

export async function addHandoff(lineId: string, shift: Handoff["shift"], body: string) {
  const { tenantId, db } = await ctx();
  const who = await actor();
  const line = must(await db.from("fx_lines").select("id").eq("tenant_id", tenantId).eq("id", lineId).maybeSingle(), "load line");
  if (!line) return false;
  must(await db.from("fx_handoffs").insert({ tenant_id: tenantId, line_id: lineId, shift, user_id: who.id, author: who.name, body }), "add handoff");
  return true;
}

// Integrations and admin ----------------------------------------------------------------

export async function listConnectors(): Promise<Connector[]> {
  const { tenantId, db } = await ctx();
  const rows = must(
    await db.from("fx_connectors").select("id, kind, name, status, last_sync_at, records_synced, last_error, key_prefix, config, created_at").eq("tenant_id", tenantId).order("created_at").returns<Connector[]>(),
    "load connectors",
  );
  return (rows ?? []).map((r) => num(r, ["records_synced"]));
}

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** A random 5 to 15% of n (at least 1), so simulated sync counts don't look canned. */
const previewDelta = (firstSync: number) => Math.max(1, Math.round(firstSync * (0.05 + Math.random() * 0.1)));

/**
 * Creates a connector. An ingest-key connector gets its key, returned once (only
 * its hash is kept). A preview connector gets no key: it stores its settings and
 * reports a simulated first sync.
 */
export async function createConnector(kind: Connector["kind"], name: string, config: Record<string, string> = {}): Promise<{ id: string; key: string | null }> {
  const { tenantId, db } = await ctx();
  const preview = connectorKindOf(kind).preview;
  const key = preview ? null : `fxk_${randomBytes(24).toString("base64url")}`;
  const row = one(
    await db
      .from("fx_connectors")
      .insert({
        tenant_id: tenantId,
        kind,
        name,
        status: "connected",
        config,
        ...(key ? { key_hash: hashKey(key), key_prefix: key.slice(0, 10) } : {}),
        ...(preview ? { last_sync_at: new Date().toISOString(), records_synced: preview.firstSync + previewDelta(preview.firstSync) } : {}),
      })
      .select("id")
      .single<{ id: string }>(),
    "create connector",
  );
  return { id: row.id, key };
}

/** Simulates a sync on a preview connector: picks up a few new records. Null for other connectors. */
export async function syncPreviewConnector(id: string) {
  const { tenantId, db } = await ctx();
  const { data: c } = await db.from("fx_connectors").select("kind, status, records_synced").eq("tenant_id", tenantId).eq("id", id).maybeSingle<{ kind: string; status: string; records_synced: number }>();
  const preview = c && connectorKindOf(c.kind).preview;
  if (!c || !preview) return null;
  if (c.status === "paused") throw new FixtError("Resume the connector to sync it.");
  const rows = must(
    await db
      .from("fx_connectors")
      .update({ last_sync_at: new Date().toISOString(), records_synced: Number(c.records_synced) + previewDelta(preview.firstSync / 10), status: "connected", last_error: null })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select("id"),
    "sync connector",
  );
  return !!rows?.length;
}

export async function rotateConnectorKey(id: string) {
  const { tenantId, db } = await ctx();
  const key = `fxk_${randomBytes(24).toString("base64url")}`;
  const ingestKinds = CONNECTOR_KINDS.filter((k) => !k.preview).map((k) => k.key);
  const rows = must(await db.from("fx_connectors").update({ key_hash: hashKey(key), key_prefix: key.slice(0, 10) }).eq("tenant_id", tenantId).eq("id", id).in("kind", ingestKinds).select("id"), "rotate key");
  return rows?.length ? key : null;
}

export async function setConnectorStatus(id: string, status: "connected" | "paused") {
  const { tenantId, db } = await ctx();
  const rows = must(await db.from("fx_connectors").update({ status }).eq("tenant_id", tenantId).eq("id", id).select("id"), "update connector");
  return !!rows?.length;
}

export async function removeConnector(id: string) {
  const { tenantId, db } = await ctx();
  const rows = must(await db.from("fx_connectors").delete().eq("tenant_id", tenantId).eq("id", id).select("id"), "remove connector");
  return !!rows?.length;
}

export async function listChannels(): Promise<AlertChannel[]> {
  const { tenantId, db } = await ctx();
  return (
    must(
      await db.from("fx_alert_channels").select("id, kind, target, label, min_severity, enabled, last_sent_at, last_error").eq("tenant_id", tenantId).order("created_at").returns<AlertChannel[]>(),
      "load alert channels",
    ) ?? []
  );
}

export async function addChannel(fields: Pick<AlertChannel, "kind" | "target" | "label" | "min_severity">) {
  const { tenantId, db } = await ctx();
  return one(await db.from("fx_alert_channels").insert({ tenant_id: tenantId, ...fields }).select("id").single<{ id: string }>(), "add alert channel").id;
}

export async function updateChannel(id: string, fields: Partial<Pick<AlertChannel, "enabled" | "min_severity">>) {
  const { tenantId, db } = await ctx();
  const rows = must(await db.from("fx_alert_channels").update(fields).eq("tenant_id", tenantId).eq("id", id).select("id"), "update alert channel");
  return !!rows?.length;
}

export async function removeChannel(id: string) {
  const { tenantId, db } = await ctx();
  const rows = must(await db.from("fx_alert_channels").delete().eq("tenant_id", tenantId).eq("id", id).select("id"), "remove alert channel");
  return !!rows?.length;
}

export async function getSettings(): Promise<Settings> {
  const { tenantId, db } = await ctx();
  const row = must(
    await db
      .from("fx_settings")
      .select("engineer_hourly_rate, escape_cost, fixt_annual_price, baseline_root_cause_hours, weekly_summary_enabled, weekly_summary_to, weekly_summary_sent_at, deployment, data_region, sso_required, demo_loaded_at")
      .eq("tenant_id", tenantId)
      .maybeSingle<Settings>(),
    "load settings",
  );
  return row ? num(row, ["engineer_hourly_rate", "escape_cost", "fixt_annual_price", "baseline_root_cause_hours"]) : DEFAULT_SETTINGS;
}

export async function updateSettings(fields: Partial<Settings>) {
  const { tenantId, db } = await ctx();
  must(await db.from("fx_settings").upsert({ tenant_id: tenantId, ...fields }, { onConflict: "tenant_id" }), "save settings");
}

export async function listRoles(): Promise<Record<string, Role>> {
  const { tenantId, db } = await ctx();
  const rows = must(await db.from("fx_roles").select("user_id, role").eq("tenant_id", tenantId).returns<{ user_id: string; role: Role }[]>(), "load roles");
  return Object.fromEntries((rows ?? []).map((r) => [r.user_id, r.role]));
}

export async function setRole(userId: string, role: Role) {
  const { tenantId, db } = await ctx();
  must(await db.from("fx_roles").upsert({ tenant_id: tenantId, user_id: userId, role, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,user_id" }), "save role");
}

/** Whether the organization has any fleet yet (empty means show onboarding / demo data). */
export async function hasFleet() {
  const { tenantId, db } = await ctx();
  const { count, error } = await db.from("fx_stations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (error) throw new Error(`Failed to check fleet: ${error.message}`);
  return (count ?? 0) > 0;
}
