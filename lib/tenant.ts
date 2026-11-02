import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

// Which organization a request acts for. This is the only place that decides
// it: lib/crm/*, lib/quickbooks/* and the admin pages all start here.
//
// * A member works in their active Clerk organization. Every user must be in
//   one; there is no personal (user-level) workspace.
// * A platform admin (an email in platform_admins, verified in Clerk) can open
//   any organization. That choice lives in a cookie, but the cookie only counts
//   after the server re-checks that the user is an admin, on every request.
// * Suspended and archived organizations lock their members out.

export const ACTING_COOKIE = "fixt_acting_org";
const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Admin status costs a Clerk API call, so it's remembered per server instance
// for a few minutes (seconds in development). Removing someone from
// platform_admins takes effect within that.
const ADMIN_TTL_MS = process.env.NODE_ENV === "production" ? 5 * 60_000 : 5_000;
const adminCache = new Map<string, { email: string | null; at: number }>();

/** The admin email the user signs in with, when they're a platform admin; else null. */
export async function platformAdminEmail(userId: string): Promise<string | null> {
  // The cache reads the clock, which Next only allows per request.
  await connection();
  const hit = adminCache.get(userId);
  if (hit && Date.now() - hit.at < ADMIN_TTL_MS) return hit.email;
  const user = await (await clerkClient()).users.getUser(userId);
  const verified = user.emailAddresses
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress.toLowerCase());
  let email: string | null = null;
  if (verified.length) {
    const { data, error } = await createAdminSupabase().from("platform_admins").select("email").in("email", verified).limit(1);
    if (error) throw new Error(`Failed to check admin access: ${error.message}`);
    email = (data?.[0]?.email as string | undefined) ?? null;
  }
  if (adminCache.size > 5000) adminCache.clear();
  adminCache.set(userId, { email, at: Date.now() });
  return email;
}

/** For tests: forget cached admin lookups. */
export const clearAdminCache = () => adminCache.clear();

export type TenantContext = {
  userId: string;
  tenantId: string;
  /** The user's role in the organization (e.g. "org:admin"), or null when an admin has opened it. */
  orgRole: string | null;
  /** Set when a platform admin is working inside an organization that isn't their own. */
  actingAsAdmin: { email: string } | null;
};

export const currentTenant = cache(async (): Promise<TenantContext> => {
  const { userId, orgId, orgRole } = await auth.protect();
  const acting = (await cookies()).get(ACTING_COOKIE)?.value;
  const db = createAdminSupabase();

  if (acting || !orgId) {
    const adminEmail = await platformAdminEmail(userId);
    if (adminEmail && acting && TENANT_ID.test(acting) && acting !== orgId) {
      // An admin opening an organization never creates one.
      const { data, error } = await db.from("tenants").select("id").eq("id", acting).maybeSingle();
      if (error) throw new Error(`Failed to load organization: ${error.message}`);
      if (!data) redirect("/admin");
      return { userId, tenantId: acting, orgRole: null, actingAsAdmin: { email: adminEmail } };
    }
    if (!orgId) redirect(adminEmail ? "/admin" : "/sign-in/tasks");
  }

  const { data: status, error } = await db.rpc("platform_touch_tenant", { p_id: orgId });
  if (error) throw new Error(`Failed to load organization: ${error.message}`);
  if (status !== "active") redirect("/suspended");
  return { userId, tenantId: orgId!, orgRole: orgRole ?? null, actingAsAdmin: null };
});

/** An organization's name, for the admin banner. */
export async function tenantName(id: string) {
  const { data } = await createAdminSupabase().from("tenants").select("name").eq("id", id).maybeSingle<{ name: string }>();
  return data?.name ?? null;
}

// Admin access ---------------------------------------------------------------------------

export type AdminContext = { userId: string; email: string };

/** For admin pages and actions: a 404 for anyone who isn't a platform admin. */
export const requireAdmin = cache(async (): Promise<AdminContext> => {
  const { userId } = await auth.protect();
  const email = await platformAdminEmail(userId);
  if (!email) notFound();
  return { userId, email };
});

/** Whether the signed-in user is a platform admin, for showing the Admin link. Never throws. */
export async function isPlatformAdmin() {
  try {
    const { userId } = await auth();
    return userId ? (await platformAdminEmail(userId)) !== null : false;
  } catch {
    return false;
  }
}

/** Records something an admin did. Every admin write calls this. */
export async function auditAdmin(admin: AdminContext, action: string, tenantId: string | null, details: Record<string, unknown> = {}) {
  const { error } = await createAdminSupabase()
    .from("admin_audit_log")
    .insert({ admin_user_id: admin.userId, admin_email: admin.email, tenant_id: tenantId, action, details });
  if (error) throw new Error(`Failed to write audit log: ${error.message}`);
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 8 * 60 * 60,
};

/** Opens an organization as a platform admin, for the rest of the browser session (8 hours at most). */
export async function startActingAs(tenantId: string) {
  const admin = await requireAdmin();
  if (!TENANT_ID.test(tenantId)) notFound();
  const { data, error } = await createAdminSupabase().from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`Failed to load organization: ${error.message}`);
  if (!data) notFound();
  await auditAdmin(admin, "open_organization", tenantId);
  (await cookies()).set(ACTING_COOKIE, tenantId, cookieOptions);
}

export async function stopActingAs() {
  const admin = await requireAdmin();
  const jar = await cookies();
  const tenantId = jar.get(ACTING_COOKIE)?.value ?? null;
  jar.delete(ACTING_COOKIE);
  if (tenantId && TENANT_ID.test(tenantId)) await auditAdmin(admin, "close_organization", tenantId).catch(() => undefined);
}
