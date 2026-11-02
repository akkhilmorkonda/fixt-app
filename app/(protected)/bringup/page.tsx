import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listBringups } from "@/lib/fixt/repo";
import { timeAgo } from "@/lib/fixt/format";
import { BRINGUP_STAGES } from "@/lib/fixt/types";
import { Meter } from "../_ui/charts";
import { Card, Empty } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";
import NewBringup from "./NewBringup";
import Stepper, { coverageOf } from "./Stepper";

export const instant = false;

/** New product bring-up: from first article to production-ready. */
export default async function BringupPage() {
  await requireUser();
  const bringups = await listBringups();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Engineering" title="Bring-up" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Products in bring-up">
          {bringups.length ? (
            <ul className="divide-y divide-zinc-100">
              {bringups.map((b) => {
                const cov = coverageOf(b.coverage);
                return (
                  <li key={b.id}>
                    <Link href={`/bringup/${b.id}`} className="flex flex-col gap-3 px-4 py-4 transition hover:bg-zinc-50">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{b.name}</span>
                        <span className="text-xs text-zinc-500">
                          {BRINGUP_STAGES.find((s) => s.key === b.stage)?.label} · updated {timeAgo(b.updated_at)}
                        </span>
                      </div>
                      <Stepper stage={b.stage} />
                      <div className="grid grid-cols-1 gap-4 text-xs text-zinc-600 sm:grid-cols-3">
                        <div className="flex flex-col gap-1.5">
                          <span>
                            Test coverage <b className="font-semibold tabular-nums text-[#1a1a1a]">{cov.total ? `${Math.round(cov.fraction * 100)}%` : "—"}</b>
                          </span>
                          <Meter value={cov.fraction} label="Test coverage" tone={cov.fraction >= 0.9 ? "good" : cov.fraction >= 0.6 ? "neutral" : "warn"} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <span>
                            Golden units <b className="font-semibold tabular-nums text-[#1a1a1a]">{b.golden_units} / {b.golden_target}</b>
                          </span>
                          <Meter value={b.golden_units / b.golden_target} label="Golden units captured" tone={b.golden_units >= b.golden_target ? "good" : "neutral"} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <span>
                            Test plan <b className="font-semibold tabular-nums text-[#1a1a1a]">{b.plan.length ? `${b.plan.length} tests` : "not generated"}</b>
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty text="No products in bring-up. Start one to get a generated test plan, limits and a coverage map." />
          )}
        </Card>
        <Card title="New bring-up">
          <div className="p-4">
            <NewBringup />
          </div>
        </Card>
      </div>
    </div>
  );
}
