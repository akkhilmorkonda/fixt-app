import { requireUser } from "@/lib/auth";
import { aiFeatures } from "@/lib/ai/fixt";
import { shortDate } from "@/lib/fixt/format";
import { emailReady } from "@/lib/fixt/notify";
import { getSettings, hasFleet } from "@/lib/fixt/repo";
import { currentTenant } from "@/lib/tenant";
import { Card } from "../_ui/kit";
import PageHeader from "../_ui/PageHeader";
import { DangerZone, LoadDemo, SettingsForm } from "./SettingsUI";

export const instant = false;

/** ROI assumptions, the weekly summary, deployment and data controls, and demo data. */
export default async function SettingsPage() {
  await requireUser();
  const [{ orgRole, actingAsAdmin }, settings, fleet, ai] = await Promise.all([currentTenant(), getSettings(), hasFleet(), aiFeatures().catch(() => null)]);
  const canEdit = orgRole === "org:admin" || !!actingAsAdmin;
  const on = ai ? [ai.assistant && "Ask FIXT", ai.diagnosis && "diagnosis", ai.testPlan && "test plans"].filter(Boolean) : [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker="Admin" title="Settings" />

      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-600">
        <span className="font-medium text-[#1a1a1a]">AI</span>
        <span>{on.length ? `On: ${on.join(", ")}` : "Off. Ask FIXT support to connect a model provider."}</span>
        <span>Email: {emailReady() ? "set up" : "not set up (weekly summary and email alerts need it)"}</span>
      </div>

      {!canEdit && <p className="mb-4 text-sm text-zinc-500">Only organization admins can change these settings.</p>}

      <SettingsForm settings={settings} canEdit={canEdit} emailReady={emailReady()} />

      <Card title="Demo data" className="mt-6">
        <div className="flex flex-col gap-3 px-4 py-4 text-sm leading-6 text-zinc-600">
          {fleet ? (
            <p>{settings.demo_loaded_at ? `Demo data was loaded on ${shortDate(settings.demo_loaded_at)}.` : "This organization has fleet data from its connectors."}</p>
          ) : (
            <>
              <p>No stations yet. Load a two-site demo fleet to see FIXT working: fixture drift, a bad component lot, false failures, a field return and a bring-up in EVT.</p>
              {canEdit && <LoadDemo />}
            </>
          )}
        </div>
      </Card>

      {canEdit && <DangerZone />}
    </div>
  );
}
