import { BRINGUP_STAGES, type BringupStage } from "@/lib/fixt/types";

/** First article → production-ready, with the current stage highlighted. */
export default function Stepper({ stage, compact = false }: { stage: BringupStage; compact?: boolean }) {
  const at = BRINGUP_STAGES.findIndex((s) => s.key === stage);
  return (
    <ol className="flex w-full items-center gap-1" aria-label={`Stage: ${BRINGUP_STAGES[at]?.label}`}>
      {BRINGUP_STAGES.map((s, i) => {
        const done = i < at;
        const current = i === at;
        return (
          <li key={s.key} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={current ? "step" : undefined}>
            <span className={`h-1.5 rounded-full ${done ? "bg-emerald-500" : current ? "bg-sky-600" : "bg-zinc-200"}`} />
            {!compact && <span className={`truncate text-[11px] ${current ? "font-medium text-sky-700" : done ? "text-zinc-600" : "text-zinc-400"}`}>{s.label}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function coverageOf(areas: { total: number; tested: number }[]) {
  const total = areas.reduce((s, a) => s + a.total, 0);
  const tested = areas.reduce((s, a) => s + Math.min(a.tested, a.total), 0);
  return { total, tested, fraction: total ? tested / total : 0 };
}
