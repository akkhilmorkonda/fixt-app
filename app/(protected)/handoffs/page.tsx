import { requireUser } from "@/lib/auth";
import { getFleet, listAlerts, listHandoffs } from "@/lib/fixt/repo";
import { dateTime, timeAgo } from "@/lib/fixt/format";
import { Card, Empty, SeverityPill } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";
import HandoffForm from "./HandoffForm";

export const instant = false;

/** Notes from one shift to the next, per line. */
export default async function HandoffsPage() {
  await requireUser();
  const [fleet, handoffs, alerts] = await Promise.all([getFleet(), listHandoffs(100), listAlerts({ status: ["open", "acknowledged"] })]);
  const lineOf = new Map(fleet.stations.map((s) => [s.id, s.line_id]));
  const stationName = new Map(fleet.stations.map((s) => [s.id, s.name]));
  const lines = fleet.lines.map((l) => ({
    ...l,
    site: fleet.sites.find((s) => s.id === l.site_id)?.name ?? "",
    notes: handoffs.filter((h) => h.line_id === l.id),
    alerts: alerts.filter((a) => lineOf.get(a.station_id) === l.id),
  }));
  const ordered = [...lines].sort((a, b) => (b.notes[0]?.created_at ?? "").localeCompare(a.notes[0]?.created_at ?? ""));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Engineering" title="Shift handoffs" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {ordered.length === 0 && <Empty text="No lines yet. Connect stations or load demo data from the Fleet page." />}
          {ordered.map((l) => (
            <Card key={l.id} title={<>{l.name} <span className="font-sans text-xs font-normal text-zinc-500">{l.site}</span></>}>
              {l.notes.length ? (
                <ul className="divide-y divide-zinc-100">
                  {l.notes.map((h) => (
                    <li key={h.id} className="px-4 py-3">
                      <div className="mb-1 flex flex-wrap items-baseline gap-2 text-xs text-zinc-500">
                        <span className="font-medium text-[#1a1a1a]">{h.author}</span>
                        <span>Shift {h.shift}</span>
                        <span title={dateTime(h.created_at)}>{timeAgo(h.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-700">{h.body}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty text="No handoff notes for this line yet." />
              )}
            </Card>
          ))}
        </div>
        <aside className="flex flex-col gap-6">
          <Card title="Write a handoff">
            <div className="p-4">
              <HandoffForm lines={lines.map((l) => ({ id: l.id, name: l.name }))} />
            </div>
          </Card>
          <Card title="Open issues by line">
            {lines.some((l) => l.alerts.length) ? (
              <ul className="divide-y divide-zinc-100">
                {lines
                  .filter((l) => l.alerts.length)
                  .map((l) => (
                    <li key={l.id} className="px-4 py-3">
                      <p className="mb-1.5 text-xs font-medium text-zinc-500">{l.name}</p>
                      <ul className="flex flex-col gap-1.5">
                        {l.alerts.slice(0, 5).map((a) => (
                          <li key={a.id} className="flex items-start gap-2 text-sm">
                            <SeverityPill severity={a.severity} />
                            <a href={`/stations/${a.station_id}`} className="min-w-0 text-zinc-700 hover:underline">
                              {a.title}
                              <span className="block text-xs text-zinc-400">{stationName.get(a.station_id)}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            ) : (
              <Empty text="No open issues on any line." />
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
