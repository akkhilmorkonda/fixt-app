import { clerkClient } from "@clerk/nextjs/server";
import { requireUser } from "@/lib/auth";
import { getSettings, listRoles } from "@/lib/fixt/repo";
import { ROLES, type Role } from "@/lib/fixt/types";
import { currentTenant } from "@/lib/tenant";
import { Card, Empty, Pill, TD, TH } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";
import { InviteAndSso, RoleSelect } from "./TeamUI";

export const instant = false;

type Member = { userId: string; name: string; email: string; clerkRole: string };

async function loadMembers(tenantId: string): Promise<{ members: Member[]; error: string | null }> {
  if (!tenantId.startsWith("org_")) return { members: [], error: "This organization isn't managed in Clerk, so its members can't be listed here." };
  try {
    const clerk = await clerkClient();
    const list = await clerk.organizations.getOrganizationMembershipList({ organizationId: tenantId, limit: 100 });
    return {
      members: list.data
        .filter((m) => m.publicUserData?.userId)
        .map((m) => ({
          userId: m.publicUserData!.userId,
          name: [m.publicUserData?.firstName, m.publicUserData?.lastName].filter(Boolean).join(" "),
          email: m.publicUserData?.identifier ?? "",
          clerkRole: m.role,
        })),
      error: null,
    };
  } catch (err) {
    console.error("Failed to load members", err);
    return { members: [], error: "Couldn't load members from Clerk. Try again in a minute." };
  }
}

/** Team & roles: who's in the organization and what FIXT lets each of them do. */
export default async function TeamPage() {
  await requireUser();
  const { tenantId, userId, orgRole, actingAsAdmin } = await currentTenant();
  const [{ members, error }, roles, settings] = await Promise.all([loadMembers(tenantId), listRoles(), getSettings()]);
  const canEdit = orgRole === "org:admin" || !!actingAsAdmin;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Admin" title="Team & roles" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Card title="Members">
            {error ? (
              <Empty text={error} />
            ) : members.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className={TH}>Person</th>
                      <th className={TH}>FIXT role</th>
                      <th className={TH}>Organization access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {members.map((m) => (
                      <tr key={m.userId}>
                        <td className={TD}>
                          <span className="font-medium">{m.name || m.email}</span>
                          {m.userId === userId && <span className="ml-1.5 text-xs text-zinc-400">(you)</span>}
                          {m.name && <span className="block text-xs text-zinc-500">{m.email}</span>}
                        </td>
                        <td className={TD}>
                          <RoleSelect userId={m.userId} role={(roles[m.userId] ?? "test_engineer") as Role} disabled={!canEdit} />
                        </td>
                        <td className={TD}>
                          <Pill>{m.clerkRole === "org:admin" ? "Admin" : "Member"}</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty text="No members yet." />
            )}
          </Card>
          <InviteAndSso />
        </div>

        <aside className="flex flex-col gap-6">
          <Card title="Roles">
            <ul className="flex flex-col gap-3 px-4 py-4">
              {ROLES.map((r) => (
                <li key={r.key} className="text-sm">
                  <span className="font-medium">{r.label}</span>
                  <span className="block text-xs leading-5 text-zinc-500">{r.hint}</span>
                </li>
              ))}
              <li className="border-t border-zinc-100 pt-3 text-xs leading-5 text-zinc-500">
                Organization admins can also change autonomy, connectors, alert routing and settings. Contract manufacturer accounts can view but never change the line.
              </li>
            </ul>
          </Card>
          <Card title="Single sign-on">
            <div className="flex flex-col gap-2 px-4 py-4 text-sm leading-6 text-zinc-600">
              <p>SAML or OIDC single sign-on (Okta, Entra ID, Google Workspace) is set up per email domain in the organization settings below, under Verified domains.</p>
              <p>{settings.sso_required ? "This organization requires SSO for everyone on its domain." : "SSO isn't required yet. Turn it on in Settings once your identity provider is connected."}</p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
