-- FIXT: the test fleet, what the agents see in it, and what they do about it.
--
--   fx_sites > fx_lines > fx_stations > fx_tests      the fleet and its test limits
--   fx_measurements                                   every measured value (from connectors)
--   fx_yield                                          units / first-pass / final-pass per line, day and shift
--   fx_lots, fx_failures                              component lots and every failed unit
--   fx_alerts                                         drift, anomalies, false failures, calibration
--   fx_investigations, fx_timeline                    one per failure, with the joined evidence
--   fx_actions                                        anything an agent wants to change on the line
--   fx_agent_log                                      every agent observation, decision and outcome
--   fx_feedback, fx_comments, fx_handoffs             engineers' input
--   fx_bringups                                       new product bring-up
--   fx_connectors, fx_alert_channels, fx_settings,    integrations and admin
--   fx_roles
--
-- Every row belongs to a tenant. References between tenant-owned rows include
-- tenant_id, so nothing can point across organizations. Same lockdown as the
-- platform tables: RLS on with no policies, nothing granted to anon or
-- authenticated.

-- Fleet ---------------------------------------------------------------------------------

create table public.fx_sites (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  location text check (char_length(location) <= 200),
  timezone text not null default 'America/Los_Angeles' check (char_length(timezone) <= 64),
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.fx_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  sku text check (char_length(sku) <= 60),
  board_rev text not null default 'A' check (char_length(board_rev) <= 20),
  stage text not null default 'production' check (stage in ('bringup', 'production', 'eol')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.fx_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  site_id uuid not null,
  product_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  -- What agents may do on this line without a person:
  -- suggest: only recommend. approve: act once someone approves. autonomous: act, then report.
  autonomy text not null default 'approve' check (autonomy in ('suggest', 'approve', 'autonomous')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, site_id) references public.fx_sites (tenant_id, id) on update cascade on delete cascade,
  foreign key (tenant_id, product_id) references public.fx_products (tenant_id, id) on update cascade on delete set null (product_id)
);

create table public.fx_stations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  line_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  -- ICT, functional, end-of-line, RF, burn-in, programming...
  kind text not null default 'fct' check (kind in ('ict', 'fct', 'eol', 'rf', 'burn_in', 'programming', 'vision')),
  status text not null default 'running' check (status in ('running', 'idle', 'alarming', 'offline')),
  executive text not null default 'teststand' check (executive in ('teststand', 'python', 'labview', 'other')),
  sequence_name text check (char_length(sequence_name) <= 120),
  sequence_version text check (char_length(sequence_version) <= 40),
  fixture_id text check (char_length(fixture_id) <= 60),
  fixture_cycles integer not null default 0 check (fixture_cycles >= 0),
  fixture_cycle_limit integer not null default 100000 check (fixture_cycle_limit > 0),
  probe_wear_pct numeric(5, 2) not null default 0 check (probe_wear_pct between 0 and 100),
  calibrated_at date,
  calibration_due date,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name),
  foreign key (tenant_id, line_id) references public.fx_lines (tenant_id, id) on update cascade on delete cascade
);

create trigger fx_stations_touch before update on public.fx_stations
  for each row execute function public.touch_updated_at();

create table public.fx_tests (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  station_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  unit text not null default '' check (char_length(unit) <= 20),
  lsl double precision,
  usl double precision,
  nominal double precision,
  -- The agreed-normal behavior drift is measured against (golden units, or the
  -- last approved baseline update).
  baseline_mean double precision,
  baseline_sd double precision check (baseline_sd >= 0),
  baseline_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, station_id, name),
  foreign key (tenant_id, station_id) references public.fx_stations (tenant_id, id) on update cascade on delete cascade,
  check (lsl is null or usl is null or lsl < usl)
);

create table public.fx_measurements (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  test_id uuid not null,
  measured_at timestamptz not null,
  value double precision not null,
  passed boolean not null,
  serial text check (char_length(serial) <= 80),
  shift text check (shift in ('A', 'B', 'C')),
  board_rev text check (char_length(board_rev) <= 20),
  lot_code text check (char_length(lot_code) <= 60),
  foreign key (tenant_id, test_id) references public.fx_tests (tenant_id, id) on update cascade on delete cascade
);

create index fx_measurements_test_idx on public.fx_measurements (tenant_id, test_id, measured_at desc);

create table public.fx_yield (
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  line_id uuid not null,
  day date not null,
  shift text not null check (shift in ('A', 'B', 'C')),
  units integer not null check (units >= 0),
  first_pass integer not null check (first_pass >= 0),
  final_pass integer not null check (final_pass >= 0),
  primary key (tenant_id, line_id, day, shift),
  foreign key (tenant_id, line_id) references public.fx_lines (tenant_id, id) on update cascade on delete cascade,
  check (first_pass <= final_pass and final_pass <= units)
);

-- Lots and failures ---------------------------------------------------------------------

create table public.fx_lots (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  part text not null check (char_length(part) <= 120),
  lot_code text not null check (char_length(lot_code) <= 60),
  supplier text not null check (char_length(supplier) <= 120),
  received_on date,
  units integer not null default 0 check (units >= 0),
  quarantined boolean not null default false,
  unique (tenant_id, id),
  unique (tenant_id, lot_code)
);

create table public.fx_failures (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  station_id uuid not null,
  test_id uuid,
  lot_id uuid,
  failed_at timestamptz not null,
  serial text check (char_length(serial) <= 80),
  mode text not null check (char_length(mode) <= 120),
  shift text check (shift in ('A', 'B', 'C')),
  board_rev text check (char_length(board_rev) <= 20),
  -- Retested and passed: a likely false failure (the test failed a good unit).
  retest_passed boolean,
  false_failure boolean not null default false,
  -- Found by a customer after shipping (a field return), not on the line.
  escaped boolean not null default false,
  scrap_cost numeric(10, 2) not null default 0 check (scrap_cost >= 0),
  rework_minutes integer not null default 0 check (rework_minutes >= 0),
  retest_minutes integer not null default 0 check (retest_minutes >= 0),
  unique (tenant_id, id),
  foreign key (tenant_id, station_id) references public.fx_stations (tenant_id, id) on update cascade on delete cascade,
  foreign key (tenant_id, test_id) references public.fx_tests (tenant_id, id) on update cascade on delete set null (test_id),
  foreign key (tenant_id, lot_id) references public.fx_lots (tenant_id, id) on update cascade on delete set null (lot_id)
);

create index fx_failures_tenant_idx on public.fx_failures (tenant_id, failed_at desc);

-- Alerts and investigations -------------------------------------------------------------

create table public.fx_investigations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  -- Human-friendly number, per organization (INV-1042).
  number integer not null check (number > 0),
  title text not null check (char_length(title) between 1 and 200),
  station_id uuid,
  product_id uuid,
  status text not null default 'open' check (status in ('open', 'testing', 'root_caused', 'closed')),
  severity text not null default 'medium' check (severity in ('critical', 'high', 'medium', 'low')),
  units_at_risk integer not null default 0 check (units_at_risk >= 0),
  failure_mode text check (char_length(failure_mode) <= 120),
  classification text check (classification in ('fixture', 'component_lot', 'environmental', 'product_defect', 'test_program', 'unknown')),
  -- The agent's current root-cause hypothesis.
  hypothesis text check (char_length(hypothesis) <= 2000),
  confidence numeric(4, 3) check (confidence between 0 and 1),
  -- [{ "label": "...", "detail": "...", "supports": true }]
  evidence jsonb not null default '[]',
  -- { "name": "...", "rationale": "...", "steps": ["..."], "minutes": 20 }
  suggested_test jsonb,
  diagnosis_model text check (char_length(diagnosis_model) <= 100),
  diagnosed_at timestamptz,
  assignee_id text check (char_length(assignee_id) <= 64),
  assignee_name text check (char_length(assignee_name) <= 120),
  opened_at timestamptz not null default now(),
  root_caused_at timestamptz,
  closed_at timestamptz,
  -- Read-only link for contract manufacturers and suppliers; null when not shared.
  share_token text unique check (char_length(share_token) between 32 and 64),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, number),
  foreign key (tenant_id, station_id) references public.fx_stations (tenant_id, id) on update cascade on delete set null (station_id),
  foreign key (tenant_id, product_id) references public.fx_products (tenant_id, id) on update cascade on delete set null (product_id)
);

create trigger fx_investigations_touch before update on public.fx_investigations
  for each row execute function public.touch_updated_at();

create table public.fx_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  station_id uuid not null,
  test_id uuid,
  kind text not null check (kind in ('drift', 'anomaly', 'false_failure', 'calibration', 'offline', 'yield')),
  classification text not null default 'unknown' check (classification in ('fixture', 'component_lot', 'environmental', 'product_defect', 'test_program', 'unknown')),
  title text not null check (char_length(title) between 1 and 200),
  detail text check (char_length(detail) <= 2000),
  baseline double precision,
  current double precision,
  unit text check (char_length(unit) <= 20),
  started_at timestamptz,
  detected_at timestamptz not null default now(),
  severity text not null default 'medium' check (severity in ('critical', 'high', 'medium', 'low')),
  units_at_risk integer not null default 0 check (units_at_risk >= 0),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'suppressed')),
  investigation_id uuid,
  resolved_at timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, station_id) references public.fx_stations (tenant_id, id) on update cascade on delete cascade,
  foreign key (tenant_id, test_id) references public.fx_tests (tenant_id, id) on update cascade on delete set null (test_id),
  foreign key (tenant_id, investigation_id) references public.fx_investigations (tenant_id, id) on update cascade on delete set null (investigation_id)
);

create index fx_alerts_open_idx on public.fx_alerts (tenant_id, status, detected_at desc);

create table public.fx_timeline (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  investigation_id uuid not null,
  at timestamptz not null,
  kind text not null check (kind in ('test_data', 'factory_log', 'board_rev', 'component_lot', 'field_return', 'agent', 'engineer', 'test_run')),
  title text not null check (char_length(title) between 1 and 200),
  detail text check (char_length(detail) <= 4000),
  data jsonb not null default '{}',
  foreign key (tenant_id, investigation_id) references public.fx_investigations (tenant_id, id) on update cascade on delete cascade
);

create index fx_timeline_investigation_idx on public.fx_timeline (tenant_id, investigation_id, at);

-- Agent actions and log -----------------------------------------------------------------

create table public.fx_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  station_id uuid not null,
  test_id uuid,
  investigation_id uuid,
  alert_id uuid,
  kind text not null check (kind in ('recalibrate', 'change_limit', 'update_sequence', 'run_test', 'quarantine_lot', 'update_baseline')),
  title text not null check (char_length(title) between 1 and 200),
  rationale text check (char_length(rationale) <= 2000),
  -- { "field": "usl", "before": 3.35, "after": 3.4 } or similar; what rollback restores.
  change jsonb not null default '{}',
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'applied', 'rolled_back')),
  proposed_at timestamptz not null default now(),
  decided_by text check (char_length(decided_by) <= 64),
  decided_by_name text check (char_length(decided_by_name) <= 120),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  rolled_back_by text check (char_length(rolled_back_by) <= 64),
  unique (tenant_id, id),
  foreign key (tenant_id, station_id) references public.fx_stations (tenant_id, id) on update cascade on delete cascade,
  foreign key (tenant_id, test_id) references public.fx_tests (tenant_id, id) on update cascade on delete set null (test_id),
  foreign key (tenant_id, investigation_id) references public.fx_investigations (tenant_id, id) on update cascade on delete set null (investigation_id),
  foreign key (tenant_id, alert_id) references public.fx_alerts (tenant_id, id) on update cascade on delete set null (alert_id)
);

create index fx_actions_status_idx on public.fx_actions (tenant_id, status, proposed_at desc);

create table public.fx_agent_log (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  at timestamptz not null default now(),
  agent text not null check (agent in ('drift', 'diagnosis', 'bringup', 'reporting', 'operator')),
  kind text not null check (kind in ('observed', 'decided', 'acted', 'asked', 'feedback')),
  message text not null check (char_length(message) between 1 and 500),
  station_id uuid,
  investigation_id uuid,
  action_id uuid,
  inputs jsonb not null default '{}',
  outcome text check (char_length(outcome) <= 500),
  foreign key (tenant_id, station_id) references public.fx_stations (tenant_id, id) on update cascade on delete set null (station_id),
  foreign key (tenant_id, investigation_id) references public.fx_investigations (tenant_id, id) on update cascade on delete set null (investigation_id),
  foreign key (tenant_id, action_id) references public.fx_actions (tenant_id, id) on update cascade on delete set null (action_id)
);

create index fx_agent_log_recent_idx on public.fx_agent_log (tenant_id, at desc);

-- Engineers' input ----------------------------------------------------------------------

create table public.fx_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  investigation_id uuid not null,
  user_id text not null check (char_length(user_id) <= 64),
  user_name text check (char_length(user_name) <= 120),
  verdict text not null check (verdict in ('right', 'partly', 'wrong')),
  note text check (char_length(note) <= 1000),
  -- The hypothesis the verdict was about, so evals can line them up later.
  hypothesis text check (char_length(hypothesis) <= 2000),
  created_at timestamptz not null default now(),
  unique (tenant_id, investigation_id, user_id),
  foreign key (tenant_id, investigation_id) references public.fx_investigations (tenant_id, id) on update cascade on delete cascade
);

create table public.fx_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  investigation_id uuid not null,
  user_id text not null check (char_length(user_id) <= 64),
  author text not null check (char_length(author) <= 120),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, investigation_id) references public.fx_investigations (tenant_id, id) on update cascade on delete cascade
);

create index fx_comments_investigation_idx on public.fx_comments (tenant_id, investigation_id, created_at);

create table public.fx_handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  line_id uuid not null,
  shift text not null check (shift in ('A', 'B', 'C')),
  user_id text not null check (char_length(user_id) <= 64),
  author text not null check (char_length(author) <= 120),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, line_id) references public.fx_lines (tenant_id, id) on update cascade on delete cascade
);

create index fx_handoffs_recent_idx on public.fx_handoffs (tenant_id, created_at desc);

-- Bring-up ------------------------------------------------------------------------------

create table public.fx_bringups (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  product_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  stage text not null default 'first_article' check (stage in ('first_article', 'evt', 'dvt', 'pvt', 'production_ready')),
  schematic_name text check (char_length(schematic_name) <= 200),
  firmware_name text check (char_length(firmware_name) <= 200),
  -- What the engineer told the agent about the design (netlist excerpt, functions, notes).
  design_notes text check (char_length(design_notes) <= 20000),
  -- [{ "name", "function", "net", "method", "lsl", "usl", "unit" }]
  plan jsonb not null default '[]',
  -- [{ "area", "total", "tested" }]
  coverage jsonb not null default '[]',
  plan_model text check (char_length(plan_model) <= 100),
  golden_units integer not null default 0 check (golden_units >= 0),
  golden_target integer not null default 5 check (golden_target > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, product_id) references public.fx_products (tenant_id, id) on update cascade on delete set null (product_id)
);

create trigger fx_bringups_touch before update on public.fx_bringups
  for each row execute function public.touch_updated_at();

-- Integrations and admin ----------------------------------------------------------------

create table public.fx_connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  kind text not null check (kind in ('teststand', 'python', 'labview', 'mes', 'plm', 'erp', 'csv', 'field_returns')),
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'connected' check (status in ('connected', 'error', 'paused')),
  last_sync_at timestamptz,
  records_synced bigint not null default 0 check (records_synced >= 0),
  last_error text check (char_length(last_error) <= 500),
  -- Ingest API key: only its SHA-256 is stored; the prefix identifies it in the UI.
  key_hash text unique check (char_length(key_hash) = 64),
  key_prefix text check (char_length(key_prefix) <= 16),
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.fx_alert_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  kind text not null check (kind in ('slack', 'teams', 'email', 'pagerduty')),
  -- Slack / Teams incoming-webhook URL, an email address, or a PagerDuty routing key.
  target text not null check (char_length(target) between 1 and 500),
  label text check (char_length(label) <= 120),
  min_severity text not null default 'high' check (min_severity in ('critical', 'high', 'medium', 'low')),
  enabled boolean not null default true,
  last_sent_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now()
);

create table public.fx_settings (
  tenant_id text primary key references public.tenants (id) on update cascade on delete cascade,
  -- ROI assumptions.
  engineer_hourly_rate numeric(8, 2) not null default 95 check (engineer_hourly_rate >= 0),
  escape_cost numeric(10, 2) not null default 1200 check (escape_cost >= 0),
  fixt_annual_price numeric(12, 2) not null default 180000 check (fixt_annual_price >= 0),
  -- Typical time to root cause before FIXT, in hours (the "1 week" in 1 week vs. 1 day).
  baseline_root_cause_hours numeric(8, 2) not null default 168 check (baseline_root_cause_hours > 0),
  -- Weekly summary email.
  weekly_summary_enabled boolean not null default false,
  weekly_summary_to text check (char_length(weekly_summary_to) <= 320),
  weekly_summary_sent_at timestamptz,
  -- Deployment and data controls (what the customer's contract says; enforced by ops).
  deployment text not null default 'cloud' check (deployment in ('cloud', 'vpc', 'on_prem')),
  data_region text not null default 'us' check (data_region in ('us', 'eu', 'apac')),
  sso_required boolean not null default false,
  demo_loaded_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger fx_settings_touch before update on public.fx_settings
  for each row execute function public.touch_updated_at();

create table public.fx_roles (
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  user_id text not null check (char_length(user_id) <= 64),
  role text not null check (role in ('test_engineer', 'quality', 'manufacturing_lead', 'cm_partner')),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- Investigation numbers -----------------------------------------------------------------

-- The next INV number for an organization, under a per-organization lock.
create function public.fx_next_investigation_number(p_tenant_id text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_next integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('inv:' || p_tenant_id, 0));
  select coalesce(max(number), 1000) + 1 into v_next from public.fx_investigations where tenant_id = p_tenant_id;
  return v_next;
end;
$$;

-- tenant_id never changes on a row (only through a cascade from tenants) -----------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'fx_sites', 'fx_products', 'fx_lines', 'fx_stations', 'fx_tests', 'fx_measurements', 'fx_yield',
    'fx_lots', 'fx_failures', 'fx_investigations', 'fx_alerts', 'fx_timeline', 'fx_actions', 'fx_agent_log',
    'fx_feedback', 'fx_comments', 'fx_handoffs', 'fx_bringups', 'fx_connectors', 'fx_alert_channels',
    'fx_settings', 'fx_roles'
  ] loop
    execute format('create trigger %I before update of tenant_id on public.%I for each row execute function public.keep_tenant()', t || '_keep_tenant', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

revoke execute on function public.fx_next_investigation_number(text) from public, anon, authenticated;
