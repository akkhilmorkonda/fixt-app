import { CHANNEL_KINDS, CONNECTOR_KINDS, ROLES, SEVERITIES, type AlertChannel, type ChannelKind, type ConnectorKind, type Role, type Settings, type Severity } from "./types";

// Validation for input that comes from the browser or the ingest API. Pure,
// so tests cover it.

type Result<T> = { fields: T } | { errors: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

const text = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length <= max ? s : null;
};

export const isSeverity = (v: unknown): v is Severity => SEVERITIES.some((s) => s.key === v);
export const isRole = (v: unknown): v is Role => ROLES.some((r) => r.key === v);
export const isConnectorKind = (v: unknown): v is ConnectorKind => CONNECTOR_KINDS.some((c) => c.key === v);
export const isShift = (v: unknown): v is "A" | "B" | "C" => v === "A" || v === "B" || v === "C";

/** A preview connector's settings: only its declared fields, all required. Ingest-key connectors take none. */
export function parseConnectorConfig(kind: ConnectorKind, input: unknown): Result<Record<string, string>> {
  const fields = CONNECTOR_KINDS.find((c) => c.key === kind)?.preview?.fields ?? [];
  const o = (input ?? {}) as Record<string, unknown>;
  const config: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = text(o[f.key], 200);
    if (v === null) errors[f.key] = "Too long";
    else if (!v) errors[f.key] = "Required";
    else config[f.key] = v;
  }
  return Object.keys(errors).length ? { errors } : { fields: config };
}

export function parseComment(v: unknown) {
  const s = text(v, 4000);
  return s ? s : null;
}

export function parseChannel(input: unknown): Result<Pick<AlertChannel, "kind" | "target" | "label" | "min_severity">> {
  const o = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const kind = CHANNEL_KINDS.find((c) => c.key === o.kind)?.key as ChannelKind | undefined;
  if (!kind) errors.kind = "Pick a channel";
  const target = text(o.target, 500) ?? "";
  if (!target) errors.target = "Required";
  else if ((kind === "slack" || kind === "teams") && !/^https:\/\/[^\s]+$/.test(target)) errors.target = "Paste the incoming-webhook URL (https://…)";
  else if (kind === "slack" && !/^https:\/\/hooks\.slack\.com\//.test(target)) errors.target = "Slack webhooks start with https://hooks.slack.com/";
  else if (kind === "teams" && !/^https:\/\/[a-z0-9.-]+\.(webhook\.office\.com|logic\.azure\.com|office\.com)\//i.test(target)) errors.target = "That doesn't look like a Teams webhook URL";
  else if (kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) errors.target = "Enter an email address";
  else if (kind === "pagerduty" && !/^[A-Za-z0-9]{32}$/.test(target)) errors.target = "PagerDuty routing keys are 32 letters and numbers";
  const label = text(o.label, 120);
  if (label === null) errors.label = "Keep it under 120 characters";
  const min = isSeverity(o.min_severity) ? o.min_severity : null;
  if (!min) errors.min_severity = "Pick a severity";
  if (Object.keys(errors).length) return { errors };
  return { fields: { kind: kind!, target, label: label || null, min_severity: min! } };
}

export function parseSettings(input: unknown): Result<Partial<Settings>> {
  const o = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const money = (k: string, max: number) => {
    const n = typeof o[k] === "string" ? Number(o[k]) : o[k];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > max) {
      errors[k] = `Enter a number from 0 to ${max.toLocaleString()}`;
      return 0;
    }
    return Math.round(n * 100) / 100;
  };
  const fields: Partial<Settings> = {
    engineer_hourly_rate: money("engineer_hourly_rate", 10_000),
    escape_cost: money("escape_cost", 10_000_000),
    fixt_annual_price: money("fixt_annual_price", 100_000_000),
    baseline_root_cause_hours: money("baseline_root_cause_hours", 10_000),
    weekly_summary_enabled: o.weekly_summary_enabled === true || o.weekly_summary_enabled === "on",
  };
  if (!errors.baseline_root_cause_hours && !fields.baseline_root_cause_hours) errors.baseline_root_cause_hours = "Must be more than 0";
  const to = text(o.weekly_summary_to, 320);
  if (to === null || (to && !to.split(",").every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())))) errors.weekly_summary_to = "Enter one or more email addresses, separated by commas";
  fields.weekly_summary_to = to || null;
  if (fields.weekly_summary_enabled && !to) errors.weekly_summary_to = "Who should get the summary?";
  if (["cloud", "vpc", "on_prem"].includes(o.deployment as string)) fields.deployment = o.deployment as Settings["deployment"];
  if (["us", "eu", "apac"].includes(o.data_region as string)) fields.data_region = o.data_region as Settings["data_region"];
  fields.sso_required = o.sso_required === true || o.sso_required === "on";
  if (Object.keys(errors).length) return { errors };
  return { fields };
}

export function parseBringup(input: unknown): Result<{ name: string; schematic_name: string | null; firmware_name: string | null; design_notes: string | null; golden_target: number }> {
  const o = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const name = text(o.name, 120);
  if (!name) errors.name = "Name the product";
  const schematic = text(o.schematic_name, 200);
  const firmware = text(o.firmware_name, 200);
  const notes = text(o.design_notes, 20000);
  if (notes === null) errors.design_notes = "Keep design notes under 20,000 characters";
  const target = Number(o.golden_target ?? 5);
  if (!Number.isInteger(target) || target < 1 || target > 100) errors.golden_target = "Between 1 and 100";
  if (Object.keys(errors).length) return { errors };
  return { fields: { name: name!, schematic_name: schematic || null, firmware_name: firmware || null, design_notes: notes || null, golden_target: target } };
}

// Ingest --------------------------------------------------------------------------------

export type IngestResult = {
  station: string;
  test: string;
  value: number;
  unit?: string;
  lsl?: number | null;
  usl?: number | null;
  passed?: boolean;
  serial?: string;
  measured_at?: string;
  shift?: "A" | "B" | "C";
  board_rev?: string;
  lot?: string;
};

export const INGEST_MAX = 5000;

/** Validates one batch from a test executive. Returns the good rows and an error per bad row. */
export function parseIngest(body: unknown): { rows: IngestResult[]; errors: { index: number; error: string }[] } | { error: string } {
  const list = Array.isArray(body) ? body : Array.isArray((body as { results?: unknown })?.results) ? (body as { results: unknown[] }).results : null;
  if (!list) return { error: 'Send a JSON array of results, or {"results": [...]}' };
  if (list.length > INGEST_MAX) return { error: `At most ${INGEST_MAX} results per request` };
  const rows: IngestResult[] = [];
  const errors: { index: number; error: string }[] = [];
  list.forEach((raw, index) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const station = text(o.station, 120);
    const test = text(o.test, 120);
    const value = typeof o.value === "string" ? Number(o.value) : o.value;
    const lim = (v: unknown) => (v == null || v === "" ? null : typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && Number.isFinite(Number(v)) ? Number(v) : NaN);
    const lsl = lim(o.lsl);
    const usl = lim(o.usl);
    const at = o.measured_at == null ? undefined : typeof o.measured_at === "string" && !Number.isNaN(Date.parse(o.measured_at)) ? new Date(o.measured_at).toISOString() : "bad";
    if (!station) return errors.push({ index, error: "station is required" });
    if (!test) return errors.push({ index, error: "test is required" });
    if (typeof value !== "number" || !Number.isFinite(value)) return errors.push({ index, error: "value must be a number" });
    if (Number.isNaN(lsl) || Number.isNaN(usl)) return errors.push({ index, error: "lsl and usl must be numbers" });
    if (at === "bad") return errors.push({ index, error: "measured_at must be an ISO 8601 time" });
    if (at && Date.parse(at) > Date.now() + 5 * 60_000) return errors.push({ index, error: "measured_at is in the future" });
    if (o.shift != null && !isShift(o.shift)) return errors.push({ index, error: "shift must be A, B or C" });
    rows.push({
      station,
      test,
      value,
      unit: text(o.unit, 20) || undefined,
      lsl,
      usl,
      passed: typeof o.passed === "boolean" ? o.passed : undefined,
      serial: text(o.serial, 80) || undefined,
      measured_at: at,
      shift: isShift(o.shift) ? o.shift : undefined,
      board_rev: text(o.board_rev, 20) || undefined,
      lot: text(o.lot, 60) || undefined,
    });
  });
  return { rows, errors };
}

/** Parses a CSV export with a header row into ingest results (station,test,value,... columns). */
export function csvToResults(csv: string): Record<string, string>[] {
  const lines = csv.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const row: Record<string, string> = {};
    head.forEach((h, i) => {
      if (cells[i] !== undefined && cells[i] !== "") row[h] = cells[i];
    });
    return row;
  });
}
