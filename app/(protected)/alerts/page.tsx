import { requireUser } from "@/lib/auth";
import { emailReady } from "@/lib/fixt/notify";
import { listChannels } from "@/lib/fixt/repo";
import { Card, Empty } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";
import { AddChannelForm, ChannelRow } from "./AlertsUI";

export const instant = false;

/** Where alerts go: Slack, Teams, email and PagerDuty, each with a minimum severity. */
export default async function AlertRoutingPage() {
  await requireUser();
  const channels = await listChannels();
  const email = emailReady();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Admin" title="Alert routing" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Channels">
          {channels.length ? (
            <ul className="divide-y divide-zinc-100">
              {channels.map((c) => (
                <ChannelRow key={c.id} channel={c} />
              ))}
            </ul>
          ) : (
            <Empty text="No channels yet. Alerts only show in FIXT until you add one." />
          )}
        </Card>
        <aside className="flex flex-col gap-6">
          <Card title="Add a channel">
            <AddChannelForm emailReady={email} />
          </Card>
          <Card title="How routing works">
            <div className="flex flex-col gap-2 px-4 py-4 text-sm leading-6 text-zinc-600">
              <p>Every new drift, anomaly and false-failure alert goes to each enabled channel whose minimum severity it meets.</p>
              <p>Slack and Teams use an incoming webhook you create in that workspace. PagerDuty uses an Events API v2 routing key and de-duplicates repeat alerts for the same test.</p>
              {!email && <p className="text-amber-800">Email alerts need RESEND_API_KEY and EMAIL_FROM set on the server.</p>}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
