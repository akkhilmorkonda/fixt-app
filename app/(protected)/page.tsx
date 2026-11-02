import Link from "next/link";
import { connection } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { requireUser } from "@/lib/auth";
import { getFleet, getSettings, getYield, hasFleet, listAgentLog, listAlerts, listActions, listFailures, listInvestigations } from "@/lib/fixt/repo";
import { computeRoi, dailyYield, rankIssues, summarizeYield, yieldTrend } from "@/lib/fixt/metrics";
import { isoDay, percent, shortDate, timeAgo } from "@/lib/fixt/format";
import { AUTONOMY, agentLabel, type Shift } from "@/lib/fixt/types";
import { LineChart, Sparkline } from "./_ui/charts";
import { Card, Empty, Pill, SeverityPill, Stat, StatStrip, StationStatus, Trend } from "./_ui/kit";
import LoadDemoButton from "./_ui/LoadDemoButton";
import PageHeader from "./_ui/PageHeader";

export const instant = false;

const SHIFTS: Shift[] = ["A", "B", "C"];

/** Day cut-offs (YYYY-MM-DD) relative to now: days ago 6 starts this week, 13 the week before. */
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000));

export default async function FleetHome() {
  await requireUser();
  const user = await currentUser();
  const title = user?.firstName ? `Welcome back, ${user.firstName}` : "Welcome back";

  if (!(await hasFleet())) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title={title} />
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-200 px-6 py-16 text-center">
          <p className="font-heading text-lg font-semibold">No test stations yet</p>
          <p className="max-w-md text-sm leading-6 text-zinc-500">
            Connect your test executives (TestStand, Python, LabVIEW) or upload CSVs and FIXT starts building baselines and watching for drift. Or load a demo fleet to see how it works.
          </p>
          <LoadDemoButton />
          <Link href="/integrations" className="text-sm font-medium text-sky-600 hover:underline">
            Connect real stations
          </Link>
        </div>
      </div>
    );
  }

  const [fleet, yieldRows, alerts, openAlerts, pending, investigations, failures, settings, activity] = await Promise.all([
    getFleet(),
    getYield(28),
    listAlerts({ limit: 500 }),
    listAlerts({ status: ["open", "acknowledged"] }),
    listActions({ status: ["proposed"] }),
    listInvestigations(),
    listFailures(30),
    getSettings(),
    listAgentLog({ limit: 12 }),
  ]);
  await connection();
  const today = isoDay(new Date());
  const trend = yieldTrend(yieldRows, 7, today);
  const days = dailyYield(yieldRows.filter((r) => r.day >= daysAgo(13)));
  const roi = computeRoi({ alerts, investigations, failures, settings, days: 7 });
  const issues = rankIssues(openAlerts).slice(0, 8);
  const stationName = (id: string | null) => fleet.stations.find((s) => s.id === id)?.name ?? "";
  const weekCut = daysAgo(6);
  const prevCut = daysAgo(13);
  const dayLabels = days.map((d) => shortDate(d.day));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={title} kicker="Fleet overview" />

      <StatStrip>
        <Stat label="First-pass yield (7d)" value={percent(trend.current.fpy)} trend={trend.delta} sub="vs. prior 7 days">
          <Sparkline values={days.map((d) => d.fpy)} tone={trend.delta < 0 ? "bad" : "good"} />
        </Stat>
        <Stat label="Final yield (7d)" value={percent(trend.current.finalYield)} trend={trend.current.finalYield - trend.previous.finalYield} sub={`${trend.current.units.toLocaleString()} units`} />
        <Stat href="/drift" label="Open issues" value={String(openAlerts.length)} sub={`${openAlerts.filter((a) => a.severity === "critical" || a.severity === "high").length} high or critical`} tone={openAlerts.length ? "warn" : undefined} />
        <Stat href="/approvals" label="Awaiting approval" value={String(pending.length)} sub="Agent changes to the line" tone={pending.length ? "accent" : undefined} />
      </StatStrip>

      <div className="-mt-4 mb-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-3">
        <Stat href="/roi" label="Catches this week" value={String(roi.catches)} sub="Drift, anomalies and false failures" tone="good" />
        <Stat href="/roi" label="Engineer-hours saved" value={Math.round(roi.engineerHoursSaved + roi.retestHoursSaved).toLocaleString()} sub={`${roi.rootCaused} root-caused this week`} tone="good" />
        <Stat href="/roi" label="Escapes prevented" value={String(roi.escapesPrevented)} sub={`${roi.unitsProtected.toLocaleString()} units protected`} tone="good" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Open issues" href="/drift">
          {issues.length ? (
            <ul className="divide-y divide-zinc-100">
              {issues.map((a) => (
                <li key={a.id}>
                  <Link href={a.investigation_id ? `/investigations/${a.investigation_id}` : "/drift"} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-zinc-50">
                    <SeverityPill severity={a.severity} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.title}</span>
                      <span className="block truncate text-xs text-zinc-500">
                        {stationName(a.station_id)}
                        {a.units_at_risk > 0 && ` · ${a.units_at_risk.toLocaleString()} units at risk`}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">{timeAgo(a.detected_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No open issues. The agents will flag drift here." />
          )}
        </Card>
        <Card title="Agent activity" href="/agents/audit">
          {activity.length ? (
            <ul className="divide-y divide-zinc-100">
              {activity.map((e) => {
                const href = e.investigation_id ? `/investigations/${e.investigation_id}` : e.action_id ? "/approvals" : e.station_id ? `/stations/${e.station_id}` : null;
                const body = (
                  <>
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${e.kind === "asked" ? "bg-amber-500" : e.kind === "acted" ? "bg-emerald-500" : e.agent === "operator" ? "bg-zinc-400" : "bg-violet-500"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-zinc-500">{agentLabel(e.agent)}</span>
                      <span className="block text-zinc-700">{e.message}</span>
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">{timeAgo(e.at)}</span>
                  </>
                );
                return (
                  <li key={e.id}>
                    {href ? (
                      <Link href={href} className="flex items-start gap-3 px-4 py-2.5 text-sm hover:bg-zinc-50">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-3 px-4 py-2.5 text-sm">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty text="What the agents notice and do shows up here." />
          )}
        </Card>
      </div>

      {fleet.sites.map((site) => {
        const lines = fleet.lines.filter((l) => l.site_id === site.id);
        if (!lines.length) return null;
        return (
          <section key={site.id} className="mb-8">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="font-heading text-lg font-semibold tracking-tight">{site.name}</h2>
              {site.location && <span className="text-sm text-zinc-500">{site.location}</span>}
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {lines.map((line) => {
                const rows = yieldRows.filter((r) => r.line_id === line.id);
                const cur = summarizeYield(rows.filter((r) => r.day >= weekCut));
                const prev = summarizeYield(rows.filter((r) => r.day >= prevCut && r.day < weekCut));
                const product = fleet.products.find((p) => p.id === line.product_id);
                const stations = fleet.stations.filter((s) => s.line_id === line.id);
                const lineDays = dailyYield(rows.filter((r) => r.day >= daysAgo(13)));
                return (
                  <Card
                    key={line.id}
                    title={
                      <span className="flex items-center gap-2">
                        {line.name}
                        {product && <span className="font-sans text-xs font-normal text-zinc-500">{product.name}</span>}
                      </span>
                    }
                    actions={<Pill>{AUTONOMY.find((a) => a.key === line.autonomy)?.label}</Pill>}
                  >
                    <div className="grid grid-cols-2 gap-px border-b border-zinc-100 bg-zinc-100 sm:grid-cols-5">
                      <div className="bg-white px-4 py-2.5">
                        <span className="block text-xs text-zinc-500">FPY (7d)</span>
                        <span className="font-heading text-lg font-semibold tabular-nums">{percent(cur.fpy)}</span>
                        <span className="block text-xs">
                          <Trend delta={cur.fpy - prev.fpy} />
                        </span>
                      </div>
                      <div className="bg-white px-4 py-2.5">
                        <span className="block text-xs text-zinc-500">Final (7d)</span>
                        <span className="font-heading text-lg font-semibold tabular-nums">{percent(cur.finalYield)}</span>
                        <span className="block text-xs">
                          <Trend delta={cur.finalYield - prev.finalYield} />
                        </span>
                      </div>
                      {SHIFTS.map((sh) => {
                        const c = summarizeYield(rows.filter((r) => r.shift === sh && r.day >= weekCut));
                        const p = summarizeYield(rows.filter((r) => r.shift === sh && r.day >= prevCut && r.day < weekCut));
                        return (
                          <div key={sh} className="bg-white px-4 py-2.5">
                            <span className="block text-xs text-zinc-500">Shift {sh} FPY</span>
                            <span className="text-sm font-medium tabular-nums">{c.units ? percent(c.fpy) : "—"}</span>
                            <span className="block text-xs">{c.units && p.units ? <Trend delta={c.fpy - p.fpy} /> : null}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
                      {stations.map((s) => {
                        const open = openAlerts.filter((a) => a.station_id === s.id).length;
                        return (
                          <Link key={s.id} href={`/stations/${s.id}`} className="flex flex-col gap-1 rounded-lg border border-zinc-200 px-3 py-2 transition hover:border-zinc-300 hover:bg-zinc-50">
                            <span className="truncate text-sm font-medium">{s.name}</span>
                            <span className="flex items-center justify-between gap-2">
                              <StationStatus status={s.status} />
                              {open > 0 && <span className="rounded-full bg-rose-50 px-1.5 text-[11px] font-semibold tabular-nums text-rose-700">{open}</span>}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                    {lineDays.length > 1 && (
                      <div className="border-t border-zinc-100 px-3 pb-2 pt-3">
                        <LineChart ariaLabel={`${line.name} daily first-pass yield`} labels={lineDays.map((d) => shortDate(d.day))} series={[{ key: line.id, label: "First-pass yield", values: lineDays.map((d) => d.fpy) }]} format="percent" height={140} />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      {days.length > 1 && (
        <Card title="First-pass yield by line (14 days)">
          <div className="p-4">
            <LineChart
              ariaLabel="Daily first-pass yield by line"
              labels={dayLabels}
              series={fleet.lines.map((l) => {
                const ld = dailyYield(yieldRows.filter((r) => r.line_id === l.id));
                return { key: l.id, label: l.name, values: days.map((d) => ld.find((x) => x.day === d.day)?.fpy ?? null) };
              })}
              format="percent"
            />
          </div>
        </Card>
      )}
    </div>
  );
}
