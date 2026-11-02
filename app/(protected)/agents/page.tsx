import Link from "next/link";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/fixt/format";
import { getFleet, listActions, listFeedback } from "@/lib/fixt/repo";
import { ACTION_KINDS } from "@/lib/fixt/types";
import { currentTenant } from "@/lib/tenant";
import { Card, Empty, Stat, StatStrip, TD, TH } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";
import AutonomySelect from "./AutonomySelect";

export const instant = false;

/** Request time, read once after connection(). */
const clock = () => Date.now();

/** How much the agents may do on each line, and how often they've been right. */
export default async function AgentsPage() {
  await requireUser();
  const [fleet, feedback, actions, tenant] = await Promise.all([getFleet(), listFeedback(200), listActions({ limit: 1000 }), currentTenant()]);
  await connection();
  const now = clock();
  const canEdit = tenant.orgRole === "org:admin" || !!tenant.actingAsAdmin;

  const right = feedback.filter((f) => f.verdict === "right").length;
  const partly = feedback.filter((f) => f.verdict === "partly").length;
  const wrong = feedback.filter((f) => f.verdict === "wrong").length;
  const accuracy = feedback.length ? (right + partly * 0.5) / feedback.length : null;

  const recent = actions.filter((a) => now - Date.parse(a.proposed_at) <= 30 * 86_400_000);
  const byKind = ACTION_KINDS.map((k) => {
    const rows = recent.filter((a) => a.kind === k.key);
    return {
      ...k,
      proposed: rows.length,
      applied: rows.filter((a) => a.status === "applied").length,
      rejected: rows.filter((a) => a.status === "rejected").length,
      rolledBack: rows.filter((a) => a.status === "rolled_back").length,
      pending: rows.filter((a) => a.status === "proposed").length,
    };
  }).filter((k) => k.proposed);

  const sites = fleet.sites.map((s) => ({ site: s, lines: fleet.lines.filter((l) => l.site_id === s.id) })).filter((g) => g.lines.length);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Agents" title="Autonomy & trust" actions={<Link href="/agents/audit" className="text-sm font-medium text-sky-600 hover:underline">Full audit log</Link>} />

      <StatStrip>
        <Stat label="Diagnosis accuracy" value={accuracy == null ? "—" : `${Math.round(accuracy * 100)}%`} sub={`${feedback.length} engineer verdicts`} tone={accuracy != null && accuracy >= 0.8 ? "good" : undefined} />
        <Stat label="Changes proposed (30 days)" value={String(recent.length)} sub={`${recent.filter((a) => a.status === "proposed").length} waiting`} href="/approvals" />
        <Stat label="Applied" value={String(recent.filter((a) => a.status === "applied").length)} sub="Approved or autonomous" />
        <Stat label="Rejected or rolled back" value={String(recent.filter((a) => a.status === "rejected" || a.status === "rolled_back").length)} sub="Feeds the evals" />
      </StatStrip>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Autonomy by line">
            {sites.length ? (
              <div className="divide-y divide-zinc-100">
                {sites.map(({ site, lines }) => (
                  <div key={site.id} className="px-4 py-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500">{site.name}</p>
                    <ul className="flex flex-col gap-4">
                      {lines.map((l) => (
                        <li key={l.id} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium">{l.name}</p>
                            <p className="text-xs text-zinc-500">
                              {fleet.products.find((p) => p.id === l.product_id)?.name ?? "No product"} · {fleet.stations.filter((s) => s.line_id === l.id).length} stations
                            </p>
                          </div>
                          <AutonomySelect lineId={l.id} value={l.autonomy} canEdit={canEdit} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="No lines yet. Connect a test station or load the demo fleet." />
            )}
            {!canEdit && <p className="border-t border-zinc-100 px-4 py-2.5 text-xs text-zinc-500">Only organization admins can change autonomy.</p>}
          </Card>

          <Card title="Agent actions, last 30 days">
            {byKind.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead className="border-b border-zinc-100">
                    <tr>
                      <th className={TH}>Kind</th>
                      <th className={`${TH} text-right`}>Proposed</th>
                      <th className={`${TH} text-right`}>Waiting</th>
                      <th className={`${TH} text-right`}>Applied</th>
                      <th className={`${TH} text-right`}>Rejected</th>
                      <th className={`${TH} text-right`}>Rolled back</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 tabular-nums">
                    {byKind.map((k) => (
                      <tr key={k.key}>
                        <td className={TD}>{k.label}</td>
                        <td className={`${TD} text-right`}>{k.proposed}</td>
                        <td className={`${TD} text-right`}>{k.pending}</td>
                        <td className={`${TD} text-right`}>{k.applied}</td>
                        <td className={`${TD} text-right`}>{k.rejected}</td>
                        <td className={`${TD} text-right`}>{k.rolledBack}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty text="No agent actions in the last 30 days." />
            )}
          </Card>
        </div>

        <Card title="Engineer feedback on diagnoses">
          <div className="grid grid-cols-3 gap-px border-b border-zinc-100 bg-zinc-100 text-center">
            {[
              ["Right", right, "text-emerald-700"],
              ["Partly", partly, "text-amber-700"],
              ["Wrong", wrong, "text-rose-600"],
            ].map(([label, n, tone]) => (
              <div key={label as string} className="bg-white px-2 py-3">
                <p className={`font-heading text-xl font-semibold tabular-nums ${tone}`}>{n as number}</p>
                <p className="text-xs text-zinc-500">{label as string}</p>
              </div>
            ))}
          </div>
          {feedback.length ? (
            <ul className="divide-y divide-zinc-100">
              {feedback.slice(0, 15).map((f) => (
                <li key={f.id} className="px-4 py-3 text-sm">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{f.user_name ?? "Engineer"}</span>
                    <span className={f.verdict === "right" ? "text-emerald-700" : f.verdict === "wrong" ? "text-rose-600" : "text-amber-700"}>{f.verdict === "partly" ? "partly right" : f.verdict}</span>
                    <span className="text-xs text-zinc-400">{timeAgo(f.created_at, now)}</span>
                  </p>
                  {f.note && <p className="text-zinc-600">{f.note}</p>}
                  {f.hypothesis && (
                    <Link href={`/investigations/${f.investigation_id}`} className="mt-1 line-clamp-2 block text-xs text-zinc-500 hover:underline">
                      On: {f.hypothesis}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No verdicts yet. Engineers rate each diagnosis on its investigation page." />
          )}
        </Card>
      </div>
    </div>
  );
}
