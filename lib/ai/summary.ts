import "server-only";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { computeRoi, summarizeYield } from "@/lib/fixt/metrics";
import { duration, moneyShort, percent } from "@/lib/fixt/format";
import { absolute, sendEmail } from "@/lib/fixt/notify";
import { DEFAULT_SETTINGS, type Alert, type Failure, type Investigation, type Settings, type YieldRow } from "@/lib/fixt/types";
import { WEEKLY_SUMMARY_SYSTEM } from "./prompts";
import { AiBlocked, runAi } from "./run";
import { clip, plain } from "./text";

// The Monday summary for the head of manufacturing. Runs from the scheduler
// (no session) for every organization that turned it on, so it takes the
// tenant id explicitly and every query filters by it. When AI is off or out of
// budget it still sends the numbers, written by a template.

const SummarySchema = z.object({ subject: z.string(), body: z.string() });

const DAY = 86_400_000;

/** Last week's numbers for one organization, as plain facts. */
export async function weeklyFacts(tenantId: string, now = Date.now()) {
  const db = createAdminSupabase();
  const since = new Date(now - 14 * DAY);
  const q = <T>(r: { data: T | null; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data!;
  };
  const [tenant, settingsRow, lines, yieldRows, alerts, investigations, failures, actions] = await Promise.all([
    db.from("tenants").select("name").eq("id", tenantId).single<{ name: string }>().then(q),
    db.from("fx_settings").select("*").eq("tenant_id", tenantId).maybeSingle<Settings>().then(q),
    db.from("fx_lines").select("id, name").eq("tenant_id", tenantId).returns<{ id: string; name: string }[]>().then(q),
    db.from("fx_yield").select("line_id, day, shift, units, first_pass, final_pass").eq("tenant_id", tenantId).gte("day", since.toISOString().slice(0, 10)).returns<YieldRow[]>().then(q),
    db.from("fx_alerts").select("*").eq("tenant_id", tenantId).gte("detected_at", since.toISOString()).returns<Alert[]>().then(q),
    db.from("fx_investigations").select("*").eq("tenant_id", tenantId).returns<Investigation[]>().then(q),
    db.from("fx_failures").select("*").eq("tenant_id", tenantId).gte("failed_at", since.toISOString()).returns<Failure[]>().then(q),
    db.from("fx_actions").select("status, title, proposed_at").eq("tenant_id", tenantId).gte("proposed_at", new Date(now - 7 * DAY).toISOString()).returns<{ status: string; title: string; proposed_at: string }[]>().then(q),
  ]);
  const settings = { ...DEFAULT_SETTINGS, ...(settingsRow ?? {}) } as Settings;
  for (const k of ["engineer_hourly_rate", "escape_cost", "fixt_annual_price", "baseline_root_cause_hours"] as const) settings[k] = Number(settings[k]);
  const weekStart = new Date(now - 7 * DAY).toISOString().slice(0, 10);
  const thisWeek = yieldRows.filter((y) => y.day >= weekStart);
  const lastWeek = yieldRows.filter((y) => y.day < weekStart);
  const roi = computeRoi({ alerts, investigations, failures, settings, days: 7, now });
  const open = investigations.filter((i) => i.status === "open" || i.status === "testing");

  const facts = [
    `Organization: ${tenant.name || tenantId}`,
    `Week ending ${new Date(now).toISOString().slice(0, 10)}`,
    `First-pass yield: ${percent(summarizeYield(thisWeek).fpy)} (week before: ${percent(summarizeYield(lastWeek).fpy)}). Units tested: ${summarizeYield(thisWeek).units.toLocaleString()}.`,
    "By line: " + lines.map((l) => `${l.name} ${percent(summarizeYield(thisWeek.filter((y) => y.line_id === l.id)).fpy)}`).join("; "),
    `Alerts raised by agents: ${roi.catches}. Investigations root-caused: ${roi.rootCaused}, median time to root cause ${duration(roi.medianHoursToRootCause)} (before FIXT: ${duration(roi.baselineHours)}).`,
    `Still open: ${open.length}` + (open.length ? ` (${open.slice(0, 5).map((i) => `INV-${i.number} ${i.title} [${i.status}${i.assignee_name ? `, ${i.assignee_name}` : ""}]`).join("; ")})` : ""),
    `Agent changes: ${actions.filter((a) => a.status === "applied").length} applied, ${actions.filter((a) => a.status === "proposed").length} waiting for approval, ${actions.filter((a) => a.status === "rejected").length} rejected, ${actions.filter((a) => a.status === "rolled_back").length} rolled back.`,
    `Field returns this week: ${roi.fieldEscapes}.`,
    `Value this week: ${moneyShort(roi.value.total)} (${Math.round(roi.engineerHoursSaved)} engineer-hours saved, ${roi.escapesPrevented} escapes prevented) against ${moneyShort(roi.cost)} of FIXT cost.`,
  ];
  return { settings, facts: facts.join("\n"), roi, link: absolute("/roi") };
}

/** Writes the email. Falls back to the facts themselves when AI can't run. */
export async function writeWeeklySummary(tenantId: string) {
  const { facts, roi, link } = await weeklyFacts(tenantId);
  let subject = `FIXT weekly: ${moneyShort(roi.value.total)} saved, ${roi.catches} catches`;
  let body = facts;
  try {
    const { value } = await runAi({ tenantId, userId: null }, "weekly_summary", async ({ model, config }) =>
      model.withStructuredOutput(SummarySchema, { method: "jsonSchema", name: "weekly_summary" }).invoke(
        [
          { role: "system", content: WEEKLY_SUMMARY_SYSTEM },
          { role: "user", content: `<record>\n${facts}\n</record>` },
        ],
        config,
      ),
    );
    const parsed = SummarySchema.safeParse(value);
    if (parsed.success && parsed.data.body.trim()) {
      subject = clip(plain(parsed.data.subject), 120);
      body = parsed.data.body.trim().slice(0, 4000);
    }
  } catch (err) {
    if (!(err instanceof AiBlocked)) console.error("Weekly summary AI failed; sending the numbers instead", err);
  }
  return { subject, body: link ? `${body}\n\nFull ROI: ${link}` : body };
}

/** Sends the summary to an organization's recipients and stamps when. */
export async function sendWeeklySummary(tenantId: string, to: string) {
  const { subject, body } = await writeWeeklySummary(tenantId);
  await sendEmail(
    to.split(",").map((e) => e.trim()).filter(Boolean),
    subject,
    body,
  );
  await createAdminSupabase().from("fx_settings").update({ weekly_summary_sent_at: new Date().toISOString() }).eq("tenant_id", tenantId);
  return { subject };
}

/** Every organization due a summary: turned on, has recipients, not sent in the last 6 days. */
export async function dueWeeklySummaries() {
  const { data, error } = await createAdminSupabase()
    .from("fx_settings")
    .select("tenant_id, weekly_summary_to, weekly_summary_sent_at, tenants!inner(status)")
    .eq("weekly_summary_enabled", true)
    .eq("tenants.status", "active")
    .not("weekly_summary_to", "is", null)
    .returns<{ tenant_id: string; weekly_summary_to: string; weekly_summary_sent_at: string | null }[]>();
  if (error) throw new Error(`Failed to load summaries: ${error.message}`);
  const cutoff = Date.now() - 6 * DAY;
  return (data ?? []).filter((s) => !s.weekly_summary_sent_at || Date.parse(s.weekly_summary_sent_at) < cutoff);
}
