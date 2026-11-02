import Link from "next/link";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { getFleet, listAlerts, listFailures } from "@/lib/fixt/repo";
import { listTests } from "@/lib/fixt/fleet-extra";
import { falseFailureStats, rankIssues } from "@/lib/fixt/metrics";
import { dateTime, measure, percent, shortDate, timeAgo } from "@/lib/fixt/format";
import { classificationOf, type Alert } from "@/lib/fixt/types";
import { Card, Empty, Pill, SeverityPill, TD, TH, Tabs } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";
import AlertButtons from "./AlertButtons";

export const instant = false;

const KIND_LABEL: Record<Alert["kind"], string> = {
  drift: "Drift",
  anomaly: "Anomaly",
  false_failure: "False failures",
  calibration: "Calibration",
  offline: "Offline",
  yield: "Yield",
};

const TABS = ["alerts", "resolved", "false_failures", "baselines"] as const;

export default async function DriftPage({ searchParams }: PageProps<"/drift">) {
  await requireUser();
  const { tab: raw } = await searchParams;
  const tab = (TABS as readonly string[]).includes(raw as string) ? (raw as (typeof TABS)[number]) : "alerts";
  const [fleet, alerts] = await Promise.all([getFleet(), listAlerts()]);
  await connection();
  const stationName = (id: string) => fleet.stations.find((s) => s.id === id)?.name ?? "Unknown station";
  const open = rankIssues(alerts.filter((a) => a.status === "open" || a.status === "acknowledged"));
  const closed = alerts.filter((a) => a.status === "resolved" || a.status === "suppressed");
  const ffAlerts = alerts.filter((a) => a.kind === "false_failure");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Monitor" title="Drift & anomalies" />
      <Tabs
        base="/drift"
        current={tab}
        tabs={[
          { key: "alerts", label: "Alerts", count: open.length },
          { key: "resolved", label: "Resolved", count: closed.length },
          { key: "false_failures", label: "False failures", count: ffAlerts.length },
          { key: "baselines", label: "Baselines" },
        ]}
      />

      {tab === "alerts" && <AlertList alerts={open} stationName={stationName} empty="No open alerts. The drift agent checks every new result against its baseline." />}
      {tab === "resolved" && <AlertList alerts={closed} stationName={stationName} empty="Nothing resolved yet." />}
      {tab === "false_failures" && <FalseFailures alerts={ffAlerts} stationName={stationName} />}
      {tab === "baselines" && <Baselines fleet={fleet} />}
    </div>
  );
}

function AlertList({ alerts, stationName, empty }: { alerts: Alert[]; stationName: (id: string) => string; empty: string }) {
  if (!alerts.length) return <Empty text={empty} />;
  return (
    <ul className="flex flex-col gap-3">
      {alerts.map((a) => {
        const cls = classificationOf(a.classification);
        return (
          <li key={a.id} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <SeverityPill severity={a.severity} />
                  <Pill>{KIND_LABEL[a.kind]}</Pill>
                  <span className="text-xs text-zinc-500" title={cls.hint}>
                    {cls.label}
                  </span>
                  {a.status === "acknowledged" && <span className="text-xs text-zinc-400">· acknowledged</span>}
                </div>
                <p className="font-medium">{a.title}</p>
                <p className="text-sm text-zinc-600">
                  <Link href={`/stations/${a.station_id}`} className="hover:underline">
                    {stationName(a.station_id)}
                  </Link>
                  {a.detail && <> · {a.detail}</>}
                </p>
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  {(a.baseline != null || a.current != null) && (
                    <div>
                      <dt className="text-zinc-500">Baseline → current</dt>
                      <dd className="tabular-nums font-medium">
                        {measure(a.baseline, a.unit ?? "")} → {measure(a.current, a.unit ?? "")}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-zinc-500">Started</dt>
                    <dd>{a.started_at ? dateTime(a.started_at) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Detected</dt>
                    <dd>{timeAgo(a.detected_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Units at risk</dt>
                    <dd className="tabular-nums">{a.units_at_risk.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Likely cause</dt>
                    <dd>{cls.hint}</dd>
                  </div>
                  {a.resolved_at && (
                    <div>
                      <dt className="text-zinc-500">Resolved</dt>
                      <dd>{shortDate(a.resolved_at)}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <AlertButtons id={a.id} status={a.status} investigationId={a.investigation_id} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

async function FalseFailures({ alerts, stationName }: { alerts: Alert[]; stationName: (id: string) => string }) {
  const failures = await listFailures(30);
  const stats = falseFailureStats(failures).filter((s) => s.retested > 0);
  return (
    <div className="flex flex-col gap-6">
      <Card title="Retest pass rate by station (30 days)">
        <p className="border-b border-zinc-100 px-4 py-2.5 text-xs text-zinc-500">A failed unit that passes on retest is usually a good unit failed by the test. High retest pass rates point at the station or sequence, not the product.</p>
        {stats.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-zinc-100">
                <tr>
                  <th className={TH}>Station</th>
                  <th className={`${TH} text-right`}>Failures</th>
                  <th className={`${TH} text-right`}>Retested</th>
                  <th className={`${TH} text-right`}>Retest pass rate</th>
                  <th className={`${TH} text-right`}>Flagged false failures</th>
                  <th className={`${TH} text-right`}>Retest hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {stats.map((s) => (
                  <tr key={s.station_id} className="hover:bg-zinc-50">
                    <td className={TD}>
                      <Link href={`/stations/${s.station_id}`} className="font-medium hover:underline">
                        {stationName(s.station_id)}
                      </Link>
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{s.failures}</td>
                    <td className={`${TD} text-right tabular-nums`}>{s.retested}</td>
                    <td className={`${TD} text-right tabular-nums ${s.retestPassRate >= 0.5 ? "font-medium text-rose-600" : "text-zinc-600"}`}>{percent(s.retestPassRate, 0)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{s.falseFailures}</td>
                    <td className={`${TD} text-right tabular-nums`}>{(s.retestMinutes / 60).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No retested failures in the last 30 days." />
        )}
      </Card>
      <div>
        <h2 className="mb-3 font-heading text-[15px] font-semibold tracking-tight">False-failure alerts</h2>
        <AlertList alerts={alerts} stationName={stationName} empty="No false-failure alerts." />
      </div>
    </div>
  );
}

async function Baselines({ fleet }: { fleet: Awaited<ReturnType<typeof getFleet>> }) {
  const tests = await listTests();
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-[#fcfcfc] px-4 py-3 text-sm leading-6 text-zinc-600">
        Each test has a baseline: the mean and spread of its golden-unit or first stable results. The drift agent compares every new result to it. Normal differences between shifts and board revisions are part of that baseline, so they don&apos;t page anyone; when a board revision really changes what normal looks like, the agent proposes a baseline update for approval instead of raising drift.
      </div>
      {fleet.lines.map((line) => {
        const stations = fleet.stations.filter((s) => s.line_id === line.id);
        const rows = tests.filter((t) => stations.some((s) => s.id === t.station_id));
        if (!rows.length) return null;
        return (
          <Card key={line.id} title={line.name}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-zinc-100">
                  <tr>
                    <th className={TH}>Station</th>
                    <th className={TH}>Test</th>
                    <th className={TH}>Baseline mean</th>
                    <th className={TH}>Baseline σ</th>
                    <th className={TH}>Limits</th>
                    <th className={TH}>Set</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map((t) => (
                    <tr key={t.id} className="hover:bg-zinc-50">
                      <td className={TD}>
                        <Link href={`/stations/${t.station_id}?test=${t.id}`} className="hover:underline">
                          {stations.find((s) => s.id === t.station_id)?.name}
                        </Link>
                      </td>
                      <td className={TD}>{t.name}</td>
                      <td className={`${TD} tabular-nums`}>{t.baseline_mean == null ? <span className="text-zinc-400">Learning…</span> : measure(t.baseline_mean, t.unit)}</td>
                      <td className={`${TD} tabular-nums text-zinc-600`}>{measure(t.baseline_sd)}</td>
                      <td className={`${TD} tabular-nums text-zinc-600`}>
                        {t.lsl ?? "—"} to {t.usl ?? "—"} {t.unit}
                      </td>
                      <td className={`${TD} text-zinc-500`}>{t.baseline_at ? shortDate(t.baseline_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
