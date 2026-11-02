import Link from "next/link";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSettings, listAlerts, listFailures, listInvestigations } from "@/lib/fixt/repo";
import { computeRoi, ESCAPE_RATE } from "@/lib/fixt/metrics";
import { duration, money, moneyShort } from "@/lib/fixt/format";
import { BarList } from "../_ui/charts";
import { Card, Stat, StatStrip, Tabs } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";

export const instant = false;

const RANGES = [
  { key: "90", label: "Last 90 days" },
  { key: "30", label: "Last 30 days" },
  { key: "365", label: "Last 12 months" },
];

type RoiInput = Omit<Parameters<typeof computeRoi>[0], "days" | "now">;

/** The window's ROI, plus value per 30-day period (oldest first) for the longer windows. */
function roiView(input: RoiInput, days: number) {
  const now = Date.now();
  const roi = computeRoi({ ...input, days, now });
  const buckets = days >= 90 ? Math.round(days / 30) : 0;
  const monthly = Array.from({ length: buckets }, (_, i) => {
    const end = now - (buckets - 1 - i) * 30 * 86_400_000;
    const r = computeRoi({ ...input, days: 30, now: end });
    return { label: new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: Math.round(r.value.total) };
  });
  return { roi, monthly };
}

/** What FIXT has been worth: the renewal screen. */
export default async function RoiPage({ searchParams }: PageProps<"/roi">) {
  await requireUser();
  const { days: raw } = await searchParams;
  const days = raw === "30" ? 30 : raw === "365" ? 365 : 90;
  const [alerts, investigations, failures, settings] = await Promise.all([listAlerts({ limit: 5000 }), listInvestigations({ limit: 5000 }), listFailures(days), getSettings()]);
  await connection();
  const { roi, monthly } = roiView({ alerts, investigations, failures, settings }, days);

  const before = roi.baselineHours;
  const after = roi.medianHoursToRootCause;
  const faster = after != null && after > 0 ? before / after : null;
  const net = roi.value.total - roi.cost;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Insights" title="Return on FIXT" />
      <Tabs tabs={RANGES} current={String(days)} param="days" base="/roi" />

      <section className="mb-6 overflow-hidden rounded-2xl bg-[#0c0c0d] text-white">
        <div className="grid grid-cols-1 gap-8 p-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:p-10">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400">Value delivered · {RANGES.find((r) => r.key === String(days))?.label.toLowerCase()}</span>
            <span className="font-heading text-5xl font-semibold tabular-nums tracking-tight md:text-6xl">{moneyShort(roi.value.total)}</span>
            <span className="text-sm text-zinc-400">
              against {moneyShort(roi.cost)} of FIXT for the same period · net {net >= 0 ? "+" : "−"}
              {moneyShort(Math.abs(net))}
            </span>
          </div>
          <div className="flex flex-col justify-center gap-4 border-white/10 md:border-l md:pl-8">
            <div>
              <span className="font-heading text-4xl font-semibold tabular-nums">{roi.multiple != null ? `${roi.multiple.toFixed(1)}×` : "—"}</span>
              <span className="ml-2 text-sm text-zinc-400">return</span>
            </div>
            <div>
              <span className="font-heading text-4xl font-semibold tabular-nums">{faster != null ? `${faster.toFixed(faster >= 10 ? 0 : 1)}×` : "—"}</span>
              <span className="ml-2 text-sm text-zinc-400">faster to root cause</span>
              <p className="mt-1 text-xs text-zinc-500">
                {duration(after)} median, down from {duration(before)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <StatStrip cols={5}>
        <Stat label="Engineer-hours saved" value={Math.round(roi.engineerHoursSaved).toLocaleString()} sub={money(roi.value.engineering)} tone="good" />
        <Stat label="Retest hours saved" value={Math.round(roi.retestHoursSaved).toLocaleString()} sub={money(roi.value.retest)} />
        <Stat label="Escapes prevented" value={roi.escapesPrevented.toLocaleString()} sub={`${money(roi.value.escapes)} · ${roi.unitsProtected.toLocaleString()} units protected`} tone="good" />
        <Stat label="Catches" value={roi.catches.toLocaleString()} sub="Drift, anomalies, false failures" href="/drift" />
        <Stat label="Root-caused" value={roi.rootCaused.toLocaleString()} sub={`${roi.fieldEscapes} field returns in period`} href="/investigations" />
      </StatStrip>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Time to root cause">
          <div className="flex flex-col gap-4 p-4">
            <BarList
              rows={[
                { label: "Before FIXT (baseline)", value: before },
                { label: "With FIXT (median)", value: after ?? 0 },
              ]}
              format="hours"
              max={2}
            />
            <p className="text-xs text-zinc-500">The &ldquo;1 week vs. 1 day&rdquo; number: median hours from an investigation opening to its root cause, for {roi.rootCaused} investigations in this period.</p>
          </div>
        </Card>
        <Card title="Where the value came from">
          <div className="p-4">
            <BarList
              rows={[
                { label: "Engineering time", value: Math.round(roi.value.engineering) },
                { label: "Escapes prevented", value: Math.round(roi.value.escapes) },
                { label: "Retest time", value: Math.round(roi.value.retest) },
              ].sort((a, b) => b.value - a.value)}
              format="money"
              tone="#1baf7a"
            />
          </div>
        </Card>
      </div>

      {monthly.length > 1 && (
        <Card title="Value by 30-day period" className="mb-6">
          <div className="p-4">
            <BarList rows={monthly.map((m) => ({ label: `30 days to ${m.label}`, value: m.value }))} format="money" max={12} tone="#1baf7a" />
          </div>
        </Card>
      )}

      <Card title="How this is calculated" href="/settings" linkLabel="Change assumptions">
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 p-4 text-sm text-zinc-600 md:grid-cols-2">
          <p>
            <b className="font-medium text-[#1a1a1a]">Engineer-hours saved:</b> for each investigation root-caused in the period, the baseline time to root cause ({duration(settings.baseline_root_cause_hours)}) minus the actual time, at {money(settings.engineer_hourly_rate)}/hour.
          </p>
          <p>
            <b className="font-medium text-[#1a1a1a]">Escapes prevented:</b> {Math.round(ESCAPE_RATE * 100)}% of units at risk on root-caused investigations, assumed to have shipped otherwise, at {money(settings.escape_cost)} per escape.
          </p>
          <p>
            <b className="font-medium text-[#1a1a1a]">Retest hours saved:</b> retest time on false failures at stations where the false-failure alert was fixed.
          </p>
          <p>
            <b className="font-medium text-[#1a1a1a]">FIXT cost:</b> {money(settings.fixt_annual_price)} a year, prorated to {days} days.
          </p>
          <p className="md:col-span-2 text-xs text-zinc-500">
            Assumptions are set per organization in <Link href="/settings" className="text-sky-700 hover:underline">Settings</Link>. Numbers come from the alerts, investigations and failures recorded in FIXT.
          </p>
        </div>
      </Card>
    </div>
  );
}
