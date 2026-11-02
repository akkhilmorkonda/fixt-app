import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { aiFeatures } from "@/lib/ai/fixt";
import { dateTime, duration, hoursBetween, invNumber, shortDate } from "@/lib/fixt/format";
import { timeToRootCause } from "@/lib/fixt/metrics";
import { getInvestigation, getSettings } from "@/lib/fixt/repo";
import { actionKindLabel, classificationOf } from "@/lib/fixt/types";
import { isUuid } from "@/lib/fixt/validate";
import { currentTenant } from "@/lib/tenant";
import { ActionStatusPill, Card, InvestigationStatusPill, SeverityPill } from "../../_ui/kit";
import PageHeader from "../../_ui/PageHeader";
import { CommentForm, Controls, FeedbackForm, RediagnoseButton, RunTestButton } from "./InvestigationUI";
import { Comments, ConfidenceMeter, EvidenceList, Timeline, timelineItems, type TimelineItem } from "./parts";

export const instant = false;

/** One failure: the joined evidence, the agent's hypothesis, the next test and the team's discussion. */
export default async function InvestigationPage({ params }: PageProps<"/investigations/[id]">) {
  await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [detail, features, settings, tenant] = await Promise.all([getInvestigation(id), aiFeatures(), getSettings(), currentTenant()]);
  if (!detail) notFound();
  const { investigation: inv, timeline, comments, feedback, actions, station, product, similar } = detail;

  await connection();
  const ttrc = timeToRootCause(inv);
  const openHours = inv.root_caused_at ? null : hoursBetween(inv.opened_at, null);
  const mine = feedback.find((f) => f.user_id === tenant.userId) ?? null;
  const testQueued = actions.some((a) => a.kind === "run_test" && a.title === inv.suggested_test?.name);

  const items: TimelineItem[] = [
    ...timelineItems(timeline),
    ...actions
      .filter((a) => a.kind !== "run_test")
      .map((a) => ({
        key: `a${a.id}`,
        at: a.proposed_at,
        dot: "bg-violet-500",
        label: `Agent action · ${actionKindLabel(a.kind)}`,
        title: a.title,
        detail: a.rationale,
        extra: (
          <div className="mt-1.5 flex items-center gap-2">
            <ActionStatusPill status={a.status} />
            {a.status === "proposed" && (
              <Link href="/approvals" className="text-xs font-medium text-sky-600 hover:underline">
                Review in approvals
              </Link>
            )}
          </div>
        ),
      })),
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/investigations" className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-[#1a1a1a]">
        ← Investigations
      </Link>
      <PageHeader
        kicker={invNumber(inv.number)}
        title={inv.title}
        actions={<Controls id={inv.id} status={inv.status} severity={inv.severity} assignee={inv.assignee_name} shareToken={inv.share_token} />}
      />
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-2">
        <InvestigationStatusPill status={inv.status} />
        <SeverityPill severity={inv.severity} />
        {inv.failure_mode && <span className="text-sm text-zinc-500">{inv.failure_mode}</span>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Agent hypothesis" actions={<RediagnoseButton id={inv.id} available={features.diagnosis} hasHypothesis={!!inv.hypothesis} />}>
            {inv.hypothesis ? (
              <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700" title={classificationOf(inv.classification).hint}>
                    {classificationOf(inv.classification).label}
                  </span>
                  <ConfidenceMeter value={inv.confidence} />
                </div>
                <p className="text-[15px] leading-7">{inv.hypothesis}</p>
                <EvidenceList evidence={inv.evidence} />
                <p className="text-xs text-zinc-400">
                  {inv.diagnosis_model ? `${inv.diagnosis_model} · ` : ""}
                  {inv.diagnosed_at ? `diagnosed ${dateTime(inv.diagnosed_at)}` : ""}
                </p>
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">No hypothesis yet. Run the diagnosis agent to join the evidence and suggest a root cause.</p>
            )}
          </Card>

          {inv.suggested_test && (
            <Card title="Suggested next test">
              <div className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{inv.suggested_test.name}</p>
                  <span className="text-xs tabular-nums text-zinc-500">About {inv.suggested_test.minutes} min</span>
                </div>
                <p className="text-sm leading-6 text-zinc-600">{inv.suggested_test.rationale}</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
                  {inv.suggested_test.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                {testQueued ? (
                  <p className="text-sm text-emerald-700">Approved and queued. Results arrive through the station&apos;s connector.</p>
                ) : inv.station_id ? (
                  <RunTestButton id={inv.id} />
                ) : (
                  <p className="text-sm text-zinc-500">Link a station to run this from FIXT.</p>
                )}
              </div>
            </Card>
          )}

          {inv.hypothesis && (
            <Card title="Was this diagnosis right?">
              <div className="flex flex-col gap-4 p-4">
                <FeedbackForm id={inv.id} mine={mine} />
                {feedback.length > 0 && (
                  <ul className="flex flex-col gap-2 border-t border-zinc-100 pt-3 text-sm">
                    {feedback.map((f) => (
                      <li key={f.id} className="flex flex-wrap gap-x-2">
                        <span className="font-medium">{f.user_name ?? "Engineer"}</span>
                        <span className={f.verdict === "right" ? "text-emerald-700" : f.verdict === "wrong" ? "text-rose-600" : "text-amber-700"}>
                          {f.verdict === "partly" ? "partly right" : f.verdict}
                        </span>
                        {f.note && <span className="text-zinc-600">· {f.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          )}

          <Card title="Timeline">
            <Timeline items={items} />
          </Card>

          <Card title={`Comments${comments.length ? ` (${comments.length})` : ""}`}>
            <Comments comments={comments} />
            <CommentForm id={inv.id} />
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card title="Details">
            <dl className="divide-y divide-zinc-100 text-sm">
              <Fact label="Station">
                {station ? (
                  <Link href={`/stations/${station.id}`} className="text-sky-700 hover:underline">
                    {station.name}
                  </Link>
                ) : (
                  "—"
                )}
              </Fact>
              <Fact label="Product">{product ? `${product.name} rev ${product.board_rev}` : "—"}</Fact>
              <Fact label="Units at risk">{inv.units_at_risk.toLocaleString()}</Fact>
              <Fact label="Assignee">{inv.assignee_name ?? "Unassigned"}</Fact>
              <Fact label="Opened">{dateTime(inv.opened_at)}</Fact>
              <Fact label="Root caused">{inv.root_caused_at ? dateTime(inv.root_caused_at) : "Not yet"}</Fact>
              <Fact label="Time to root cause">
                {ttrc != null ? (
                  <span className={ttrc < settings.baseline_root_cause_hours ? "font-medium text-emerald-700" : ""}>{duration(ttrc)}</span>
                ) : (
                  <span className="text-zinc-500">{duration(openHours)} so far</span>
                )}
                <span className="block text-xs text-zinc-500">vs. {duration(settings.baseline_root_cause_hours)} before FIXT</span>
              </Fact>
            </dl>
          </Card>

          <Card title="Similar past failures">
            {similar.length ? (
              <ul className="divide-y divide-zinc-100">
                {similar.map((s) => (
                  <li key={s.id} className="px-4 py-2.5">
                    <Link href={`/investigations/${s.id}`} className="block text-sm font-medium hover:underline">
                      <span className="mr-1.5 tabular-nums text-zinc-500">{invNumber(s.number)}</span>
                      {s.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {classificationOf(s.classification).label} · {shortDate(s.opened_at)}
                      {timeToRootCause(s) != null ? ` · root caused in ${duration(timeToRootCause(s))}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">No similar failures on record.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
