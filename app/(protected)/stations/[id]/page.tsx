import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { getStation } from "@/lib/fixt/repo";
import { fixtureHealth } from "@/lib/fixt/metrics";
import { dateTime, measure, shortDate, timeAgo } from "@/lib/fixt/format";
import { controlLimits, cpk, histogram, mean, stdev } from "@/lib/fixt/spc";
import { STATION_KINDS, actionKindLabel, classificationOf } from "@/lib/fixt/types";
import { isUuid } from "@/lib/fixt/validate";
import { ControlChart, Histogram, Meter } from "../../_ui/charts";
import { ActionStatusPill, Card, Empty, SeverityPill, StationStatus, TD, TH } from "../../_ui/kit";
import PageHeader from "../../_ui/PageHeader";

export const instant = false;

const RECENT = 50;

function cpkTone(v: number | null) {
  if (v == null) return "text-zinc-400";
  if (v < 1) return "text-rose-600 font-medium";
  if (v < 1.33) return "text-amber-700";
  return "text-emerald-700";
}

export default async function StationPage({ params, searchParams }: PageProps<"/stations/[id]">) {
  await requireUser();
  const { id } = await params;
  const { test } = await searchParams;
  if (!isUuid(id)) notFound();
  const d = await getStation(id);
  if (!d) notFound();
  await connection();
  const { station: s } = d;
  const h = fixtureHealth(s, new Date());

  const openAlertTest = d.alerts.find((a) => (a.status === "open" || a.status === "acknowledged") && a.test_id)?.test_id;
  const current = d.tests.find((t) => t.id === test) ?? d.tests.find((t) => t.id === openAlertTest) ?? d.tests[0];

  const values = current?.samples.map((m) => m.value) ?? [];
  const recent = values.slice(-RECENT);
  const limits = current?.baseline_mean != null && current.baseline_sd != null ? controlLimits(current.baseline_mean, current.baseline_sd) : null;
  const sibs = current ? d.siblings.filter((x) => x.means[current.name] != null) : [];
  const recentMean = recent.length ? mean(recent) : null;
  const sibMean = sibs.length ? mean(sibs.map((x) => x.means[current!.name])) : null;
  const diff = recentMean != null && sibMean ? (recentMean - sibMean) / Math.abs(sibMean) : null;
  const log = d.tests
    .flatMap((t) => t.samples.slice(-RECENT).map((m) => ({ ...m, test: t.name, unit: t.unit })))
    .sort((a, b) => b.measured_at.localeCompare(a.measured_at))
    .slice(0, RECENT);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker={`${d.line?.name ?? "Station"} · ${STATION_KINDS[s.kind] ?? s.kind}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {s.name}
            <StationStatus status={s.status} className="text-sm" />
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-600">
            <span>
              Executive: <b className="font-medium text-[#1a1a1a]">{s.executive}</b>
            </span>
            <span>
              Sequence: <b className="font-medium text-[#1a1a1a]">{s.sequence_name ?? "—"}</b>
              {s.sequence_version && ` v${s.sequence_version}`}
            </span>
            <span>
              Fixture: <b className="font-medium text-[#1a1a1a]">{s.fixture_id ?? "—"}</b>
            </span>
            <span>Last seen {s.last_seen_at ? timeAgo(s.last_seen_at) : "never"}</span>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card
          title="Measurements"
          actions={
            d.tests.length > 1 ? (
              <div className="flex flex-wrap gap-1">
                {d.tests.map((t) => (
                  <Link
                    key={t.id}
                    href={`/stations/${s.id}?test=${t.id}`}
                    scroll={false}
                    className={`rounded-md px-2 py-0.5 text-xs ${t.id === current?.id ? "bg-[#1a1a1a] text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
                  >
                    {t.name}
                  </Link>
                ))}
              </div>
            ) : null
          }
        >
          {current ? (
            <div className="flex flex-col gap-6 p-4">
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                {[
                  ["n", String(values.length)],
                  ["Mean (last 50)", measure(recentMean, current.unit)],
                  ["σ (last 50)", measure(recent.length > 1 ? stdev(recent) : null)],
                  ["Cpk (last 50)", cpk(recent, current.lsl, current.usl)?.toFixed(2) ?? "—"],
                  ["Baseline", measure(current.baseline_mean, current.unit)],
                  ["Fails (last 50)", String(current.samples.slice(-RECENT).filter((m) => !m.passed).length)],
                ].map(([label, v]) => (
                  <div key={label}>
                    <span className="block text-xs text-zinc-500">{label}</span>
                    <span className={`text-sm font-medium tabular-nums ${label.startsWith("Cpk") ? cpkTone(cpk(recent, current.lsl, current.usl)) : ""}`}>{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500">Control chart</h3>
                <ControlChart
                  ariaLabel={`${current.name} control chart on ${s.name}`}
                  points={current.samples.map((m) => ({ at: m.measured_at, value: m.value, passed: m.passed, serial: m.serial }))}
                  center={limits?.center ?? null}
                  ucl={limits?.ucl ?? null}
                  lcl={limits?.lcl ?? null}
                  lsl={current.lsl}
                  usl={current.usl}
                  unit={current.unit}
                />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500">Distribution against limits</h3>
                <Histogram ariaLabel={`${current.name} distribution`} bins={histogram(values, 28)} lsl={current.lsl} usl={current.usl} unit={current.unit} />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500">Against sibling stations</h3>
                {sibs.length ? (
                  <>
                    {diff != null && (
                      <p className={`mb-3 text-sm ${Math.abs(diff) >= 0.01 ? "font-medium text-amber-800" : "text-zinc-600"}`}>
                        {s.name} reads {Math.abs(diff * 100).toFixed(1)}% {diff >= 0 ? "high" : "low"} vs. its siblings on {current.name}.
                      </p>
                    )}
                    <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-100 text-sm">
                      <li className="flex justify-between px-3 py-2 font-medium">
                        <span>{s.name} (this station)</span>
                        <span className="tabular-nums">{measure(recentMean, current.unit)}</span>
                      </li>
                      {sibs.map((x) => {
                        const m = x.means[current.name];
                        const pctDiff = recentMean != null && m ? ((recentMean - m) / Math.abs(m)) * 100 : null;
                        return (
                          <li key={x.station.id} className="flex justify-between px-3 py-2">
                            <Link href={`/stations/${x.station.id}`} className="text-zinc-700 hover:underline">
                              {x.station.name}
                            </Link>
                            <span className="tabular-nums text-zinc-600">
                              {measure(m, current.unit)}
                              {pctDiff != null && <span className="ml-2 text-xs text-zinc-400">this reads {pctDiff >= 0 ? "+" : ""}{pctDiff.toFixed(1)}%</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-zinc-500">No other station of this type runs this test.</p>
                )}
              </div>
            </div>
          ) : (
            <Empty text="No tests have reported from this station yet." />
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Fixture health">
            <div className="flex flex-col gap-4 p-4 text-sm">
              <div>
                <div className="mb-1 flex justify-between">
                  <span className="text-zinc-500">Cycles</span>
                  <span className="tabular-nums">
                    {s.fixture_cycles.toLocaleString()} / {s.fixture_cycle_limit.toLocaleString()}
                  </span>
                </div>
                <Meter value={h.cycles} tone={h.cycles >= 0.9 ? "bad" : h.cycles >= 0.75 ? "warn" : "neutral"} label="Fixture cycles used" />
              </div>
              <div>
                <div className="mb-1 flex justify-between">
                  <span className="text-zinc-500">Probe wear</span>
                  <span className="tabular-nums">{Math.round(s.probe_wear_pct)}%</span>
                </div>
                <Meter value={s.probe_wear_pct / 100} tone={s.probe_wear_pct >= 90 ? "bad" : s.probe_wear_pct >= 75 ? "warn" : "neutral"} label="Probe wear" />
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Calibrated</span>
                <span>{shortDate(s.calibrated_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Calibration due</span>
                <span className={h.calDays != null && h.calDays <= 7 ? "font-medium text-rose-600" : ""}>
                  {shortDate(s.calibration_due)}
                  {h.calDays != null && <span className="ml-1 text-xs text-zinc-400">({h.calDays < 0 ? `${-h.calDays}d overdue` : `${h.calDays}d`})</span>}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Alerts">
            {d.alerts.length ? (
              <ul className="divide-y divide-zinc-100">
                {d.alerts.slice(0, 8).map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-sm">
                    <div className="mb-1 flex items-center gap-2">
                      <SeverityPill severity={a.severity} />
                      <span className="text-xs text-zinc-500">{a.status}</span>
                      <span className="ml-auto text-xs text-zinc-400">{timeAgo(a.detected_at)}</span>
                    </div>
                    <Link href={a.investigation_id ? `/investigations/${a.investigation_id}` : "/drift"} className="font-medium hover:underline">
                      {a.title}
                    </Link>
                    <p className="text-xs text-zinc-500">{classificationOf(a.classification).label}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No alerts on this station." />
            )}
          </Card>

          <Card title="Agent actions" href="/approvals" linkLabel="Approvals">
            {d.actions.length ? (
              <ul className="divide-y divide-zinc-100">
                {d.actions.slice(0, 8).map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-sm">
                    <div className="mb-1 flex items-center gap-2">
                      <ActionStatusPill status={a.status} />
                      <span className="text-xs text-zinc-500">{actionKindLabel(a.kind)}</span>
                    </div>
                    <span className="text-zinc-700">{a.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No agent actions on this station." />
            )}
          </Card>
        </div>
      </div>

      <Card title="Tests" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className={TH}>Test</th>
                <th className={TH}>Limits</th>
                <th className={TH}>Baseline</th>
                <th className={TH}>Recent mean</th>
                <th className={TH}>Cpk</th>
                <th className={`${TH} text-right`}>Fails (last 50)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {d.tests.map((t) => {
                const r = t.samples.map((m) => m.value).slice(-RECENT);
                const c = cpk(r, t.lsl, t.usl);
                return (
                  <tr key={t.id} className={t.id === current?.id ? "bg-sky-50/50" : "hover:bg-zinc-50"}>
                    <td className={TD}>
                      <Link href={`/stations/${s.id}?test=${t.id}`} scroll={false} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                    </td>
                    <td className={`${TD} tabular-nums text-zinc-600`}>
                      {t.lsl ?? "—"} to {t.usl ?? "—"} {t.unit}
                    </td>
                    <td className={`${TD} tabular-nums text-zinc-600`}>
                      {measure(t.baseline_mean, t.unit)}
                      {t.baseline_sd != null && <span className="text-xs text-zinc-400"> σ {measure(t.baseline_sd)}</span>}
                    </td>
                    <td className={`${TD} tabular-nums`}>{measure(r.length ? mean(r) : null, t.unit)}</td>
                    <td className={`${TD} tabular-nums ${cpkTone(c)}`}>{c?.toFixed(2) ?? "—"}</td>
                    <td className={`${TD} text-right tabular-nums`}>{t.samples.slice(-RECENT).filter((m) => !m.passed).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Raw log (latest 50)">
        {log.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-zinc-100">
                <tr>
                  <th className={TH}>Time</th>
                  <th className={TH}>Serial</th>
                  <th className={TH}>Test</th>
                  <th className={TH}>Value</th>
                  <th className={TH}>Result</th>
                  <th className={TH}>Shift</th>
                  <th className={TH}>Lot</th>
                  <th className={TH}>Board rev</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-mono text-[12px]">
                {log.map((m, i) => (
                  <tr key={i}>
                    <td className="px-4 py-1.5 text-zinc-500">{dateTime(m.measured_at)}</td>
                    <td className="px-4 py-1.5">{m.serial ?? "—"}</td>
                    <td className="px-4 py-1.5 font-sans text-[13px]">{m.test}</td>
                    <td className="px-4 py-1.5 tabular-nums">{measure(m.value, m.unit)}</td>
                    <td className={`px-4 py-1.5 font-sans text-xs font-medium ${m.passed ? "text-emerald-700" : "text-rose-600"}`}>{m.passed ? "PASS" : "FAIL"}</td>
                    <td className="px-4 py-1.5">{m.shift ?? "—"}</td>
                    <td className="px-4 py-1.5">{m.lot_code ?? "—"}</td>
                    <td className="px-4 py-1.5">{m.board_rev ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No results yet." />
        )}
      </Card>
    </div>
  );
}
