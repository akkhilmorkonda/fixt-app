import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/fixt/format";
import { listConnectors } from "@/lib/fixt/repo";
import { CONNECTOR_GROUPS, CONNECTOR_KINDS } from "@/lib/fixt/types";
import { Card, Stat, StatStrip } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";
import { AddConnector, ConnectorRow, CsvUpload, SetupDocs } from "./IntegrationsUI";
import { ConnectorLogo } from "./logos";

export const instant = false;

/** Connectors: where test results, factory data and documents come from. */
export default async function IntegrationsPage() {
  await requireUser();
  const connectors = await listConnectors();
  const endpoint = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""}/api/ingest`;

  const live = connectors.filter((c) => c.status === "connected").length;
  const attention = connectors.filter((c) => c.status !== "connected").length;
  const synced = connectors.reduce((sum, c) => sum + c.records_synced, 0);
  const lastSync = connectors.map((c) => c.last_sync_at).filter((t): t is string => !!t).sort().at(-1);
  // Problems first, so they're the first thing an admin sees.
  const ordered = [...connectors].sort((a, b) => Number(a.status === "connected") - Number(b.status === "connected"));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Admin" title="Integrations" actions={<AddConnector />} />
      <p className="-mt-3 mb-6 max-w-3xl text-sm leading-6 text-zinc-600">
        Connect the systems FIXT&apos;s agents learn from. Test stations send the measurements they watch for drift. Factory systems and documents give them the context to explain what they find.
      </p>

      <StatStrip>
        <Stat label="Connected" value={`${live}`} sub={`of ${connectors.length} sources`} tone={live ? "good" : undefined} />
        <Stat label="Records synced" value={compact(synced)} sub="results, rows, files and issues" />
        <Stat label="Last sync" value={lastSync ? timeAgo(lastSync) : "Never"} sub="across all sources" />
        <Stat label="Need attention" value={`${attention}`} sub={attention ? "errors or paused" : "all healthy"} tone={attention ? "warn" : undefined} />
      </StatStrip>

      <section className="mb-10">
        <Card title="Your connections">
          {ordered.length ? (
            <ul className="divide-y divide-zinc-100">
              {ordered.map((c) => (
                <ConnectorRow key={c.id} connector={c} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm leading-6 text-zinc-500">Nothing connected yet. Start with your test stations below, then add factory systems so the agents can explain what they find.</p>
          )}
        </Card>
      </section>

      <section className="mb-10 flex flex-col gap-8">
        <h2 className="font-heading text-xl font-semibold tracking-tight">Add a source</h2>
        {CONNECTOR_GROUPS.map((group) => (
          <div key={group.key} className="flex flex-col gap-3">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500">{group.label}</h3>
              <p className="mt-1 text-sm text-zinc-600">{group.hint}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CONNECTOR_KINDS.filter((k) => k.group === group.key).map((kind) => {
                const count = connectors.filter((c) => c.kind === kind.key).length;
                return (
                  <div key={kind.key} className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <ConnectorLogo kind={kind.key} />
                      {count > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {count === 1 ? "Connected" : `${count} connected`}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <h4 className="font-heading text-[15px] font-semibold tracking-tight">{kind.label}</h4>
                      <p className="text-xs leading-5 text-zinc-500">{kind.hint}</p>
                    </div>
                    <div className="mt-auto pt-1">
                      <AddConnector kind={kind.key} compact again={count > 0} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight">Sending results from your stations</h2>
          <p className="mt-1 text-sm text-zinc-600">For TestStand, Python, LabVIEW and CSV sources. Create the connector above to get a key, then post results with it.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col gap-6">
            <Card title="Send results to FIXT">
              <SetupDocs endpoint={endpoint} />
            </Card>
            <Card title="Upload a CSV">
              <CsvUpload />
            </Card>
          </div>
          <Card title="What happens next" className="self-start">
            <ol className="flex flex-col gap-4 px-4 py-4 text-sm leading-6 text-zinc-600">
              <Step n={1} title="Stations appear on their own">
                The first result from a station or test FIXT hasn&apos;t seen creates it under an <b className="font-medium text-[#1a1a1a]">Unassigned</b> line, so nothing is dropped.
              </Step>
              <Step n={2} title="Limits come with the data">
                Each result&apos;s <code className="rounded bg-zinc-100 px-1 text-xs">lsl</code> / <code className="rounded bg-zinc-100 px-1 text-xs">usl</code> sets them, or the test&apos;s once you&apos;ve set them.
              </Step>
              <Step n={3} title="A baseline, then drift alerts">
                The first 30 results on a test become its baseline. The drift agent then compares every new result against it and against sibling stations.
              </Step>
              <Step n={4} title="New product?">
                Capture golden units in Bring-up so the baseline starts from known-good hardware.
              </Step>
            </ol>
          </Card>
        </div>
      </section>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold tabular-nums text-zinc-700">{n}</span>
      <div>
        <p className="font-medium text-[#1a1a1a]">{title}</p>
        <p>{children}</p>
      </div>
    </li>
  );
}

/** 2418903 → "2.4M". */
function compact(n: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
