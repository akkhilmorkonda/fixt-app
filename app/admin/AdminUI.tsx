"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OrganizationDetail, OrganizationSummary } from "@/lib/admin";
import { timeAgo } from "@/lib/fixt/format";
import { createOrganizationAction, syncOrganizationsAction, updateOrganizationAction, type AdminResult as ActionResult } from "./actions";

const errorOf = (r: ActionResult) => (r.ok ? null : r.error || Object.values(r.fieldErrors ?? {})[0] || "Couldn't save");

export const BUTTON = "flex h-9 items-center justify-center rounded-lg px-3.5 text-sm font-medium transition disabled:opacity-60";
export const PRIMARY = `${BUTTON} bg-black text-white hover:bg-[#383838]`;
export const SECONDARY = `${BUTTON} border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50`;
const INPUT =
  "h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 aria-[invalid=true]:border-rose-400";

const STATUS_STYLE = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  suspended: "bg-amber-50 text-amber-800 ring-amber-600/20",
  archived: "bg-zinc-100 text-zinc-600 ring-zinc-500/15",
};

export function StatusPill({ status }: { status: OrganizationSummary["status"] }) {
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLE[status]}`}>{status}</span>;
}

/** Runs an action, refreshing the page when it worked. */
function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const run = (fn: () => Promise<ActionResult>, onOk?: (r: ActionResult) => void) =>
    start(async () => {
      const r = await fn();
      setError(errorOf(r));
      setFieldErrors(r.ok ? {} : (r.fieldErrors ?? {}));
      if (r.ok) {
        onOk?.(r);
        router.refresh();
      }
    });
  return { pending, error, fieldErrors, run };
}

// Directory ------------------------------------------------------------------------------

export function OrganizationTable({ orgs }: { orgs: OrganizationSummary[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | OrganizationSummary["status"]>("all");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orgs.filter((o) => (status === "all" || o.status === status) && (!q || o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)));
  }, [orgs, query, status]);

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-[#fcfcfc] px-4 py-2.5">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or id" aria-label="Search organizations" className={`${INPUT} max-w-xs`} />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status" className={`${INPUT} w-auto`}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </select>
        <span className="ml-auto text-xs tabular-nums text-zinc-500">
          {shown.length} of {orgs.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr className="border-b border-zinc-100">
              <th className="px-4 py-2 font-medium">Organization</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Stations</th>
              <th className="px-4 py-2 text-right font-medium">Open alerts</th>
              <th className="px-4 py-2 text-right font-medium">Investigations (30d)</th>
              <th className="px-4 py-2 text-right font-medium">Awaiting approval</th>
              <th className="px-4 py-2 font-medium">Last agent activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {shown.map((o) => (
              <tr key={o.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/orgs/${encodeURIComponent(o.id)}`} className="font-medium hover:underline">
                    {o.name || "Unnamed organization"}
                  </Link>
                  <span className="block font-mono text-[11px] text-zinc-400">{o.id}</span>
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill status={o.status} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{o.stations}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{o.open_alerts}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{o.investigations_30d}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{o.pending_approvals}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-500">{o.last_activity_at ? timeAgo(o.last_activity_at) : "—"}</td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No organizations match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SyncButton() {
  const { pending, error, run } = useAction();
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {done && <span className="text-xs text-zinc-500">{done}</span>}
      {error && <span className="text-xs text-rose-600">{error}</span>}
      <button type="button" disabled={pending} onClick={() => run(syncOrganizationsAction, (r) => r.ok && setDone(`Synced ${r.id} from Clerk`))} className={SECONDARY}>
        {pending ? "Syncing…" : "Sync from Clerk"}
      </button>
    </div>
  );
}

export function NewOrganizationForm() {
  const router = useRouter();
  const { pending, error, fieldErrors, run } = useAction();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createOrganizationAction({ name, owner_email: owner }), (r) => r.ok && r.id && router.push(`/admin/orgs/${encodeURIComponent(r.id)}`));
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Company name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!fieldErrors.name} placeholder="Acme Devices" className={INPUT} />
        {fieldErrors.name && <span className="text-xs text-rose-600">{fieldErrors.name}</span>}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Owner email</span>
        <input value={owner} onChange={(e) => setOwner(e.target.value)} type="email" aria-invalid={!!fieldErrors.owner_email} placeholder="head-of-test@acmedevices.com" className={INPUT} />
        <span className="text-xs text-zinc-500">{fieldErrors.owner_email ?? "They get an invite to join as the organization's admin. Optional."}</span>
      </label>
      {error && !Object.keys(fieldErrors).length && <p className="text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Creating…" : "Create organization"}
      </button>
    </form>
  );
}

// One organization ------------------------------------------------------------------------

export function OrganizationForm({ tenant }: { tenant: OrganizationDetail["tenant"] }) {
  const { pending, error, fieldErrors, run } = useAction();
  const [v, setV] = useState({ name: tenant.name, status: tenant.status, status_reason: tenant.status_reason ?? "", admin_notes: tenant.admin_notes ?? "" });
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof v, value: string) => {
    setV((s) => ({ ...s, [k]: value }));
    setSaved(false);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.status !== tenant.status && v.status !== "active" && !confirm(`${v.status === "suspended" ? "Suspend" : "Archive"} ${tenant.name || "this organization"}? Its members are locked out and no alerts go out.`))
          return;
        run(() => updateOrganizationAction(tenant.id, { ...v, status_reason: v.status === "active" ? null : v.status_reason }), () => setSaved(true));
      }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Name</span>
        <input value={v.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!fieldErrors.name} className={INPUT} />
        {fieldErrors.name && <span className="text-xs text-rose-600">{fieldErrors.name}</span>}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Status</span>
        <select value={v.status} onChange={(e) => set("status", e.target.value)} className={INPUT}>
          <option value="active">Active</option>
          <option value="suspended">Suspended (locked out, no alerts)</option>
          <option value="archived">Archived (can be deleted later)</option>
        </select>
      </label>
      {v.status !== "active" && (
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-zinc-700">Reason</span>
          <input value={v.status_reason} onChange={(e) => set("status_reason", e.target.value)} placeholder="Unpaid since September" className={INPUT} />
        </label>
      )}
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium text-zinc-700">Internal notes</span>
        <textarea
          value={v.admin_notes}
          onChange={(e) => set("admin_notes", e.target.value)}
          rows={3}
          placeholder="Plan, billing contact, onboarding status… Only FIXT staff see this."
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-zinc-500">Saved</span>}
        {error && <span className="text-sm text-rose-600">{error}</span>}
      </div>
    </form>
  );
}
