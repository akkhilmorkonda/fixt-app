// Row shapes and display labels for the FIXT domain. Pure, so client
// components, the server and tests share them.

export type Severity = "critical" | "high" | "medium" | "low";
export type StationStatus = "running" | "idle" | "alarming" | "offline";
export type Autonomy = "suggest" | "approve" | "autonomous";
export type Classification = "fixture" | "component_lot" | "environmental" | "product_defect" | "test_program" | "unknown";
export type InvestigationStatus = "open" | "testing" | "root_caused" | "closed";
export type ActionStatus = "proposed" | "approved" | "rejected" | "applied" | "rolled_back";
export type ActionKind = "recalibrate" | "change_limit" | "update_sequence" | "run_test" | "quarantine_lot" | "update_baseline";
export type AlertKind = "drift" | "anomaly" | "false_failure" | "calibration" | "offline" | "yield";
export type Shift = "A" | "B" | "C";
export type Role = "test_engineer" | "quality" | "manufacturing_lead" | "cm_partner";
export type ConnectorKind = "teststand" | "python" | "labview" | "mes" | "plm" | "erp" | "csv" | "field_returns" | "snowflake" | "jira" | "google_drive" | "onedrive";
export type ChannelKind = "slack" | "teams" | "email" | "pagerduty";
export type BringupStage = "first_article" | "evt" | "dvt" | "pvt" | "production_ready";

export type Site = { id: string; name: string; location: string | null; timezone: string };
export type Product = { id: string; name: string; sku: string | null; board_rev: string; stage: string };
export type Line = { id: string; site_id: string; product_id: string | null; name: string; autonomy: Autonomy };

export type Station = {
  id: string;
  line_id: string;
  name: string;
  kind: string;
  status: StationStatus;
  executive: string;
  sequence_name: string | null;
  sequence_version: string | null;
  fixture_id: string | null;
  fixture_cycles: number;
  fixture_cycle_limit: number;
  probe_wear_pct: number;
  calibrated_at: string | null;
  calibration_due: string | null;
  last_seen_at: string | null;
};

export type TestDef = {
  id: string;
  station_id: string;
  name: string;
  unit: string;
  lsl: number | null;
  usl: number | null;
  nominal: number | null;
  baseline_mean: number | null;
  baseline_sd: number | null;
  baseline_at: string | null;
};

export type Measurement = { measured_at: string; value: number; passed: boolean; serial: string | null; shift: Shift | null; board_rev: string | null; lot_code: string | null };
export type YieldRow = { line_id: string; day: string; shift: Shift; units: number; first_pass: number; final_pass: number };

export type Lot = { id: string; part: string; lot_code: string; supplier: string; received_on: string | null; units: number; quarantined: boolean };

export type Failure = {
  id: string;
  station_id: string;
  test_id: string | null;
  lot_id: string | null;
  failed_at: string;
  serial: string | null;
  mode: string;
  shift: Shift | null;
  board_rev: string | null;
  retest_passed: boolean | null;
  false_failure: boolean;
  escaped: boolean;
  scrap_cost: number;
  rework_minutes: number;
  retest_minutes: number;
};

export type Alert = {
  id: string;
  station_id: string;
  test_id: string | null;
  kind: AlertKind;
  classification: Classification;
  title: string;
  detail: string | null;
  baseline: number | null;
  current: number | null;
  unit: string | null;
  started_at: string | null;
  detected_at: string;
  severity: Severity;
  units_at_risk: number;
  status: "open" | "acknowledged" | "resolved" | "suppressed";
  investigation_id: string | null;
  resolved_at: string | null;
};

export type Evidence = { label: string; detail: string; supports: boolean };
export type SuggestedTest = { name: string; rationale: string; steps: string[]; minutes: number };

export type Investigation = {
  id: string;
  number: number;
  title: string;
  station_id: string | null;
  product_id: string | null;
  status: InvestigationStatus;
  severity: Severity;
  units_at_risk: number;
  failure_mode: string | null;
  classification: Classification | null;
  hypothesis: string | null;
  confidence: number | null;
  evidence: Evidence[];
  suggested_test: SuggestedTest | null;
  diagnosis_model: string | null;
  diagnosed_at: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  opened_at: string;
  root_caused_at: string | null;
  closed_at: string | null;
  share_token: string | null;
  updated_at: string;
};

export type TimelineKind = "test_data" | "factory_log" | "board_rev" | "component_lot" | "field_return" | "agent" | "engineer" | "test_run";
export type TimelineEvent = { id: number; at: string; kind: TimelineKind; title: string; detail: string | null; data: Record<string, unknown> };

export type AgentAction = {
  id: string;
  station_id: string;
  test_id: string | null;
  investigation_id: string | null;
  alert_id: string | null;
  kind: ActionKind;
  title: string;
  rationale: string | null;
  change: { field?: string; before?: unknown; after?: unknown; [k: string]: unknown };
  status: ActionStatus;
  proposed_at: string;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  applied_at: string | null;
  rolled_back_at: string | null;
};

export type AgentName = "drift" | "diagnosis" | "bringup" | "reporting" | "operator";
export type AgentLogEntry = {
  id: number;
  at: string;
  agent: AgentName;
  kind: "observed" | "decided" | "acted" | "asked" | "feedback";
  message: string;
  station_id: string | null;
  investigation_id: string | null;
  action_id: string | null;
  inputs: Record<string, unknown>;
  outcome: string | null;
};

export type Feedback = { id: string; user_id: string; user_name: string | null; verdict: "right" | "partly" | "wrong"; note: string | null; created_at: string };
export type Comment = { id: string; user_id: string; author: string; body: string; created_at: string };
export type Handoff = { id: string; line_id: string; shift: Shift; user_id: string; author: string; body: string; created_at: string };

export type PlanStep = { name: string; function: string; net: string | null; method: string; lsl: number | null; usl: number | null; unit: string };
export type CoverageArea = { area: string; total: number; tested: number };
export type Bringup = {
  id: string;
  product_id: string | null;
  name: string;
  stage: BringupStage;
  schematic_name: string | null;
  firmware_name: string | null;
  design_notes: string | null;
  plan: PlanStep[];
  coverage: CoverageArea[];
  plan_model: string | null;
  golden_units: number;
  golden_target: number;
  created_at: string;
  updated_at: string;
};

export type Connector = {
  id: string;
  kind: ConnectorKind;
  name: string;
  status: "connected" | "error" | "paused";
  last_sync_at: string | null;
  records_synced: number;
  last_error: string | null;
  key_prefix: string | null;
  /** Account settings for preview connectors (see CONNECTOR_KINDS fields); empty for ingest-key ones. */
  config: Record<string, string>;
  created_at: string;
};

export type AlertChannel = {
  id: string;
  kind: ChannelKind;
  target: string;
  label: string | null;
  min_severity: Severity;
  enabled: boolean;
  last_sent_at: string | null;
  last_error: string | null;
};

export type Settings = {
  engineer_hourly_rate: number;
  escape_cost: number;
  fixt_annual_price: number;
  baseline_root_cause_hours: number;
  weekly_summary_enabled: boolean;
  weekly_summary_to: string | null;
  weekly_summary_sent_at: string | null;
  deployment: "cloud" | "vpc" | "on_prem";
  data_region: "us" | "eu" | "apac";
  sso_required: boolean;
  demo_loaded_at: string | null;
};

export const DEFAULT_SETTINGS: Settings = {
  engineer_hourly_rate: 95,
  escape_cost: 1200,
  fixt_annual_price: 180000,
  baseline_root_cause_hours: 168,
  weekly_summary_enabled: false,
  weekly_summary_to: null,
  weekly_summary_sent_at: null,
  deployment: "cloud",
  data_region: "us",
  sso_required: false,
  demo_loaded_at: null,
};

// Labels --------------------------------------------------------------------------------

export const SEVERITIES: { key: Severity; label: string; rank: number; tone: string; dot: string }[] = [
  { key: "critical", label: "Critical", rank: 4, tone: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  { key: "high", label: "High", rank: 3, tone: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  { key: "medium", label: "Medium", rank: 2, tone: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  { key: "low", label: "Low", rank: 1, tone: "bg-zinc-100 text-zinc-600 ring-zinc-200", dot: "bg-zinc-400" },
];
export const severityOf = (s: string) => SEVERITIES.find((x) => x.key === s) ?? SEVERITIES[3];

export const STATION_STATUSES: { key: StationStatus; label: string; dot: string; text: string }[] = [
  { key: "running", label: "Running", dot: "bg-emerald-500", text: "text-emerald-700" },
  { key: "idle", label: "Idle", dot: "bg-zinc-400", text: "text-zinc-600" },
  { key: "alarming", label: "Alarming", dot: "bg-rose-500", text: "text-rose-700" },
  { key: "offline", label: "Offline", dot: "bg-zinc-300", text: "text-zinc-400" },
];
export const stationStatusOf = (s: string) => STATION_STATUSES.find((x) => x.key === s) ?? STATION_STATUSES[1];

export const CLASSIFICATIONS: { key: Classification; label: string; hint: string }[] = [
  { key: "fixture", label: "Fixture drift", hint: "The fixture, probes or instrument moved, not the product." },
  { key: "component_lot", label: "Component lot change", hint: "Lines up with a new lot or supplier of a part." },
  { key: "environmental", label: "Environmental", hint: "Temperature, humidity or power on the floor." },
  { key: "product_defect", label: "Real product defect", hint: "The units are actually bad." },
  { key: "test_program", label: "Test program", hint: "A sequence or limit change caused it." },
  { key: "unknown", label: "Unclassified", hint: "Not enough evidence yet." },
];
export const classificationOf = (c: string | null) => CLASSIFICATIONS.find((x) => x.key === c) ?? CLASSIFICATIONS[5];

export const INVESTIGATION_STATUSES: { key: InvestigationStatus; label: string; tone: string }[] = [
  { key: "open", label: "Open", tone: "bg-violet-50 text-violet-700 ring-violet-200" },
  { key: "testing", label: "Testing", tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  { key: "root_caused", label: "Root caused", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { key: "closed", label: "Closed", tone: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
];
export const investigationStatusOf = (s: string) => INVESTIGATION_STATUSES.find((x) => x.key === s) ?? INVESTIGATION_STATUSES[0];

export const ACTION_KINDS: { key: ActionKind; label: string }[] = [
  { key: "recalibrate", label: "Recalibrate" },
  { key: "change_limit", label: "Change limit" },
  { key: "update_sequence", label: "Update sequence" },
  { key: "run_test", label: "Run test" },
  { key: "quarantine_lot", label: "Quarantine lot" },
  { key: "update_baseline", label: "Update baseline" },
];
export const actionKindLabel = (k: string) => ACTION_KINDS.find((x) => x.key === k)?.label ?? k;

export const ACTION_STATUSES: { key: ActionStatus; label: string; tone: string }[] = [
  { key: "proposed", label: "Awaiting approval", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  { key: "approved", label: "Approved", tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  { key: "applied", label: "Applied", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { key: "rejected", label: "Rejected", tone: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  { key: "rolled_back", label: "Rolled back", tone: "bg-rose-50 text-rose-700 ring-rose-200" },
];
export const actionStatusOf = (s: string) => ACTION_STATUSES.find((x) => x.key === s) ?? ACTION_STATUSES[0];

/** Actions that change what the line does. These always need an approval unless the line is autonomous. */
export const LINE_CHANGING: ActionKind[] = ["recalibrate", "change_limit", "update_sequence", "update_baseline", "quarantine_lot"];

export const AUTONOMY: { key: Autonomy; label: string; hint: string }[] = [
  { key: "suggest", label: "Suggest only", hint: "Agents recommend. People make every change." },
  { key: "approve", label: "Act with approval", hint: "Agents prepare the change and apply it once someone approves." },
  { key: "autonomous", label: "Act autonomously", hint: "Agents apply changes themselves and report what they did. Everything can be rolled back." },
];

export const AGENTS: { key: AgentName; label: string }[] = [
  { key: "drift", label: "Drift agent" },
  { key: "diagnosis", label: "Diagnosis agent" },
  { key: "bringup", label: "Bring-up agent" },
  { key: "reporting", label: "Reporting agent" },
  { key: "operator", label: "Engineer" },
];
export const agentLabel = (a: string) => AGENTS.find((x) => x.key === a)?.label ?? a;

export const TIMELINE_KINDS: Record<TimelineKind, { label: string; dot: string }> = {
  test_data: { label: "Test data", dot: "bg-sky-500" },
  factory_log: { label: "Factory log", dot: "bg-zinc-500" },
  board_rev: { label: "Board revision", dot: "bg-indigo-500" },
  component_lot: { label: "Component lot", dot: "bg-amber-500" },
  field_return: { label: "Field return", dot: "bg-rose-500" },
  agent: { label: "Agent", dot: "bg-violet-500" },
  engineer: { label: "Engineer", dot: "bg-emerald-500" },
  test_run: { label: "Test run", dot: "bg-cyan-500" },
};

export const ROLES: { key: Role; label: string; hint: string }[] = [
  { key: "test_engineer", label: "Test engineer", hint: "Investigations, limits, sequences, approvals." },
  { key: "quality", label: "Quality", hint: "Investigations, suppliers and lots, reports." },
  { key: "manufacturing_lead", label: "Manufacturing lead", hint: "Fleet, yield, approvals, ROI." },
  { key: "cm_partner", label: "Contract manufacturer", hint: "Only investigations shared with them." },
];

export type ConnectorField = { key: string; label: string; placeholder: string };

/**
 * Ingest-key connectors post results to /api/ingest. Account connectors
 * (`preview`) connect by account instead: FIXT stores only the non-secret
 * settings in `fields` and simulates the sync, for demos.
 */
export const CONNECTOR_GROUPS: { key: string; label: string; hint: string }[] = [
  { key: "stations", label: "Test stations", hint: "Where measurements come from. Each station sends its results with a connector key." },
  { key: "factory", label: "Factory systems", hint: "Who built each unit, with which parts and board revision, so agents can trace a drift to its cause." },
  { key: "tools", label: "Data, documents & tickets", hint: "Backfill history from your warehouse, give agents specs and reports to cite, and turn investigations into tickets." },
];

export const CONNECTOR_KINDS: { key: ConnectorKind; label: string; group: string; hint: string; preview?: { fields: ConnectorField[]; unit: string; firstSync: number } }[] = [
  { key: "teststand", label: "NI TestStand", group: "stations", hint: "A result processor posts every UUT report as it finishes." },
  { key: "python", label: "Python", group: "stations", hint: "A pytest or OpenHTF hook, or a few lines with requests." },
  { key: "labview", label: "LabVIEW", group: "stations", hint: "An HTTP client VI posts results after each run." },
  { key: "csv", label: "Spreadsheets & CSV", group: "stations", hint: "Upload exports from any tester, with nothing to install." },
  { key: "mes", label: "MES", group: "factory", hint: "Unit routing, work orders, operators and shifts." },
  { key: "plm", label: "PLM", group: "factory", hint: "Board revisions, BOMs and engineering changes." },
  { key: "erp", label: "ERP", group: "factory", hint: "Component lots, suppliers and receiving." },
  { key: "field_returns", label: "Field returns (RMA)", group: "factory", hint: "Customer returns and failure analysis results." },
  {
    key: "google_drive",
    label: "Google Drive",
    group: "tools",
    hint: "Test specs, fixture drawings and 8D reports agents can cite.",
    preview: { fields: [{ key: "folder", label: "Folder", placeholder: "Test engineering / Pulse Band" }], unit: "files", firstSync: 140 },
  },
  {
    key: "onedrive",
    label: "OneDrive & SharePoint",
    group: "tools",
    hint: "Contract manufacturer reports and work instructions.",
    preview: { fields: [{ key: "folder", label: "Folder or site", placeholder: "Penang CM / Weekly reports" }], unit: "files", firstSync: 60 },
  },
  {
    key: "snowflake",
    label: "Snowflake",
    group: "tools",
    hint: "Backfill historical results and write yield and drift tables back.",
    preview: {
      fields: [
        { key: "account", label: "Account", placeholder: "acme-xy12345" },
        { key: "warehouse", label: "Warehouse", placeholder: "FIXT_WH" },
        { key: "database", label: "Database", placeholder: "TEST_DATA" },
      ],
      unit: "rows",
      firstSync: 1_200_000,
    },
  },
  {
    key: "jira",
    label: "Jira",
    group: "tools",
    hint: "Open issues from investigations and keep their status in sync.",
    preview: {
      fields: [
        { key: "site", label: "Site", placeholder: "acme.atlassian.net" },
        { key: "project", label: "Project key", placeholder: "FA" },
      ],
      unit: "issues",
      firstSync: 30,
    },
  },
];
export const connectorKindOf = (k: string) => CONNECTOR_KINDS.find((x) => x.key === k) ?? CONNECTOR_KINDS.find((x) => x.key === "csv")!;

export const CHANNEL_KINDS: { key: ChannelKind; label: string; placeholder: string }[] = [
  { key: "slack", label: "Slack", placeholder: "https://hooks.slack.com/services/…" },
  { key: "teams", label: "Microsoft Teams", placeholder: "https://…webhook.office.com/…" },
  { key: "email", label: "Email", placeholder: "test-eng@yourcompany.com" },
  { key: "pagerduty", label: "PagerDuty", placeholder: "Events API v2 routing key" },
];

export const BRINGUP_STAGES: { key: BringupStage; label: string }[] = [
  { key: "first_article", label: "First article" },
  { key: "evt", label: "EVT" },
  { key: "dvt", label: "DVT" },
  { key: "pvt", label: "PVT" },
  { key: "production_ready", label: "Production-ready" },
];

export const STATION_KINDS: Record<string, string> = {
  ict: "In-circuit",
  fct: "Functional",
  eol: "End of line",
  rf: "RF",
  burn_in: "Burn-in",
  programming: "Programming",
  vision: "Vision / AOI",
};
