import Link from "next/link";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { dateTime, invNumber, timeAgo } from "@/lib/fixt/format";
import { getFleet, listActions, listInvestigations } from "@/lib/fixt/repo";
import { actionKindLabel, LINE_CHANGING, type AgentAction } from "@/lib/fixt/types";
import { ActionStatusPill, Empty, Tabs } from "../_ui/kit";
import EmptyState from "../_ui/EmptyState";
import PageHeader from "../_ui/PageHeader";
import { Decide, Rollback } from "./ApprovalButtons";

export const instant = false;

/** Request time, read once after connection(). */
const clock = () => Date.now();

const VIEWS: { key: string; label: string; statuses: AgentAction["status"][] }[] = [
  { key: "pending", label: "Pending", statuses: ["proposed"] },
  { key: "applied", label: "Applied", statuses: ["applied", "approved"] },
  { key: "declined", label: "Rejected & rolled back", statuses: ["rejected", "rolled_back"] },
];

/** Every change an agent wants to make to the line, waiting on a person. */
export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  await requireUser();
  const params = await searchParams;
  const view = VIEWS.find((v) => v.key === params.tab) ?? VIEWS[0];
  const [actions, fleet, investigations] = await Promise.all([listActions({ limit: 300 }), getFleet(), listInvestigations({ limit: 500 })]);
  await connection();
  const now = clock();
  const rows = actions.filter((a) => view.statuses.includes(a.status));
  const station = (id: string) => fleet.stations.find((s) => s.id === id);
  const lineOf = (stationId: string) => fleet.lines.find((l) => l.id === station(stationId)?.line_id);
  const inv = (id: string | null) => investigations.find((i) => i.id === id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Approvals" />
      <Tabs base="/approvals" current={view.key} tabs={VIEWS.map((v) => ({ key: v.key, label: v.label, count: actions.filter((a) => v.statuses.includes(a.status)).length }))} />

      {rows.length ? (
        <div className="flex flex-col gap-4">
          {rows.map((a) => {
            const s = station(a.station_id);
            const linked = inv(a.investigation_id);
            const line = lineOf(a.station_id);
            return (
              <article key={a.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <header className="flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-[#fcfcfc] px-4 py-2.5">
                  <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">{actionKindLabel(a.kind)}</span>
                  {s && (
                    <Link href={`/stations/${s.id}`} className="text-sm font-medium text-zinc-700 hover:underline">
                      {s.name}
                    </Link>
                  )}
                  {line && <span className="text-xs text-zinc-500">{line.name}</span>}
                  <span className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
                    Proposed {timeAgo(a.proposed_at, now)}
                    <ActionStatusPill status={a.status} />
                  </span>
                </header>
                <div className="flex flex-col gap-3 p-4">
                  <h2 className="font-heading text-[17px] font-semibold tracking-tight">{a.title}</h2>
                  {a.rationale && <p className="text-sm leading-6 text-zinc-600">{a.rationale}</p>}
                  <Change action={a} />
                  {linked && (
                    <Link href={`/investigations/${linked.id}`} className="text-sm text-sky-700 hover:underline">
                      {invNumber(linked.number)}: {linked.title}
                    </Link>
                  )}
                  {a.decided_at && (
                    <p className="text-xs text-zinc-500">
                      {a.status === "rejected" ? "Rejected" : "Approved"} by {a.decided_by_name ?? "someone"} {dateTime(a.decided_at)}
                      {a.decision_note ? ` · “${a.decision_note}”` : ""}
                      {a.rolled_back_at ? ` · rolled back ${dateTime(a.rolled_back_at)}` : ""}
                    </p>
                  )}
                  {a.status === "proposed" && <Decide id={a.id} />}
                  {a.status === "applied" && LINE_CHANGING.includes(a.kind) && <Rollback id={a.id} />}
                </div>
              </article>
            );
          })}
        </div>
      ) : view.key === "pending" ? (
        <EmptyState title="Nothing waiting for approval" body="When an agent wants to change limits, sequences or calibration on a line set to “act with approval”, it shows up here first." />
      ) : (
        <Empty text="Nothing here yet." />
      )}
    </div>
  );
}

const show = (v: unknown): string => {
  if (v == null || v === "") return "none";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("lsl" in o || "usl" in o) return `${show(o.lsl)} to ${show(o.usl)}`;
    if ("mean" in o || "sd" in o) return `mean ${show(o.mean)}, σ ${show(o.sd)}`;
    if ("calibrated_at" in o || "calibration_due" in o) return `calibrated ${show(o.calibrated_at)}, due ${show(o.calibration_due)}`;
    return JSON.stringify(v);
  }
  return String(v);
};

/** Before → after, in words where we know the shape. */
function Change({ action: a }: { action: AgentAction }) {
  const c = a.change ?? {};
  if (a.kind === "run_test") {
    const steps = Array.isArray(c.steps) ? (c.steps as string[]) : [];
    return steps.length ? (
      <ol className="list-decimal space-y-0.5 pl-5 text-sm text-zinc-700">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    ) : null;
  }
  if (a.kind === "quarantine_lot") {
    return (
      <p className="text-sm">
        Lot <span className="font-medium">{show(c.lot_code ?? c.lot_id)}</span>: {c.before ? "quarantined" : "released"} → {c.after ? "quarantined" : "released"}
      </p>
    );
  }
  if ("before" in c || "after" in c) {
    const field = typeof c.field === "string" ? c.field.replace(/_/g, " ").replace(/^usl$/, "upper limit").replace(/^lsl$/, "lower limit") : "value";
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm">
        <span className="text-zinc-500">{field}</span>
        <code className="rounded bg-white px-1.5 py-0.5 text-zinc-700 ring-1 ring-zinc-200">{show(c.before)}</code>
        <span aria-hidden="true" className="text-zinc-400">→</span>
        <code className="rounded bg-white px-1.5 py-0.5 font-medium text-[#1a1a1a] ring-1 ring-zinc-200">{show(c.after)}</code>
      </div>
    );
  }
  return Object.keys(c).length ? <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">{JSON.stringify(c, null, 2)}</pre> : null;
}
