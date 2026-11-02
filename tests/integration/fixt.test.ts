import { afterAll, describe, expect, it, vi } from "vitest";
import { db, dropTenant, testTenant } from "../support/db";

// The FIXT data layer against the local Supabase: the demo seed, approvals and
// rollback, tenant isolation, and the ingest path that runs the drift agent.

const state = vi.hoisted(() => ({ tenantId: "" }));
vi.mock("@/lib/tenant", () => ({
  currentTenant: async () => ({ userId: "user_test", tenantId: state.tenantId, orgRole: "org:admin", actingAsAdmin: null }),
}));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: async () => ({ fullName: "Test Engineer" }) }));
vi.mock("next/server", () => ({ after: () => undefined, connection: async () => undefined }));

const { loadDemoData, clearFleetData } = await import("@/lib/fixt/seed");
const repo = await import("@/lib/fixt/repo");
const { connectorForKey, ingest } = await import("@/lib/fixt/ingest");

const A = testTenant("fixt_a");
const B = testTenant("fixt_b");
afterAll(async () => {
  await dropTenant(A);
  await dropTenant(B);
});

describe("demo data", () => {
  it("loads once into the signed-in organization only", async () => {
    state.tenantId = A;
    expect(await loadDemoData()).toBe(true);
    expect(await loadDemoData()).toBe(false);
    const fleet = await repo.getFleet();
    expect(fleet.stations.length).toBeGreaterThan(15);
    expect((await repo.listInvestigations()).length).toBeGreaterThan(5);
    state.tenantId = B;
    expect((await repo.getFleet()).stations).toHaveLength(0);
    expect(await repo.countPendingApprovals()).toBe(0);
  }, 60_000);

  it("has a drifting station whose test reads high against its siblings", async () => {
    state.tenantId = A;
    const fleet = await repo.getFleet();
    const fct3 = fleet.stations.find((s) => s.name === "FRE1 FCT-3")!;
    const d = (await repo.getStation(fct3.id))!;
    const led = d.tests.find((t) => t.name === "HR LED drive current")!;
    const recent = led.samples.slice(-20).reduce((s, m) => s + m.value, 0) / 20;
    expect(recent).toBeGreaterThan(led.baseline_mean! + 3 * led.baseline_sd!);
    const sibling = d.siblings.find((s) => s.station.name === "FRE1 FCT-1")!;
    expect(sibling.means["HR LED drive current"]).toBeLessThan(20.5);
  });
});

describe("approvals", () => {
  it("applies an approved sequence change and rolls it back", async () => {
    state.tenantId = A;
    const action = (await repo.listActions({ status: ["proposed"] })).find((a) => a.kind === "update_sequence")!;
    expect(await repo.decideAction(action.id, true, "ok")).toBe(true);
    const station = async () => (await db().from("fx_stations").select("sequence_version").eq("id", action.station_id).single()).data!.sequence_version;
    expect(await station()).toBe("2.4.2");
    await expect(repo.decideAction(action.id, true, null)).rejects.toThrow(/already decided/);
    expect(await repo.rollbackAction(action.id)).toBe(true);
    expect(await station()).toBe("2.4.1");
    const log = await repo.listAgentLog({ limit: 5 });
    expect(log[0].message).toMatch(/rolled back/);
  });

  it("can't act on another organization's rows", async () => {
    state.tenantId = A;
    const [action] = await repo.listActions({ status: ["proposed"] });
    const [inv] = await repo.listInvestigations();
    state.tenantId = B;
    expect(await repo.decideAction(action.id, true, null)).toBe(false);
    expect(await repo.getInvestigation(inv.id)).toBeNull();
    expect(await repo.addComment(inv.id, "hi")).toBe(false);
    await expect(repo.setSharing(inv.id, true)).rejects.toThrow();
  });

  it("shares an investigation by token and stops", async () => {
    state.tenantId = A;
    const [inv] = await repo.listInvestigations({ status: ["testing"] });
    const token = (await repo.setSharing(inv.id, true))!;
    expect((await repo.getSharedInvestigation(token))?.investigation.id).toBe(inv.id);
    await repo.setSharing(inv.id, false);
    expect(await repo.getSharedInvestigation(token)).toBeNull();
  });
});

describe("ingest", () => {
  it("authenticates by connector key, creates stations, builds a baseline and catches drift", async () => {
    state.tenantId = B;
    const { key } = await repo.createConnector("python", "Bench");
    const conn = (await connectorForKey(key))!;
    expect(conn.tenant_id).toBe(B);
    expect(await connectorForKey("fxk_wrongwrongwrongwrongwrong")).toBeNull();

    const t0 = Date.now() - 3 * 3_600_000;
    const row = (i: number, v: number) => ({ station: "Bench FCT", test: "Rail", value: v, unit: "V", lsl: 3.2, usl: 3.4, measured_at: new Date(t0 + i * 60_000).toISOString() });
    const wobble = (i: number) => ((i * 7919) % 11) / 11 - 0.5;
    const first = await ingest(B, conn.id, Array.from({ length: 40 }, (_, i) => row(i, 3.3 + 0.02 * wobble(i))));
    expect(first).toMatchObject({ stored: 40, stationsCreated: 1, testsCreated: 1, alerts: 0 });
    const test = (await db().from("fx_tests").select("baseline_mean, baseline_sd").eq("tenant_id", B).eq("name", "Rail").single()).data!;
    expect(test.baseline_mean).toBeCloseTo(3.3, 2);

    const second = await ingest(B, conn.id, Array.from({ length: 30 }, (_, i) => row(40 + i, 3.36 + 0.02 * wobble(i))));
    expect(second.alerts).toBe(1);
    const alerts = await repo.listAlerts({ status: ["open"] });
    expect(alerts[0].title).toMatch(/Rail drifting high on Bench FCT/);
    // Unassigned lines are suggest-only, so nothing is proposed.
    expect(await repo.countPendingApprovals()).toBe(0);
  });

  it("clears fleet data", async () => {
    state.tenantId = A;
    await clearFleetData();
    expect(await repo.hasFleet()).toBe(false);
  });
});
