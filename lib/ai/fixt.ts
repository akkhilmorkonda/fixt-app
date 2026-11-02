import "server-only";
import { z } from "zod";
import { getBringup, getInvestigation, getStation, saveDiagnosis, updateBringup } from "@/lib/fixt/repo";
import { measure } from "@/lib/fixt/format";
import { cpk, mean, stdev } from "@/lib/fixt/spc";
import { classificationOf, type Classification } from "@/lib/fixt/types";
import { currentTenant } from "@/lib/tenant";
import { DIAGNOSIS_SYSTEM, TEST_PLAN_SYSTEM } from "./prompts";
import { AiFailed, featureAvailable, runAi } from "./run";
import { clip, plain } from "./text";

// The diagnosis and bring-up agents. Records are built from lib/fixt/repo,
// which scopes everything to currentTenant(), so an id from the browser only
// reaches the caller's own data.

const CLASSES = ["fixture", "component_lot", "environmental", "product_defect", "test_program", "unknown"] as const;

const DiagnosisSchema = z.object({
  classification: z.enum(CLASSES),
  hypothesis: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.object({ label: z.string(), detail: z.string(), supports: z.boolean() })),
  suggested_test: z.object({ name: z.string(), rationale: z.string(), steps: z.array(z.string()), minutes: z.number() }),
});

const PlanSchema = z.object({
  plan: z.array(
    z.object({
      name: z.string(),
      function: z.string(),
      net: z.string().nullable(),
      method: z.string(),
      lsl: z.number().nullable(),
      usl: z.number().nullable(),
      unit: z.string(),
    }),
  ),
  coverage: z.array(z.object({ area: z.string(), total: z.number().int(), tested: z.number().int() })),
});

export async function aiFeatures() {
  const { tenantId } = await currentTenant();
  const [assistant, diagnosis, testPlan] = await Promise.all([
    featureAvailable(tenantId, "assistant"),
    featureAvailable(tenantId, "diagnosis"),
    featureAvailable(tenantId, "test_plan"),
  ]);
  return { assistant, diagnosis, testPlan };
}

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 16).replace("T", " ") : "unknown");

/** What the diagnosis agent sees about one investigation. */
export async function investigationRecord(id: string) {
  const detail = await getInvestigation(id);
  if (!detail) return null;
  const { investigation: inv, timeline, comments, station, product, similar } = detail;
  const lines: string[] = [
    `Investigation INV-${inv.number}: ${inv.title}`,
    `Status: ${inv.status}. Severity: ${inv.severity}. Units at risk: ${inv.units_at_risk}. Opened ${day(inv.opened_at)}.`,
    `Failure mode: ${inv.failure_mode ?? "not set"}`,
    `Product: ${product ? `${product.name} rev ${product.board_rev}` : "unknown"}`,
  ];

  if (station) {
    const s = await getStation(station.id, 200);
    if (s) {
      lines.push(
        "",
        `Station: ${s.station.name} (${s.station.kind}), line ${s.line?.name ?? "?"}, status ${s.station.status}`,
        `Sequence ${s.station.sequence_name ?? "?"} v${s.station.sequence_version ?? "?"}. Fixture ${s.station.fixture_id ?? "?"}: ${s.station.fixture_cycles} of ${s.station.fixture_cycle_limit} cycles, probe wear ${s.station.probe_wear_pct}%. Calibrated ${s.station.calibrated_at ?? "?"}, due ${s.station.calibration_due ?? "?"}.`,
        "Tests on this station (baseline, limits, last 50 vs. earlier, Cpk of last 50):",
      );
      for (const t of s.tests) {
        const v = t.samples.map((m) => m.value);
        const last = v.slice(-50);
        const earlier = v.slice(0, -50);
        const sib = s.siblings.map((x) => (x.means[t.name] != null ? `${x.station.name} ${measure(x.means[t.name], t.unit)}` : null)).filter(Boolean);
        lines.push(
          `- ${t.name}: limits ${t.lsl ?? "none"} to ${t.usl ?? "none"} ${t.unit}; baseline ${measure(t.baseline_mean, t.unit)} (σ ${measure(t.baseline_sd)}); last 50 mean ${measure(mean(last), t.unit)} σ ${measure(stdev(last))}; earlier mean ${measure(mean(earlier), t.unit)}; Cpk ${cpk(last, t.lsl, t.usl)?.toFixed(2) ?? "n/a"}; failures in last 50: ${t.samples.slice(-50).filter((m) => !m.passed).length}` +
            (sib.length ? `; sibling stations: ${sib.join(", ")}` : "") +
            `; lots seen recently: ${[...new Set(t.samples.slice(-50).map((m) => m.lot_code).filter(Boolean))].join(", ") || "none recorded"}`,
        );
      }
      const recentFails = s.failures.slice(0, 15);
      if (recentFails.length) {
        lines.push("Recent failures on this station:");
        for (const f of recentFails) lines.push(`- ${day(f.failed_at)} ${f.mode}, shift ${f.shift ?? "?"}, rev ${f.board_rev ?? "?"}, retest ${f.retest_passed == null ? "not done" : f.retest_passed ? "passed" : "failed"}${f.escaped ? ", FIELD RETURN" : ""}`);
      }
    }
  }

  lines.push("", "Timeline:");
  for (const e of timeline) lines.push(`- ${day(e.at)} [${e.kind}] ${e.title}${e.detail ? `: ${e.detail}` : ""}`);
  if (comments.length) {
    lines.push("", "Engineers' comments:");
    for (const c of comments.slice(-12)) lines.push(`- ${day(c.created_at)} ${c.author}: ${clip(c.body, 500)}`);
  }
  if (similar.length) {
    lines.push("", "Similar past investigations in this organization:");
    for (const p of similar) lines.push(`- INV-${p.number} ${p.title} (${classificationOf(p.classification).label}, ${p.status})${p.hypothesis ? `: ${clip(p.hypothesis, 300)}` : ""}`);
  }
  return { record: `<record>\n${lines.join("\n")}\n</record>`, investigation: inv };
}

/** Runs the diagnosis agent on an investigation and saves its hypothesis. */
export async function diagnose(id: string) {
  const { tenantId, userId } = await currentTenant();
  const loaded = await investigationRecord(id);
  if (!loaded) return null;

  const { value, model } = await runAi({ tenantId, userId }, "diagnosis", async ({ model, config }) =>
    model.withStructuredOutput(DiagnosisSchema, { method: "jsonSchema", name: "diagnosis" }).invoke(
      [
        { role: "system", content: DIAGNOSIS_SYSTEM },
        { role: "user", content: loaded.record },
      ],
      config,
    ),
  );
  const parsed = DiagnosisSchema.safeParse(value);
  if (!parsed.success || !parsed.data.hypothesis.trim()) throw new AiFailed("The diagnosis agent couldn't reach a hypothesis. Try again.");
  const d = parsed.data;
  await saveDiagnosis(id, {
    hypothesis: clip(plain(d.hypothesis), 1500),
    confidence: Math.round(d.confidence * 1000) / 1000,
    classification: d.classification as Classification,
    evidence: d.evidence.slice(0, 8).map((e) => ({ label: clip(plain(e.label), 80), detail: clip(plain(e.detail), 400), supports: e.supports })),
    suggested_test: {
      name: clip(plain(d.suggested_test.name), 120),
      rationale: clip(plain(d.suggested_test.rationale), 400),
      steps: d.suggested_test.steps.slice(0, 6).map((s) => clip(plain(s), 240)),
      minutes: Math.max(1, Math.min(600, Math.round(d.suggested_test.minutes))),
    },
    model,
  });
  return true;
}

/** Generates a bring-up test plan and coverage map from the design notes. */
export async function generateTestPlan(id: string) {
  const { tenantId, userId } = await currentTenant();
  const b = await getBringup(id);
  if (!b) return null;
  if (!b.design_notes?.trim()) throw new AiFailed("Add design notes (schematic summary, nets, firmware functions) first.");
  const record = [
    "<record>",
    `Product: ${b.name}`,
    `Schematic file: ${b.schematic_name ?? "not uploaded"}`,
    `Firmware file: ${b.firmware_name ?? "not uploaded"}`,
    "Design notes:",
    clip(b.design_notes, 18000),
    "</record>",
  ].join("\n");

  const { value, model } = await runAi({ tenantId, userId }, "test_plan", async ({ model, config }) =>
    model.withStructuredOutput(PlanSchema, { method: "jsonSchema", name: "test_plan" }).invoke(
      [
        { role: "system", content: TEST_PLAN_SYSTEM },
        { role: "user", content: record },
      ],
      config,
    ),
  );
  const parsed = PlanSchema.safeParse(value);
  if (!parsed.success || !parsed.data.plan.length) throw new AiFailed("The bring-up agent couldn't write a plan. Try again.");
  await updateBringup(id, {
    plan: parsed.data.plan.slice(0, 40).map((p) => ({ ...p, name: clip(plain(p.name), 120), method: clip(plain(p.method), 240), function: clip(plain(p.function), 40), net: p.net ? clip(p.net, 60) : null, unit: clip(p.unit, 20) })),
    coverage: parsed.data.coverage.slice(0, 10).map((c) => ({ area: clip(plain(c.area), 60), total: Math.max(0, c.total), tested: Math.max(0, Math.min(c.tested, c.total)) })),
    plan_model: model,
  });
  return true;
}
