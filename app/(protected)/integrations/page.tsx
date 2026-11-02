import { requireUser } from "@/lib/auth";
import { listConnectors } from "@/lib/fixt/repo";
import { CONNECTOR_KINDS } from "@/lib/fixt/types";
import { Card, Pill } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";
import { AddConnector, ConnectorRow, CsvUpload, SetupDocs } from "./IntegrationsUI";

export const instant = false;

const GROUPS = [...new Set(CONNECTOR_KINDS.map((k) => k.group))];

/** Connectors: where test results, factory data and field returns come from. */
export default async function IntegrationsPage() {
  await requireUser();
  const connectors = await listConnectors();
  const endpoint = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""}/api/ingest`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Admin" title="Integrations" actions={<AddConnector />} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          {GROUPS.map((group) => (
            <section key={group} className="flex flex-col gap-3">
              <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">{group}</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {CONNECTOR_KINDS.filter((k) => k.group === group).map((kind) => {
                  const mine = connectors.filter((c) => c.kind === kind.key);
                  return (
                    <div key={kind.key} className="flex flex-col rounded-xl border border-zinc-200 bg-white">
                      <div className="flex items-start justify-between gap-3 border-b border-zinc-100 bg-[#fcfcfc] px-4 py-2.5">
                        <div className="min-w-0">
                          <h3 className="flex items-center gap-2 font-heading text-[15px] font-semibold tracking-tight">
                            {kind.label}
                            {kind.preview && <Pill tone="bg-sky-50 text-sky-700 ring-sky-200">Preview</Pill>}
                          </h3>
                          <p className="text-xs leading-5 text-zinc-500">{kind.hint}</p>
                        </div>
                        <AddConnector kind={kind.key} compact />
                      </div>
                      {mine.length ? (
                        <ul className="divide-y divide-zinc-100">
                          {mine.map((c) => (
                            <ConnectorRow key={c.id} connector={c} />
                          ))}
                        </ul>
                      ) : (
                        <p className="px-4 py-5 text-sm text-zinc-500">Not connected.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <Card title="Upload a CSV">
            <CsvUpload />
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card title="Send results to FIXT">
            <SetupDocs endpoint={endpoint} />
          </Card>
          <Card title="Instrument & station onboarding">
            <div className="flex flex-col gap-3 px-4 py-4 text-sm leading-6 text-zinc-600">
              <p>You don&apos;t need to set stations up first. The first result from a station or test FIXT hasn&apos;t seen creates it under an <b className="font-medium text-[#1a1a1a]">Unassigned</b> line, so nothing is dropped.</p>
              <p>Limits come from each result&apos;s <code className="rounded bg-zinc-100 px-1 text-xs">lsl</code> / <code className="rounded bg-zinc-100 px-1 text-xs">usl</code>, or from the test once they&apos;re set.</p>
              <p>The first 30 results on a test become its baseline. From then on the drift agent compares every new result against it, and against sibling stations running the same test.</p>
              <p>For a new product, capture golden units in Bring-up so the baseline starts from known-good hardware.</p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
