import { requireUser } from "@/lib/auth";
import { getFleet, getSettings, getYield, listFailures, listLots } from "@/lib/fixt/repo";
import { costOfQuality, lotQuality, pareto, summarizeYield } from "@/lib/fixt/metrics";
import { money, percent, shortDate } from "@/lib/fixt/format";
import { BarList } from "../_ui/charts";
import { BUTTON_SMALL, Card, Empty, Pill, Stat, StatStrip, Tabs, TD, TH } from "../_ui/kit";
import { Icon } from "../_ui/icons";
import PageHeader from "../_ui/PageHeader";

export const instant = false;

const RANGES = [
  { key: "30", label: "Last 30 days" },
  { key: "7", label: "Last 7 days" },
];

/** Yield and failure Paretos, supplier quality and the cost of quality. */
export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  await requireUser();
  const { days: raw } = await searchParams;
  const days = raw === "7" ? 7 : 30;
  const [fleet, all, lots, yieldRows, settings] = await Promise.all([getFleet(), listFailures(days), listLots(), getYield(days), getSettings()]);

  const stationName = new Map(fleet.stations.map((s) => [s.id, s.name]));
  const lot = new Map(lots.map((l) => [l.id, l]));
  const real = all.filter((f) => !f.false_failure);
  const falseFailures = all.length - real.length;
  const coq = costOfQuality(all, settings.engineer_hourly_rate);
  const quality = lotQuality(lots, all).filter((l) => l.failures > 0 || l.quarantined || lots.length <= 12);
  const y = summarizeYield(yieldRows);
  const exp = (report: string) => `/analytics/export?report=${report}&days=${days}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker="Insights"
        title="Analytics"
        actions={
          <div className="flex flex-wrap gap-2">
            {[
              ["failures", "Failures"],
              ["lots", "Lots"],
              ["yield", "Yield"],
            ].map(([k, l]) => (
              <a key={k} href={exp(k)} className={BUTTON_SMALL} download>
                <Icon name="upload" className="h-3 w-3 rotate-180" />
                {l} CSV
              </a>
            ))}
          </div>
        }
      />
      <Tabs tabs={RANGES} current={String(days)} param="days" base="/analytics" />

      <StatStrip cols={5}>
        <Stat label="First-pass yield" value={y.units ? percent(y.fpy) : "—"} sub={`${y.units.toLocaleString()} units`} />
        <Stat label="Failures" value={real.length.toLocaleString()} sub="Excluding false failures" />
        <Stat label="False failures" value={falseFailures.toLocaleString()} sub="Good units the test failed" tone={falseFailures ? "warn" : undefined} />
        <Stat label="Field returns" value={all.filter((f) => f.escaped).length.toLocaleString()} sub="Escaped the line" tone={all.some((f) => f.escaped) ? "warn" : undefined} />
        <Stat label="Cost of quality" value={money(coq.total)} sub="Scrap, rework, retest" />
      </StatStrip>

      <p className="mb-4 text-xs text-zinc-500">Paretos leave out false failures (units that failed a test but were good), so they show real defects. False failures are tracked on the Drift &amp; anomalies page.</p>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Failures by mode">
          <div className="p-4">
            <BarList rows={pareto(real, (f) => f.mode)} />
          </div>
        </Card>
        <Card title="Failures by station">
          <div className="p-4">
            <BarList rows={pareto(real, (f) => stationName.get(f.station_id) ?? null)} />
          </div>
        </Card>
        <Card title="Failures by shift">
          <div className="p-4">
            <BarList rows={pareto(real, (f) => (f.shift ? `Shift ${f.shift}` : null))} max={3} />
          </div>
        </Card>
        <Card title="Failures by supplier">
          <div className="p-4">
            <BarList rows={pareto(real, (f) => (f.lot_id ? (lot.get(f.lot_id)?.supplier ?? null) : null))} />
            <p className="mt-3 text-xs text-zinc-500">Only failures traced to a component lot.</p>
          </div>
        </Card>
      </div>

      <Card title="Supplier and component-lot quality" className="mb-6">
        {quality.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-zinc-100">
                <tr>
                  <th className={TH}>Part</th>
                  <th className={TH}>Lot</th>
                  <th className={TH}>Supplier</th>
                  <th className={TH}>Received</th>
                  <th className={`${TH} text-right`}>Units</th>
                  <th className={`${TH} text-right`}>Failures</th>
                  <th className={`${TH} text-right`}>PPM</th>
                  <th className={`${TH} text-right`}>Escapes</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {quality.map((l) => (
                  <tr key={l.id}>
                    <td className={TD}>{l.part}</td>
                    <td className={`${TD} font-mono text-xs`}>{l.lot_code}</td>
                    <td className={TD}>{l.supplier}</td>
                    <td className={`${TD} text-zinc-600`}>{shortDate(l.received_on)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{l.units.toLocaleString()}</td>
                    <td className={`${TD} text-right tabular-nums`}>{l.failures}</td>
                    <td className={`${TD} text-right font-medium tabular-nums ${l.ppm >= 1000 ? "text-rose-600" : ""}`}>{l.ppm.toLocaleString()}</td>
                    <td className={`${TD} text-right tabular-nums`}>{l.escapes}</td>
                    <td className={TD}>{l.quarantined && <Pill tone="bg-rose-50 text-rose-700 ring-rose-200">Quarantined</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No component lots recorded. Connect your ERP to track lots and suppliers." />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Yield by line and shift">
          {fleet.lines.length && yieldRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="border-b border-zinc-100">
                  <tr>
                    <th className={TH}>Line</th>
                    {(["A", "B", "C"] as const).map((s) => (
                      <th key={s} className={`${TH} text-right`}>
                        Shift {s} FPY / final
                      </th>
                    ))}
                    <th className={`${TH} text-right`}>Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {fleet.lines.map((l) => {
                    const rows = yieldRows.filter((r) => r.line_id === l.id);
                    if (!rows.length) return null;
                    return (
                      <tr key={l.id}>
                        <td className={`${TD} font-medium`}>{l.name}</td>
                        {(["A", "B", "C"] as const).map((s) => {
                          const v = summarizeYield(rows.filter((r) => r.shift === s));
                          return (
                            <td key={s} className={`${TD} text-right tabular-nums`}>
                              {v.units ? (
                                <>
                                  <span className={v.fpy < 0.95 ? "text-rose-600" : ""}>{percent(v.fpy)}</span>
                                  <span className="text-zinc-400"> / {percent(v.finalYield)}</span>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                          );
                        })}
                        <td className={`${TD} text-right tabular-nums text-zinc-600`}>{summarizeYield(rows).units.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="No yield data for this period." />
          )}
        </Card>
        <Card title="Cost of quality">
          <dl className="divide-y divide-zinc-100 text-sm">
            {[
              ["Scrap", money(coq.scrap)],
              ["Rework", `${Math.round(coq.reworkHours).toLocaleString()} h`],
              ["Retest", `${Math.round(coq.retestHours).toLocaleString()} h`],
              ["Labor at", `${money(settings.engineer_hourly_rate)}/h`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between px-4 py-2.5">
                <dt className="text-zinc-600">{k}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3">
              <dt className="font-medium">Total</dt>
              <dd className="font-heading text-lg font-semibold tabular-nums">{money(coq.total)}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
