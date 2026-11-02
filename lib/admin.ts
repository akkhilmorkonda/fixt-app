import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { OrganizationFields } from "@/lib/admin-validate";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { auditAdmin, requireAdmin } from "@/lib/tenant";

/**
 * Platform admin data: every organization, across tenants. The only module
 * that reads or writes across organizations on behalf of a person. Every
 * function starts with requireAdmin() (a 404 for anyone else), and every write
 * is recorded in admin_audit_log. Inputs must already be validated.
 */

/** A problem the admin can fix; the message is safe to show. */
export class AdminError extends Error {}

const db = () => createAdminSupabase();

function must<T>(r: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (r.error) {
    if (r.error.code === "23505") throw new AdminError("That already exists");
    if (r.error.code === "23514") throw new AdminError("One of the values isn't allowed");
    throw new Error(`Failed to ${what}: ${r.error.message}`);
  }
  return r.data;
}

const isClerkOrg = (id: string) => id.startsWith("org_");

// Directory ------------------------------------------------------------------------------

export type OrganizationSummary = {
  id: string;
  name: string;
  status: "active" | "suspended" | "archived";
  created_at: string;
  stations: number;
  open_alerts: number;
  investigations_30d: number;
  pending_approvals: number;
  last_activity_at: string | null;
};

type CountFilter = { eq?: [string, string]; in?: [string, string[]]; gte?: [string, string] };

/** Counts per tenant for one table, from the rows' tenant_id. Staff pages only, never on member requests. */
async function countBy(table: string, f: CountFilter = {}) {
  const counts = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    let q = db().from(table).select("tenant_id");
    if (f.eq) q = q.eq(...f.eq);
    if (f.in) q = q.in(...f.in);
    if (f.gte) q = q.gte(...f.gte);
    const rows = must(await q.range(from, from + 999).returns<{ tenant_id: string }[]>(), `count ${table}`) ?? [];
    for (const row of rows) counts.set(row.tenant_id, (counts.get(row.tenant_id) ?? 0) + 1);
    if (rows.length < 1000) break;
  }
  return counts;
}

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  await requireAdmin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [tenants, stations, alerts, investigations, approvals, activity] = await Promise.all([
    db().from("tenants").select("id, name, status, created_at").order("created_at", { ascending: false }).returns<Pick<OrganizationSummary, "id" | "name" | "status" | "created_at">[]>(),
    countBy("fx_stations"),
    countBy("fx_alerts", { in: ["status", ["open", "acknowledged"]] }),
    countBy("fx_investigations", { gte: ["opened_at", since] }),
    countBy("fx_actions", { eq: ["status", "proposed"] }),
    db().from("fx_agent_log").select("tenant_id, at").gte("at", since).order("at", { ascending: false }).limit(5000).returns<{ tenant_id: string; at: string }[]>(),
  ]);
  const last = new Map<string, string>();
  for (const a of must(activity, "load activity") ?? []) if (!last.has(a.tenant_id)) last.set(a.tenant_id, a.at);
  return (must(tenants, "load organizations") ?? []).map((t) => ({
    ...t,
    stations: stations.get(t.id) ?? 0,
    open_alerts: alerts.get(t.id) ?? 0,
    investigations_30d: investigations.get(t.id) ?? 0,
    pending_approvals: approvals.get(t.id) ?? 0,
    last_activity_at: last.get(t.id) ?? null,
  }));
}

/** Registers every Clerk organization (and refreshes names), so ones nobody has signed in to yet show up too. */
export async function syncOrganizationsFromClerk() {
  const admin = await requireAdmin();
  const clerk = await clerkClient();
  const rows: { id: string; name: string }[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await clerk.organizations.getOrganizationList({ limit: 100, offset });
    rows.push(...page.data.map((o) => ({ id: o.id, name: o.name.slice(0, 120) })));
    if (page.data.length < 100) break;
  }
  if (rows.length) must(await db().from("tenants").upsert(rows, { onConflict: "id" }), "sync organizations");
  await auditAdmin(admin, "sync_organizations", null, { count: rows.length });
  return rows.length;
}

/** Creates an organization in Clerk (the admin becomes a member) and optionally invites its owner. */
export async function createOrganization(fields: { name: string; owner_email: string | null }) {
  const admin = await requireAdmin();
  const clerk = await clerkClient();
  const org = await clerk.organizations.createOrganization({ name: fields.name, createdBy: admin.userId });
  must(await db().from("tenants").upsert({ id: org.id, name: org.name.slice(0, 120) }, { onConflict: "id" }), "create organization");
  if (fields.owner_email) {
    await clerk.organizations.createOrganizationInvitation({
      organizationId: org.id,
      emailAddress: fields.owner_email,
      role: "org:admin",
      inviterUserId: admin.userId,
    });
  }
  await auditAdmin(admin, "create_organization", org.id, { name: fields.name, invited: fields.owner_email });
  return org.id;
}

// One organization ------------------------------------------------------------------------

export type OrganizationDetail = {
  tenant: { id: string; name: string; status: OrganizationSummary["status"]; status_reason: string | null; admin_notes: string | null; created_at: string };
  summary: OrganizationSummary | null;
  members: { userId: string | null; email: string; name: string; role: string }[];
  membersError: string | null;
  connectors: { id: string; kind: string; name: string; status: string; last_sync_at: string | null; records_synced: number }[];
  settings: { deployment: string; data_region: string; sso_required: boolean; weekly_summary_enabled: boolean; demo_loaded_at: string | null } | null;
  audit: { id: number; admin_email: string; action: string; details: Record<string, unknown>; created_at: string }[];
};

export async function getOrganization(id: string): Promise<OrganizationDetail | null> {
  await requireAdmin();
  const client = db();
  const tenant = must(
    await client.from("tenants").select("id, name, status, status_reason, admin_notes, created_at").eq("id", id).maybeSingle<OrganizationDetail["tenant"]>(),
    "load organization",
  );
  if (!tenant) return null;

  const [summary, connectors, settings, audit, members] = await Promise.all([
    listOrganizations().then((all) => all.find((o) => o.id === id) ?? null),
    client.from("fx_connectors").select("id, kind, name, status, last_sync_at, records_synced").eq("tenant_id", id).order("created_at").returns<OrganizationDetail["connectors"]>(),
    client.from("fx_settings").select("deployment, data_region, sso_required, weekly_summary_enabled, demo_loaded_at").eq("tenant_id", id).maybeSingle<NonNullable<OrganizationDetail["settings"]>>(),
    client
      .from("admin_audit_log")
      .select("id, admin_email, action, details, created_at")
      .eq("tenant_id", id)
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<OrganizationDetail["audit"]>(),
    loadMembers(id),
  ]);
  return {
    tenant,
    summary,
    members: members.members,
    membersError: members.error,
    connectors: (must(connectors, "load connectors") ?? []).map((c) => ({ ...c, records_synced: Number(c.records_synced) })),
    settings: must(settings, "load settings"),
    audit: must(audit, "load audit log") ?? [],
  };
}

async function loadMembers(id: string): Promise<{ members: OrganizationDetail["members"]; error: string | null }> {
  if (!isClerkOrg(id)) return { members: [], error: "Not a Clerk organization" };
  try {
    const clerk = await clerkClient();
    const list = await clerk.organizations.getOrganizationMembershipList({ organizationId: id, limit: 100 });
    return {
      members: list.data.map((m) => ({
        userId: m.publicUserData?.userId ?? null,
        email: m.publicUserData?.identifier ?? "",
        name: [m.publicUserData?.firstName, m.publicUserData?.lastName].filter(Boolean).join(" "),
        role: m.role,
      })),
      error: null,
    };
  } catch (err) {
    console.error("load members failed", id, err);
    return { members: [], error: "Couldn't load members from Clerk" };
  }
}

export async function updateOrganization(id: string, fields: OrganizationFields) {
  const admin = await requireAdmin();
  const before = must(await db().from("tenants").select("name, status").eq("id", id).maybeSingle<{ name: string; status: string }>(), "load organization");
  if (!before) return false;
  must(await db().from("tenants").update(fields).eq("id", id), "update organization");
  if (fields.name && fields.name !== before.name && isClerkOrg(id)) {
    try {
      await (await clerkClient()).organizations.updateOrganization(id, { name: fields.name });
    } catch (err) {
      console.error("Clerk rename failed", id, err);
    }
  }
  await auditAdmin(admin, before.status !== fields.status ? `set_status_${fields.status}` : "update_organization", id, { ...fields, admin_notes: fields.admin_notes ? "(updated)" : null });
  return true;
}

// Audit log --------------------------------------------------------------------------------

export async function recentAdminActivity(limit = 30) {
  await requireAdmin();
  return (
    must(
      await db()
        .from("admin_audit_log")
        .select("id, admin_email, tenant_id, action, details, created_at, tenants(name)")
        .order("created_at", { ascending: false })
        .limit(limit)
        .returns<{ id: number; admin_email: string; tenant_id: string | null; action: string; details: Record<string, unknown>; created_at: string; tenants: { name: string } | null }[]>(),
      "load audit log",
    ) ?? []
  );
}
