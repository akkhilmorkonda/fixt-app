import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { aiFeatures } from "@/lib/ai/fixt";
import { modelInfo } from "@/lib/ai/models";
import { getBringup } from "@/lib/fixt/repo";
import { shortDate } from "@/lib/fixt/format";
import { BRINGUP_STAGES } from "@/lib/fixt/types";
import { isUuid } from "@/lib/fixt/validate";
import { Meter } from "../../_ui/charts";
import { Card, Empty, Pill, TD, TH } from "../../_ui/kit";
import PageHeader from "../../_ui/PageHeader";
import Stepper, { coverageOf } from "../Stepper";
import { DesignNotes, GeneratePlan, GoldenUnits, NextStage } from "./BringupControls";

export const instant = false;

const limit = (lsl: number | null, usl: number | null, unit: string) => {
  if (lsl == null && usl == null) return unit === "pass/fail" ? "Pass / fail" : "—";
  if (lsl != null && usl != null) return `${lsl} to ${usl} ${unit}`;
  return lsl != null ? `≥ ${lsl} ${unit}` : `≤ ${usl} ${unit}`;
};

export default async function BringupDetail({ params }: PageProps<"/bringup/[id]">) {
  await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [b, features] = await Promise.all([getBringup(id), aiFeatures()]);
  if (!b) notFound();

  const at = BRINGUP_STAGES.findIndex((s) => s.key === b.stage);
  const next = BRINGUP_STAGES[at + 1] ?? null;
  const cov = coverageOf(b.coverage);
  const gaps = b.coverage.filter((a) => a.tested < a.total);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-2 text-sm text-zinc-500">
        <Link href="/bringup" className="hover:underline">
          Bring-up
        </Link>{" "}
        / {b.name}
      </div>
      <PageHeader title={b.name} kicker={BRINGUP_STAGES[at]?.label} actions={next ? <NextStage id={b.id} next={next.key} label={next.label} /> : <Pill tone="bg-emerald-50 text-emerald-700 ring-emerald-200">Production-ready</Pill>} />

      <div className="mb-6 rounded-xl border border-zinc-200 px-4 py-4">
        <Stepper stage={b.stage} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card
            title="Test plan"
            actions={
              b.plan_model && (
                <span className="text-xs text-zinc-500">
                  Written by {modelInfo(b.plan_model)?.label ?? b.plan_model} · {shortDate(b.updated_at)}
                </span>
              )
            }
          >
            {b.plan.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="border-b border-zinc-100">
                    <tr>
                      <th className={TH}>Test</th>
                      <th className={TH}>Function</th>
                      <th className={TH}>Net</th>
                      <th className={TH}>Method</th>
                      <th className={TH}>Limits</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {b.plan.map((p, i) => (
                      <tr key={`${p.name}-${i}`}>
                        <td className={`${TD} font-medium`}>{p.name}</td>
                        <td className={`${TD} text-zinc-600`}>{p.function}</td>
                        <td className={`${TD} font-mono text-xs text-zinc-600`}>{p.net ?? "—"}</td>
                        <td className={`${TD} text-zinc-600`}>{p.method}</td>
                        <td className={`${TD} whitespace-nowrap tabular-nums`}>{limit(p.lsl, p.usl, p.unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty text="No test plan yet. Add design notes, then generate one: the bring-up agent writes the tests, their order, methods and starting limits." />
            )}
            <div className="border-t border-zinc-100 px-4 py-3">
              <GeneratePlan id={b.id} available={features.testPlan} hasNotes={!!b.design_notes?.trim()} regenerate={b.plan.length > 0} />
            </div>
          </Card>

          <Card title="Design notes">
            <div className="flex flex-col gap-2 p-4">
              <p className="text-xs text-zinc-500">
                {b.schematic_name ? `Schematic: ${b.schematic_name}` : "No schematic attached"} · {b.firmware_name ? `Firmware: ${b.firmware_name}` : "No firmware attached"}
              </p>
              <DesignNotes id={b.id} initial={b.design_notes ?? ""} />
            </div>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card title="Coverage map">
            <div className="flex flex-col gap-4 p-4">
              <div>
                <span className="font-heading text-3xl font-semibold tabular-nums">{cov.total ? `${Math.round(cov.fraction * 100)}%` : "—"}</span>
                <span className="ml-2 text-sm text-zinc-500">{cov.total ? `${cov.tested} of ${cov.total} functions and nets tested` : "Generate a test plan to map coverage"}</span>
              </div>
              {b.coverage.map((a) => (
                <div key={a.area} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-zinc-700">{a.area}</span>
                    <span className="tabular-nums text-zinc-600">
                      {a.tested}/{a.total}
                    </span>
                  </div>
                  <Meter value={a.total ? a.tested / a.total : 0} label={`${a.area} coverage`} tone={a.tested >= a.total ? "good" : a.tested / (a.total || 1) < 0.5 ? "bad" : "warn"} />
                </div>
              ))}
              {gaps.length > 0 && (
                <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
                  <p className="mb-1 font-medium">Not tested yet</p>
                  <ul className="flex flex-col gap-0.5">
                    {gaps.map((a) => (
                      <li key={a.area}>
                        {a.total - a.tested} of {a.total} {a.area.toLowerCase()} {a.total - a.tested === 1 ? "item" : "items"} not tested
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          <Card title="Golden-unit baseline">
            <div className="flex flex-col gap-3 p-4">
              <GoldenUnits id={b.id} units={b.golden_units} target={b.golden_target} />
              <p className="text-xs leading-5 text-zinc-500">
                Run known-good units through every station and capture them here. Their results become each test&apos;s baseline, which is what the drift agent measures against once the product reaches production.
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
