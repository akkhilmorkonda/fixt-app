import Link from "next/link";
import { listOrganizations, recentAdminActivity } from "@/lib/admin";
import { aiPlatformStatus, aiSpendByTenant } from "@/lib/ai/admin";
import { dollars } from "@/lib/ai/models";
import { timeAgo } from "@/lib/fixt/format";
import { requireAdmin } from "@/lib/tenant";
import { NewOrganizationForm, OrganizationTable, SyncButton } from "./AdminUI";
import { AiPlatformBanner } from "./AiAdminUI";

export const instant = false;

/** Every organization on the platform. */
export default async function AdminHome() {
  await requireAdmin();
  const [orgs, activity, aiStatus, aiSpend] = await Promise.all([listOrganizations(), recentAdminActivity(15), aiPlatformStatus(), aiSpendByTenant()]);
  const aiTotal = [...aiSpend.values()].reduce((n, s) => n + s.cost_micros, 0);
  const active = orgs.filter((o) => o.status === "active");

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">Platform</span>
          <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-tight">Organizations</h1>
        </div>
        <SyncButton />
      </div>

      <AiPlatformBanner status={aiStatus} />

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 lg:grid-cols-5">
        <Stat label="Active organizations" value={active.length} />
        <Stat label="Stations" value={active.reduce((n, o) => n + o.stations, 0)} />
        <Stat label="Open alerts" value={active.reduce((n, o) => n + o.open_alerts, 0)} />
        <Stat label="Investigations (30 days)" value={active.reduce((n, o) => n + o.investigations_30d, 0)} />
        <Stat label="AI spend this month" value={dollars(aiTotal)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <OrganizationTable orgs={orgs} />
        <aside className="flex flex-col gap-6">
          <section className="rounded-xl border border-zinc-200 p-5">
            <h2 className="mb-3 font-heading text-[15px] font-semibold tracking-tight">New organization</h2>
            <NewOrganizationForm />
          </section>
          <section className="overflow-hidden rounded-xl border border-zinc-200">
            <h2 className="border-b border-zinc-100 bg-[#fcfcfc] px-4 py-2.5 font-heading text-[15px] font-semibold tracking-tight">Admin activity</h2>
            {activity.length ? (
              <ul className="divide-y divide-zinc-100">
                {activity.map((a) => (
                  <li key={a.id} className="px-4 py-2 text-xs">
                    <span className="font-medium text-zinc-700">{a.admin_email.split("@")[0]}</span>{" "}
                    <span className="text-zinc-600">{a.action.replace(/_/g, " ")}</span>
                    {a.tenant_id && (
                      <>
                        {" · "}
                        <Link href={`/admin/orgs/${encodeURIComponent(a.tenant_id)}`} className="text-sky-700 hover:underline">
                          {a.tenants?.name || a.tenant_id}
                        </Link>
                      </>
                    )}
                    <span className="block text-zinc-400">{timeAgo(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">Nothing yet.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-1 bg-white px-4 py-3">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="font-heading text-2xl font-semibold tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}
