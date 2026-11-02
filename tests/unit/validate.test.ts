import { describe, expect, it } from "vitest";
import { csvToResults, parseChannel, parseConnectorConfig, parseIngest, parseSettings } from "@/lib/fixt/validate";

describe("ingest validation", () => {
  it("accepts an array or {results}, and reports bad rows by index", () => {
    const r = parseIngest({
      results: [
        { station: "FRE1 FCT-3", test: "HR LED", value: 20.1, lsl: 18, usl: "22" },
        { station: "", test: "x", value: 1 },
        { station: "S", test: "x", value: "abc" },
        { station: "S", test: "x", value: 1, measured_at: "yesterday" },
        { station: "S", test: "x", value: 1, shift: "D" },
      ],
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ station: "FRE1 FCT-3", value: 20.1, lsl: 18, usl: 22 });
    expect(r.errors.map((e) => e.index)).toEqual([1, 2, 3, 4]);
  });
  it("refuses a body that isn't a list", () => {
    expect(parseIngest({ station: "x" })).toHaveProperty("error");
  });
  it("rejects results from the future", () => {
    const r = parseIngest([{ station: "S", test: "t", value: 1, measured_at: new Date(Date.now() + 3_600_000).toISOString() }]);
    expect("error" in r ? r : r.errors[0].error).toMatch(/future/);
  });
  it("parses CSV with quotes and blank cells", () => {
    const rows = csvToResults('station,test,value,serial\n"FRE1 FCT-3","HR LED, ch1",20.4,\nS2,t,1.5,"A""1"\n');
    expect(rows).toEqual([
      { station: "FRE1 FCT-3", test: "HR LED, ch1", value: "20.4" },
      { station: "S2", test: "t", value: "1.5", serial: 'A"1' },
    ]);
  });
});

describe("channel validation", () => {
  it("checks the target format for each kind", () => {
    expect(parseChannel({ kind: "slack", target: "https://hooks.slack.com/services/T/B/x", min_severity: "high" })).toHaveProperty("fields");
    expect(parseChannel({ kind: "slack", target: "https://evil.example.com/x", min_severity: "high" })).toHaveProperty("errors.target");
    expect(parseChannel({ kind: "email", target: "not-an-email", min_severity: "low" })).toHaveProperty("errors.target");
    expect(parseChannel({ kind: "pagerduty", target: "a".repeat(32), min_severity: "critical" })).toHaveProperty("fields");
    expect(parseChannel({ kind: "fax", target: "x", min_severity: "low" })).toHaveProperty("errors.kind");
  });
});

describe("settings validation", () => {
  const base = { engineer_hourly_rate: "95", escape_cost: "1200", fixt_annual_price: "180000", baseline_root_cause_hours: "168" };
  it("parses numbers and checkboxes", () => {
    const r = parseSettings({ ...base, weekly_summary_enabled: "on", weekly_summary_to: "a@x.com, b@y.com", deployment: "vpc" });
    expect(r).toMatchObject({ fields: { engineer_hourly_rate: 95, weekly_summary_enabled: true, deployment: "vpc", weekly_summary_to: "a@x.com, b@y.com" } });
  });
  it("needs recipients when the summary is on, and a positive baseline", () => {
    expect(parseSettings({ ...base, weekly_summary_enabled: "on" })).toHaveProperty("errors.weekly_summary_to");
    expect(parseSettings({ ...base, baseline_root_cause_hours: "0" })).toHaveProperty("errors.baseline_root_cause_hours");
  });
});

describe("connector config", () => {
  it("keeps only a preview connector's declared fields, all required", () => {
    expect(parseConnectorConfig("jira", { site: " acme.atlassian.net ", project: "FA", token: "secret" })).toEqual({ fields: { site: "acme.atlassian.net", project: "FA" } });
    expect(parseConnectorConfig("jira", { site: "acme.atlassian.net" })).toHaveProperty("errors.project", "Required");
    expect(parseConnectorConfig("snowflake", { account: "a".repeat(201), warehouse: "W", database: "D" })).toHaveProperty("errors.account", "Too long");
  });

  it("takes no settings for ingest-key connectors", () => {
    expect(parseConnectorConfig("teststand", { anything: "x" })).toEqual({ fields: {} });
  });
});
