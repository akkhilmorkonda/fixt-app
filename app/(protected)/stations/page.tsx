import Link from "next/link";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { getFleet, listAlerts } from "@/lib/fixt/repo";
import { fixtureHealth } from "@/lib/fixt/metrics";
import { timeAgo } from "@/lib/fixt/format";
import { STATION_KINDS, STATION_STATUSES, type StationStatus as Status } from "@/lib/fixt/types";
import { Meter } from "../_ui/charts";
import { Card, Empty, StationStatus, TD, TH, Tabs } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";

export const instant = false;

export default async function StationsPage({ searchParams }: PageProps<"/stations">) {
  await requireUser();
  const { status } = await searchParams;
  const filter = STATION_STATUSES.some((s) => s.key === status) ? (status as Status) : null;
  const [fleet, alerts] = await Promise.all([getFleet(), listAlerts({ status: ["open", "acknowledged"] })]);
  await connection();
  const today = new Date();
  const shown = fleet.stations.filter((s) => !filter || s.status === filter);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Monitor" title="Stations" />
      <Tabs
        base="/stations"
        param="status"
        current={filter ?? "all"}
        tabs={[{ key: "all", label: "All", count: fleet.stations.length }, ...STATION_STATUSES.map((s) => ({ key: s.key, label: s.label, count: fleet.stations.filter((x) => x.status === s.key).length }))]}
      />
      {!shown.length && <Empty text={fleet.stations.length ? "No stations with this status." : "No stations yet. Connect a test executive in Integrations."} />}
      <div className="flex flex-col gap-6">
        {fleet.sites.flatMap((site) =>
          fleet.lines
            .filter((l) => l.site_id === site.id)
            .map((line) => {
              const stations = shown.filter((s) => s.line_id === line.id);
              if (!stations.length) return null;
              return (
                <Card key={line.id} title={`${site.name} · ${line.name}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px]">
                      <thead className="border-b border-zinc-100">
                        <tr>
                          <th className={TH}>Station</th>
                          <th className={TH}>Status</th>
                          <th className={TH}>Type</th>
                          <th className={TH}>Sequence</th>
                          <th className={TH}>Fixture cycles</th>
                          <th className={TH}>Probe wear</th>
                          <th className={TH}>Calibration</th>
                          <th className={TH}>Last seen</th>
                          <th className={`${TH} text-right`}>Alerts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {stations.map((s) => {
                          const h = fixtureHealth(s, today);
                          const open = alerts.filter((a) => a.station_id === s.id).length;
                          return (
                            <tr key={s.id} className="hover:bg-zinc-50">
                              <td className={TD}>
                                <Link href={`/stations/${s.id}`} className="font-medium hover:underline">
                                  {s.name}
                                </Link>
                              </td>
                              <td className={TD}>
                                <StationStatus status={s.status} />
                              </td>
                              <td className={`${TD} text-zinc-600`}>{STATION_KINDS[s.kind] ?? s.kind}</td>
                              <td className={`${TD} text-zinc-600`}>
                                {s.sequence_name ?? "—"}
                                {s.sequence_version && <span className="text-zinc-400"> v{s.sequence_version}</span>}
                              </td>
                              <td className={`${TD} w-40`}>
                                <div className="mb-1 text-xs tabular-nums text-zinc-600">
                                  {s.fixture_cycles.toLocaleString()} / {s.fixture_cycle_limit.toLocaleString()}
                                </div>
                                <Meter value={h.cycles} tone={h.cycles >= 0.9 ? "bad" : h.cycles >= 0.75 ? "warn" : "neutral"} label="Fixture cycles used" />
                              </td>
                              <td className={`${TD} tabular-nums ${s.probe_wear_pct >= 90 ? "text-rose-600" : s.probe_wear_pct >= 75 ? "text-amber-700" : "text-zinc-600"}`}>{Math.round(s.probe_wear_pct)}%</td>
                              <td className={`${TD} tabular-nums ${h.calDays != null && h.calDays <= 7 ? "text-rose-600" : "text-zinc-600"}`}>
                                {h.calDays == null ? "—" : h.calDays < 0 ? `${-h.calDays}d overdue` : `due in ${h.calDays}d`}
                              </td>
                              <td className={`${TD} text-zinc-500`}>{s.last_seen_at ? timeAgo(s.last_seen_at) : "never"}</td>
                              <td className={`${TD} text-right tabular-nums`}>{open ? <span className="rounded-full bg-rose-50 px-1.5 text-xs font-semibold text-rose-700">{open}</span> : <span className="text-zinc-400">0</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            }),
        )}
      </div>
    </div>
  );
}
