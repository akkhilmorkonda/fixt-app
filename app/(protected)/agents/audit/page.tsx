import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { dateTime } from "@/lib/fixt/format";
import { getFleet, listAgentLog, listInvestigations } from "@/lib/fixt/repo";
import { AGENTS, agentLabel } from "@/lib/fixt/types";
import { BUTTON_SECONDARY, Card, Empty, Tabs } from "../../_ui/kit";
import PageHeader from "../../_ui/PageHeader";

export const instant = false;

const PAGE = 50;

const KIND_TONE: Record<string, string> = {
  observed: "bg-sky-50 text-sky-700",
  decided: "bg-violet-50 text-violet-700",
  acted: "bg-emerald-50 text-emerald-700",
  asked: "bg-amber-50 text-amber-800",
  feedback: "bg-zinc-100 text-zinc-600",
};

/** Every agent observation, decision and action, and every person's decision on them. */
export default async function AuditLogPage({ searchParams }: PageProps<"/agents/audit">) {
  await requireUser();
  const params = await searchParams;
  const agent = AGENTS.some((a) => a.key === params.agent) ? (params.agent as string) : undefined;
  const before = typeof params.before === "string" && /^\d{1,18}$/.test(params.before) ? Number(params.before) : undefined;
  const [entries, fleet, investigations] = await Promise.all([listAgentLog({ limit: PAGE, agent, before }), getFleet(), listInvestigations({ limit: 500 })]);
  const station = (id: string | null) => fleet.stations.find((s) => s.id === id);
  const inv = (id: string | null) => investigations.find((i) => i.id === id);
  const olderHref = entries.length === PAGE ? `/agents/audit?${new URLSearchParams({ ...(agent ? { agent } : {}), before: String(entries[entries.length - 1].id) })}` : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Agents" title="Audit log" />
      <Tabs base="/agents/audit" param="agent" current={agent ?? "all"} tabs={[{ key: "all", label: "All" }, ...AGENTS.map((a) => ({ key: a.key, label: a.label }))]} />

      <Card title={agent ? agentLabel(agent) : "Everything"}>
        {entries.length ? (
          <ul className="divide-y divide-zinc-100">
            {entries.map((e) => {
              const s = station(e.station_id);
              const i = inv(e.investigation_id);
              const hasInputs = e.inputs && Object.keys(e.inputs).length > 0;
              return (
                <li key={e.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
                  <time dateTime={e.at} className="w-32 shrink-0 text-xs tabular-nums text-zinc-500">
                    {dateTime(e.at)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-zinc-700">{agentLabel(e.agent)}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_TONE[e.kind] ?? KIND_TONE.feedback}`}>{e.kind}</span>
                      {e.outcome && <span className="text-[11px] text-zinc-500">→ {e.outcome.replace(/_/g, " ")}</span>}
                    </div>
                    <p className="mt-0.5 text-sm">{e.message}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                      {s && (
                        <Link href={`/stations/${s.id}`} className="text-sky-700 hover:underline">
                          {s.name}
                        </Link>
                      )}
                      {i && (
                        <Link href={`/investigations/${i.id}`} className="text-sky-700 hover:underline">
                          INV-{i.number}
                        </Link>
                      )}
                      {e.action_id && (
                        <Link href="/approvals?tab=applied" className="text-sky-700 hover:underline">
                          Action
                        </Link>
                      )}
                    </div>
                    {hasInputs && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-[#1a1a1a]">Inputs</summary>
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-zinc-50 p-2.5 text-[11px] leading-5 text-zinc-700">{JSON.stringify(e.inputs, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty text={before ? "No older entries." : "Nothing logged yet."} />
        )}
      </Card>

      <div className="mt-4 flex justify-end gap-2">
        {before && (
          <Link href={agent ? `/agents/audit?agent=${agent}` : "/agents/audit"} className={BUTTON_SECONDARY}>
            Newest
          </Link>
        )}
        {olderHref && (
          <Link href={olderHref} className={BUTTON_SECONDARY}>
            Older
          </Link>
        )}
      </div>
    </div>
  );
}
