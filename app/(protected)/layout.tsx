import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { countPendingApprovals, listAlerts } from "@/lib/fixt/repo";
import { currentTenant, isPlatformAdmin, tenantName } from "@/lib/tenant";
import { exitOrganizationAction } from "../admin/actions";
import Sidebar from "./_ui/Sidebar";
import Topbar from "./_ui/Topbar";

// Every route in this group blocks on the session check before anything
// renders, so it opts out of instant-navigation validation.
export const instant = false;

// Second line of defense after the proxy. Pages in this group must still call
// requireUser() themselves, since layouts don't re-run on client navigation.
export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  // Resolves the organization (or sends the user to pick one / to the suspended page).
  const tenant = await currentTenant();
  const [approvals, issues, isAdmin, actingName] = await Promise.all([
    // Sidebar counts are a nice-to-have: never let them take the whole app down.
    countPendingApprovals().catch(() => 0),
    listAlerts({ status: ["open"] })
      .then((a) => a.length)
      .catch(() => 0),
    isPlatformAdmin(),
    tenant.actingAsAdmin ? tenantName(tenant.tenantId) : null,
  ]);
  const badges = { approvals, issues, isAdmin, workspace: tenant.actingAsAdmin ? actingName || tenant.tenantId : null };
  return (
    <div className="flex min-h-dvh w-full bg-white font-sans text-[#1a1a1a]">
      <Sidebar badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        {tenant.actingAsAdmin && (
          <div className="flex flex-wrap items-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-950 md:px-10">
            <span className="min-w-0 flex-1">
              Viewing <b className="font-semibold">{actingName || tenant.tenantId}</b> as a FIXT admin. Changes you make here are made for this organization.
            </span>
            <form action={exitOrganizationAction}>
              <button type="submit" className="rounded-md bg-amber-950 px-2.5 py-1 text-xs font-medium text-white hover:bg-black">
                Exit to admin
              </button>
            </form>
          </div>
        )}
        <Suspense fallback={<div className="h-[60px] border-b border-zinc-100" />}>
          <Topbar badges={badges} />
        </Suspense>
        <main className="flex-1 px-4 pb-16 pt-8 md:px-10">{children}</main>
      </div>
    </div>
  );
}
