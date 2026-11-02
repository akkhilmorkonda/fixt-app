import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { invNumber } from "@/lib/fixt/format";
import { getSharedInvestigation } from "@/lib/fixt/repo";
import { classificationOf } from "@/lib/fixt/types";
import { Comments, ConfidenceMeter, EvidenceList, Timeline, timelineItems } from "../../(protected)/investigations/[id]/parts";
import { Card, InvestigationStatusPill, SeverityPill } from "../../(protected)/_ui/kit";

// A read-only investigation for contract manufacturers and suppliers. Public:
// the unguessable token in the URL is the only credential (proxy.ts lets
// /share/<token> through), and only what's shown here is loaded.

export const instant = false;

export const metadata: Metadata = {
  title: "Shared investigation · FIXT",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SharedInvestigationPage({ params }: PageProps<"/share/[token]">) {
  const { token } = await params;
  const shared = await getSharedInvestigation(token);
  if (!shared) notFound();
  const { organization, investigation: inv, timeline, comments, station, product } = shared;

  return (
    <div className="min-h-dvh bg-white font-sans text-[#1a1a1a]">
      <header className="flex h-[60px] items-center gap-3 border-b border-zinc-200 bg-[#fcfcfc] px-4 md:px-10">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#1a1a1a] font-heading text-xs font-semibold text-white">F</span>
        <span className="font-heading text-sm font-semibold tracking-tight">FIXT</span>
        <span className="ml-auto text-xs text-zinc-500">Shared read-only by {organization || "the manufacturer"} via FIXT</span>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 md:px-10">
        <div className="mb-6 flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            {invNumber(inv.number)} · {organization}
          </span>
          <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-tight">{inv.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            <InvestigationStatusPill status={inv.status} />
            <SeverityPill severity={inv.severity} />
            {station && <span>Station {station.name}</span>}
            {product && <span>· {product.name} rev {product.board_rev}</span>}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Current hypothesis">
            {inv.hypothesis ? (
              <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">{classificationOf(inv.classification).label}</span>
                  <ConfidenceMeter value={inv.confidence} />
                </div>
                <p className="text-[15px] leading-7">{inv.hypothesis}</p>
                <EvidenceList evidence={inv.evidence} />
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">No hypothesis yet.</p>
            )}
          </Card>

          <Card title="Timeline">
            <Timeline items={timelineItems(timeline)} />
          </Card>

          <Card title="Comments">
            <Comments comments={comments} />
          </Card>
        </div>

        <p className="mt-8 text-center text-xs text-zinc-400">This page is read-only. Reply to {organization || "the manufacturer"} directly to add information.</p>
      </main>
    </div>
  );
}
