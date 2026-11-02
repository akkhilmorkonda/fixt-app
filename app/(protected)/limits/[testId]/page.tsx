import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { analyzeTest, groupStats, RULES, TARGET_CPK, VERDICTS, type GroupStat, type RuleKey } from "@/lib/fixt/capability";
import { dateTime, measure, shortDate } from "@/lib/fixt/format";
import { getTestAnalysis } from "@/lib/fixt/repo";
import { mean, stdev } from "@/lib/fixt/spc";
import { isUuid } from "@/lib/fixt/validate";
import { ControlChart, IntervalPlot } from "../../_ui/charts";
import { ActionStatusPill, Card, Empty, Pill, Stat, StatStrip } from "../../_ui/kit";
import PageHeader from "../../_ui/PageHeader";
import { ppm, pValue } from "../format";
import LimitTuner from "./LimitTuner";

export const instant = false;

/** One test: capability, stability, what drives its variation, and limit tuning. */
export default async function TestLimitsPage({ params }: PageProps<"/limits/[testId]">) {
  await requireUser();
  const { testId } = await params;
  if (!isUuid(testId)) notFound();
  const d = await getTestAnalysis(testId);
  if (!d) notFound();
  const { test: t, station: s, samples } = d;
  const values = samples.map((m) => m.value);
  const limits = { lsl: t.lsl, usl: t.usl };
  const a = analyzeTest(values, limits, { mean: t.baseline_mean, sd: t.baseline_sd });
  const c = a.capability;
  const v = VERDICTS[a.assessment.verdict];
  const pending = d.actions.find((x) => x.kind === "change_limit" && x.status === "proposed")?.id ?? null;
  const history = d.actions.filter((x) => x.kind === "change_limit");

  // What drives the variation: the same test on other stations, and shift, lot and board revision here.
  const stationRows: GroupStat[] = [
    { label: s.name, ...stats(values) },
    ...d.siblings.map((x) => ({ label: x.station.name, ...stats(x.samples.map((m) => m.value)) })),
  ];
  const byStation = groupStats(
    [...samples.map((m) => ({ g: s.name, v: m.value })), ...d.siblings.flatMap((x) => x.samples.map((m) => ({ g: x.station.name, v: m.value })))],
    (x) => x.g,
    (x) => x.v,
  );
  const factors = [
    { key: "shift", label: "Shift", g: groupStats(samples, (m) => (m.shift ? `Shift ${m.shift}` : null), (m) => m.value) },
    { key: "lot", label: "Component lot", g: groupStats(samples, (m) => m.lot_code, (m) => m.value) },
    { key: "rev", label: "Board revision", g: groupStats(samples, (m) => (m.board_rev ? `Rev ${m.board_rev}` : null), (m) => m.value) },
  ].filter((f) => f.g.groups.length >= 2);

  const byRule = Object.entries(
    a.signals.reduce<Record<string, number[]>>((acc, x) => ({ ...acc, [x.rule]: [...(acc[x.rule] ?? []), x.index] }), {}),
  ) as [RuleKey, number[]][];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker={`Limits & capability · ${s.name}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t.name}
            <Pill tone={v.tone}>{v.label}</Pill>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-600">
            <span>
              Limits: <b className="font-medium tabular-nums text-[#1a1a1a]">{t.lsl ?? "—"} to {t.usl ?? "—"} {t.unit}</b>
            </span>
            <span>{c.n} results</span>
            <Link href={`/stations/${s.id}?test=${t.id}`} className="font-medium text-sky-700 hover:underline">
              Station page
            </Link>
          </div>
        }
      />

      <section className="mb-6 rounded-xl border border-zinc-200 bg-white px-4 py-3.5">
        <p className="text-sm leading-6 text-[#1a1a1a]">{a.assessment.summary}</p>
        {a.assessment.notes.map((n) => (
          <p key={n} className="mt-1.5 text-sm leading-6 text-zinc-600">
            {n}
          </p>
        ))}
      </section>

      <StatStrip cols={5}>
        <Stat label="Ppk (long-term)" value={c.ppk?.toFixed(2) ?? "—"} sub={c.pp != null ? `Pp ${c.pp.toFixed(2)}` : "One-sided"} tone={tone(c.ppk)} />
        <Stat label="Cpk (short-term)" value={c.cpk?.toFixed(2) ?? "—"} sub={c.cp != null ? `Cp ${c.cp.toFixed(2)}` : "One-sided"} tone={tone(c.cpk)} />
        <Stat label="Expected fallout" value={t.lsl == null && t.usl == null ? "—" : ppm(c.ppm.total)} sub="ppm, from a normal fit" />
        <Stat label="Observed failures" value={`${c.observed.below + c.observed.above}`} sub={`${(c.observed.rate * 100).toFixed(2)}% of ${c.n}`} tone={c.observed.rate > 0.01 ? "warn" : undefined} />
        <Stat label="Normality" value={Number.isNaN(c.normality.p) ? "—" : c.normality.normal ? "Normal" : "Not normal"} sub={Number.isNaN(c.normality.p) ? "Not enough data" : `Anderson-Darling ${pValue(c.normality.p)}`} tone={c.normality.normal ? undefined : "warn"} />
      </StatStrip>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card title="Tune limits">
          {c.n >= 2 ? (
            <LimitTuner testId={t.id} values={values} current={limits} unit={t.unit} suggestion={a.assessment.suggestion} normal={c.normality.normal} pending={pending} />
          ) : (
            <Empty text="Not enough results to tune limits yet." />
          )}
        </Card>
        <div className="flex flex-col gap-6">
          <Card title="Statistics">
            <dl className="divide-y divide-zinc-100 text-sm">
              {[
                ["Mean", measure(c.mean, t.unit)],
                ["σ overall", measure(c.sd)],
                ["σ within", measure(c.sdWithin)],
                ["Min / max", `${measure(c.min)} / ${measure(c.max)}`],
                ["Nominal", measure(t.nominal, t.unit)],
                ["Baseline", t.baseline_mean != null ? `${measure(t.baseline_mean)} ± ${measure(t.baseline_sd)}` : "—"],
                ["Skew", Number.isFinite(c.skew) ? c.skew.toFixed(2) : "—"],
                ["Excess kurtosis", Number.isFinite(c.kurtosis) ? c.kurtosis.toFixed(2) : "—"],
                ["Below LSL (expected)", t.lsl == null ? "—" : `${ppm(c.ppm.below)} ppm`],
                ["Above USL (expected)", t.usl == null ? "—" : `${ppm(c.ppm.above)} ppm`],
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between gap-3 px-4 py-2">
                  <dt className="text-zinc-500">{k}</dt>
                  <dd className="tabular-nums">{val}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Limit history" href="/approvals" linkLabel="Approvals">
            {history.length ? (
              <ul className="divide-y divide-zinc-100">
                {history.map((x) => (
                  <li key={x.id} className="px-4 py-2.5 text-sm">
                    <div className="mb-1 flex items-center gap-2">
                      <ActionStatusPill status={x.status} />
                      <span className="ml-auto text-xs text-zinc-400">{shortDate(x.proposed_at)}</span>
                    </div>
                    <span className="text-zinc-700">{x.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No limit changes yet." />
            )}
          </Card>
        </div>
      </div>

      <Card title="Stability" className="mb-6">
        <div className="flex flex-col gap-4 p-4">
          <ControlChart
            ariaLabel={`${t.name} control chart`}
            points={samples.map((m) => ({ at: m.measured_at, value: m.value, passed: m.passed, serial: m.serial }))}
            center={a.center}
            ucl={a.center + 3 * a.controlSd}
            lcl={a.center - 3 * a.controlSd}
            lsl={t.lsl}
            usl={t.usl}
            unit={t.unit}
          />
          <p className="text-xs text-zinc-500">
            Control limits are {t.baseline_mean != null ? "the baseline" : "the short-term spread"} ± 3σ. Western Electric rules flag patterns a stable process rarely makes; a few are normal, a cluster means something changed.
          </p>
          {byRule.length ? (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {byRule.map(([rule, idx]) => (
                <li key={rule} className="rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{RULES[rule].label}</span>
                    <span className="tabular-nums text-zinc-600">{idx.length}×</span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {RULES[rule].hint} Last at {dateTime(samples[idx[idx.length - 1]].measured_at)}.
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-700">No control-rule signals: the process is in control.</p>
          )}
        </div>
      </Card>

      <Card title="What drives the variation">
        <div className="flex flex-col divide-y divide-zinc-100">
          <section className="flex flex-col gap-3 p-4">
            <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500">Station to station</h3>
            {stationRows.length > 1 ? (
              <>
                <Verdict anova={byStation.anova} groups={byStation.groups} what="stations" unit={t.unit} />
                <IntervalPlot ariaLabel={`${t.name} by station`} rows={stationRows} lsl={t.lsl} usl={t.usl} unit={t.unit} highlight={s.name} />
              </>
            ) : (
              <p className="text-sm text-zinc-500">No other station runs this test, so there&apos;s nothing to correlate against.</p>
            )}
          </section>
          {factors.map((f) => (
            <section key={f.key} className="flex flex-col gap-3 p-4">
              <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500">By {f.label.toLowerCase()}</h3>
              <Verdict anova={f.g.anova} groups={f.g.groups} what={`${f.label.toLowerCase()}s`} unit={t.unit} />
              <IntervalPlot ariaLabel={`${t.name} by ${f.label.toLowerCase()}`} rows={f.g.groups} lsl={t.lsl} usl={t.usl} unit={t.unit} />
            </section>
          ))}
          {!factors.length && <p className="p-4 text-sm text-zinc-500">Results here carry one shift, lot and board revision, so there&apos;s nothing to split by.</p>}
        </div>
      </Card>
    </div>
  );
}

function stats(xs: number[]) {
  return { n: xs.length, mean: mean(xs), sd: stdev(xs) };
}

function tone(v: number | null): "warn" | "good" | undefined {
  return v == null ? undefined : v < 1 ? "warn" : v >= TARGET_CPK ? "good" : undefined;
}

/** One sentence from the ANOVA: whether the factor matters, and by how much. */
function Verdict({ anova, groups, what, unit }: { anova: { p: number } | null; groups: GroupStat[]; what: string; unit: string }) {
  if (!anova) return <p className="text-sm text-zinc-500">Not enough results per group to compare {what}.</p>;
  const sorted = [...groups].sort((a, b) => b.mean - a.mean);
  const hi = sorted[0];
  const lo = sorted[sorted.length - 1];
  const gap = hi.mean - lo.mean;
  if (anova.p < 0.05)
    return (
      <p className="text-sm font-medium text-amber-800">
        The {what} differ ({pValue(anova.p)}): {hi.label} reads {measure(gap, unit)} higher than {lo.label}
        {Math.abs(lo.mean) > 0 ? ` (${((gap / Math.abs(lo.mean)) * 100).toFixed(1)}%)` : ""}.
      </p>
    );
  return <p className="text-sm text-zinc-600">No real difference between {what} ({pValue(anova.p)}).</p>;
}
