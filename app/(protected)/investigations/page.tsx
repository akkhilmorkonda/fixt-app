import Link from "next/link";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { duration, invNumber, timeAgo } from "@/lib/fixt/format";
import { median, timeToRootCause } from "@/lib/fixt/metrics";
import { getFleet, getSettings, listInvestigations } from "@/lib/fixt/repo";
import { classificationOf, type Investigation } from "@/lib/fixt/types";
import { Card, Empty, InvestigationStatusPill, SeverityPill, Stat, StatStrip, TD, TH, Tabs } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";

export const instant = false;

/** Request time, read once after connection(). */
const clock = () => Date.now();

const VIEWS: { key: string; label: string; statuses: Investigation["status"][] }[] = [
  { key: "active", label: "Active", statuses: ["open", "testing"] },
  { key: "root_caused", label: "Root caused", statuses: ["root_caused"] },
  { key: "closed", label: "Closed", statuses: ["closed"] },
  { key: "all", label: "All", statuses: [] },
];

/** Every failure investigation, by status, with time to root cause made visible. */
export default async function InvestigationsPage({ searchParams }: PageProps<"/investigations">) {
  await requireUser();
  const params = await searchParams;
  const tab = VIEWS.find((v) => v.key === params.tab) ?? VIEWS[0];
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const [all, fleet, settings] = await Promise.all([listInvestigations({ limit: 500 }), getFleet(), getSettings()]);

  await connection();
  const now = clock();
  const recent = all.filter((i) => i.root_caused_at && now - Date.parse(i.root_caused_at) <= 30 * 86_400_000);
  const medianHours = median(recent.map((i) => timeToRootCause(i)!).filter((h) => h != null));
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const causedThisMonth = all.filter((i) => i.root_caused_at && Date.parse(i.root_caused_at) >= monthStart.getTime()).length;
  const open = all.filter((i) => i.status === "open" || i.status === "testing");

  const q2 = q.replace(/^inv-?/, "");
  const rows = all
    .filter((i) => !tab.statuses.length || tab.statuses.includes(i.status))
    .filter((i) => !q || i.title.toLowerCase().includes(q) || String(i.number) === q2 || (i.failure_mode ?? "").toLowerCase().includes(q));
  const stationName = (id: string | null) => fleet.stations.find((s) => s.id === id)?.name ?? "—";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Investigations" />

      <StatStrip cols={3}>
        <Stat label="Open investigations" value={String(open.length)} sub={`${open.reduce((n, i) => n + i.units_at_risk, 0).toLocaleString()} units at risk`} tone={open.length ? "accent" : undefined} />
        <Stat
          label="Median time to root cause"
          value={duration(medianHours)}
          sub={`Last 30 days, vs. ${duration(settings.baseline_root_cause_hours)} before FIXT`}
          tone={medianHours != null && medianHours < settings.baseline_root_cause_hours ? "good" : undefined}
        />
        <Stat label="Root caused this month" value={String(causedThisMonth)} sub={`${all.length} investigations in total`} />
      </StatStrip>

      <Tabs
        base="/investigations"
        current={tab.key}
        tabs={VIEWS.map((v) => ({ key: v.key, label: v.label, count: v.statuses.length ? all.filter((i) => v.statuses.includes(i.status)).length : all.length }))}
      />

      {q && (
        <p className="mb-3 text-sm text-zinc-500">
          {rows.length} matching &ldquo;{q}&rdquo;.{" "}
          <Link href={tab.key === "active" ? "/investigations" : `/investigations?tab=${tab.key}`} className="text-sky-600 hover:underline">
            Clear search
          </Link>
        </p>
      )}

      <Card title={tab.label}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead className="border-b border-zinc-100">
                <tr>
                  <th className={TH}>Investigation</th>
                  <th className={TH}>Station</th>
                  <th className={TH}>Classification</th>
                  <th className={TH}>Severity</th>
                  <th className={TH}>Status</th>
                  <th className={`${TH} text-right`}>Confidence</th>
                  <th className={`${TH} text-right`}>Units at risk</th>
                  <th className={TH}>Opened</th>
                  <th className={`${TH} text-right`}>To root cause</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((i) => (
                  <tr key={i.id} className="hover:bg-zinc-50">
                    <td className={`${TD} max-w-[320px]`}>
                      <Link href={`/investigations/${i.id}`} className="block truncate font-medium hover:underline">
                        <span className="mr-2 tabular-nums text-zinc-500">{invNumber(i.number)}</span>
                        {i.title}
                      </Link>
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {i.station_id ? (
                        <Link href={`/stations/${i.station_id}`} className="text-zinc-700 hover:underline">
                          {stationName(i.station_id)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-zinc-600`}>{classificationOf(i.classification).label}</td>
                    <td className={TD}>
                      <SeverityPill severity={i.severity} />
                    </td>
                    <td className={TD}>
                      <InvestigationStatusPill status={i.status} />
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{i.confidence != null ? `${Math.round(i.confidence * 100)}%` : "—"}</td>
                    <td className={`${TD} text-right tabular-nums`}>{i.units_at_risk.toLocaleString()}</td>
                    <td className={`${TD} whitespace-nowrap text-zinc-500`}>{timeAgo(i.opened_at, now)}</td>
                    <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>{duration(timeToRootCause(i))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text={q ? "No investigations match that search." : "Nothing here. The diagnosis agent opens an investigation when it catches a failure."} />
        )}
      </Card>
    </div>
  );
}
