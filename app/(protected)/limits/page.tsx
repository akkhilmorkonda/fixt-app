import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { analyzeTest, TARGET_CPK, VERDICTS, type Verdict } from "@/lib/fixt/capability";
import { measure } from "@/lib/fixt/format";
import { listTestSeries } from "@/lib/fixt/repo";
import { Card, Empty, Pill, Stat, StatStrip, Tabs, TD, TH } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";
import { capTone, ppm } from "./format";

export const instant = false;

const ATTENTION: Verdict[] = ["test_issue", "unstable", "too_tight", "off_center", "marginal"];
const VIEWS = [
  { key: "all", label: "All tests" },
  { key: "attention", label: "Needs attention" },
  { key: "loose", label: "Could tighten" },
  { key: "capable", label: "Capable" },
];

/** Every test's capability against its limits, worst first. */
export default async function LimitsPage({ searchParams }: PageProps<"/limits">) {
  await requireUser();
  const { view: raw } = await searchParams;
  const view = VIEWS.some((v) => v.key === raw) ? (raw as string) : "all";
  const series = await listTestSeries(200);

  const rows = series
    .map((s) => ({ ...s, a: analyzeTest(s.samples.map((m) => m.value), { lsl: s.test.lsl, usl: s.test.usl }, { mean: s.test.baseline_mean, sd: s.test.baseline_sd }) }))
    .sort((x, y) => VERDICTS[y.a.assessment.verdict].rank - VERDICTS[x.a.assessment.verdict].rank || (x.a.capability.ppk ?? 99) - (y.a.capability.ppk ?? 99));
  const is = (v: Verdict[]) => (r: (typeof rows)[number]) => v.includes(r.a.assessment.verdict);
  const attention = rows.filter(is(ATTENTION));
  const loose = rows.filter(is(["loose", "no_limits"]));
  const capable = rows.filter(is(["capable"]));
  const shown = view === "attention" ? attention : view === "loose" ? loose : view === "capable" ? capable : rows;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Engineering" title="Limits & capability" />
      <p className="-mt-3 mb-6 max-w-3xl text-sm leading-6 text-zinc-600">
        How well each test&apos;s spread fits its limits, from its latest 200 results. Ppk uses the long-term spread and is what the line actually delivers; Cpk uses the short-term spread and shows what it could. FIXT checks stability first: limits are only worth moving on a process that&apos;s in control.
      </p>

      <StatStrip>
        <Stat label="Tests analyzed" value={String(rows.length)} sub={`${series.reduce((s, x) => s + x.samples.length, 0).toLocaleString()} results`} />
        <Stat label="Need attention" value={String(attention.length)} sub="Test issues, unstable, too tight or off center" tone={attention.length ? "warn" : undefined} />
        <Stat label="Could tighten" value={String(loose.length)} sub="Loose or no limits" />
        <Stat label="Capable" value={String(capable.length)} sub={`Ppk ≥ ${TARGET_CPK}`} tone={capable.length ? "good" : undefined} />
      </StatStrip>

      <Tabs
        tabs={VIEWS.map((v) => ({ ...v, count: v.key === "attention" ? attention.length : v.key === "loose" ? loose.length : v.key === "capable" ? capable.length : rows.length }))}
        current={view}
        param="view"
        base="/limits"
      />

      <Card title="Tests">
        {shown.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-zinc-100">
                <tr>
                  <th className={TH}>Test</th>
                  <th className={TH}>Limits</th>
                  <th className={`${TH} text-right`}>Mean</th>
                  <th className={`${TH} text-right`}>σ</th>
                  <th className={`${TH} text-right`}>Cpk</th>
                  <th className={`${TH} text-right`}>Ppk</th>
                  <th className={`${TH} text-right`}>Expected ppm</th>
                  <th className={`${TH} text-right`}>Signals</th>
                  <th className={TH}>Assessment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {shown.map(({ test: t, station: s, samples, a }) => {
                  const c = a.capability;
                  const v = VERDICTS[a.assessment.verdict];
                  return (
                    <tr key={t.id} className="hover:bg-zinc-50">
                      <td className={TD}>
                        <Link href={`/limits/${t.id}`} className="font-medium hover:underline">
                          {t.name}
                        </Link>
                        <span className="block text-xs text-zinc-500">
                          {s.name} · {samples.length} results
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap tabular-nums text-zinc-600`}>
                        {t.lsl ?? "—"} to {t.usl ?? "—"} {t.unit}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{measure(c.n ? c.mean : null)}</td>
                      <td className={`${TD} text-right tabular-nums text-zinc-600`}>{measure(c.n > 1 ? c.sd : null)}</td>
                      <td className={`${TD} text-right tabular-nums ${capTone(c.cpk)}`}>{c.cpk?.toFixed(2) ?? "—"}</td>
                      <td className={`${TD} text-right tabular-nums ${capTone(c.ppk)}`}>{c.ppk?.toFixed(2) ?? "—"}</td>
                      <td className={`${TD} text-right tabular-nums text-zinc-600`}>{t.lsl == null && t.usl == null ? "—" : ppm(c.ppm.total)}</td>
                      <td className={`${TD} text-right tabular-nums ${a.signals.length >= 6 ? "font-medium text-rose-600" : "text-zinc-600"}`}>{a.signals.length}</td>
                      <td className={TD}>
                        <Pill tone={v.tone}>{v.label}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text={rows.length ? "No tests in this view." : "No test results yet. Connect a test station in Integrations."} />
        )}
      </Card>
    </div>
  );
}
