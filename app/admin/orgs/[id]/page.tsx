import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganization } from "@/lib/admin";
import { getOrgAi } from "@/lib/ai/admin";
import { shortDate, timeAgo } from "@/lib/fixt/format";
import { connectorKindOf } from "@/lib/fixt/types";
import { requireAdmin } from "@/lib/tenant";
import { openOrganizationAction } from "../../actions";
import { OrganizationForm, PRIMARY, StatusPill } from "../../AdminUI";
import { OrgAiSettings } from "../../AiAdminUI";

export const instant = false;

/** One organization: details, its connectors, members, AI settings, and what admins did to it. */
export default async function AdminOrganizationPage({ params }: PageProps<"/admin/orgs/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const tenantId = decodeURIComponent(id);
  const [org, ai] = await Promise.all([getOrganization(tenantId), getOrgAi(tenantId)]);
  if (!org) notFound();
  const { tenant, summary } = org;

  return (
    <>
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500">
        <Link href="/admin" className="hover:text-[#1a1a1a]">
          Organizations
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="truncate text-[#1a1a1a]">{tenant.name || tenant.id}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 font-heading text-[28px] font-semibold leading-tight tracking-tight">
            {tenant.name || "Unnamed organization"} <StatusPill status={tenant.status} />
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-400">{tenant.id}</p>
          {tenant.status !== "active" && tenant.status_reason && <p className="mt-1 text-sm text-amber-800">{tenant.status_reason}</p>}
        </div>
        <form action={openOrganizationAction.bind(null, tenant.id)}>
          <button type="submit" className={PRIMARY}>
            Open as this organization
          </button>
        </form>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 md:grid-cols-5">
        <Fact label="Stations">{summary?.stations ?? 0}</Fact>
        <Fact label="Open alerts">{summary?.open_alerts ?? 0}</Fact>
        <Fact label="Investigations (30d)">{summary?.investigations_30d ?? 0}</Fact>
        <Fact label="Awaiting approval">{summary?.pending_approvals ?? 0}</Fact>
        <Fact label="Since">{shortDate(tenant.created_at)}</Fact>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Card title="Details">
            <OrganizationForm tenant={tenant} />
          </Card>
          <Card title="AI" hint="Which model this organization runs, what it may spend, and what it has used. Every call is traced in LangSmith under its run id.">
            <OrgAiSettings tenantId={tenant.id} ai={ai} />
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card title="Members">
            {org.membersError ? (
              <p className="text-sm text-zinc-500">{org.membersError}</p>
            ) : org.members.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {org.members.map((m) => (
                  <li key={m.userId ?? m.email} className="flex flex-col">
                    <span className="font-medium">{m.name || m.email}</span>
                    <span className="text-xs text-zinc-500">
                      {m.name ? `${m.email} · ` : ""}
                      {m.role.replace("org:", "")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">No members yet.</p>
            )}
          </Card>
          <Card title="Connectors">
            {org.connectors.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {org.connectors.map((c) => (
                  <li key={c.id} className="flex flex-col">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-zinc-500">
                      {connectorKindOf(c.kind).label} · {c.status} · {c.records_synced.toLocaleString()} records{c.last_sync_at ? ` · ${timeAgo(c.last_sync_at)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">No connectors yet.</p>
            )}
          </Card>
          <Card title="Deployment">
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Deployment">{org.settings?.deployment?.replace("_", "-") ?? "cloud"}</Row>
              <Row label="Data region">{(org.settings?.data_region ?? "us").toUpperCase()}</Row>
              <Row label="SSO required">{org.settings?.sso_required ? "Yes" : "No"}</Row>
              <Row label="Weekly summary">{org.settings?.weekly_summary_enabled ? "On" : "Off"}</Row>
              <Row label="Demo data">{org.settings?.demo_loaded_at ? `Loaded ${shortDate(org.settings.demo_loaded_at)}` : "No"}</Row>
            </dl>
          </Card>
          <Card title="Admin history">
            {org.audit.length ? (
              <ul className="flex flex-col gap-2 text-xs">
                {org.audit.map((a) => (
                  <li key={a.id}>
                    <span className="font-medium text-zinc-700">{a.admin_email.split("@")[0]}</span> <span className="text-zinc-600">{a.action.replace(/_/g, " ")}</span>
                    <span className="block text-zinc-400">{timeAgo(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">No admin changes yet.</p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 p-5">
      <h2 className="font-heading text-[15px] font-semibold tracking-tight">{title}</h2>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 bg-white px-4 py-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-sm font-medium tabular-nums">{children}</span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="truncate text-right">{children}</dd>
    </div>
  );
}
