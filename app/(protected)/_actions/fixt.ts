"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { deleteConversation } from "@/lib/ai/assistant";
import { diagnose, generateTestPlan } from "@/lib/ai/fixt";
import { AiBlocked, AiFailed } from "@/lib/ai/run";
import { sendWeeklySummary, writeWeeklySummary } from "@/lib/ai/summary";
import * as repo from "@/lib/fixt/repo";
import { emailReady, testChannel } from "@/lib/fixt/notify";
import { clearFleetData, loadDemoData } from "@/lib/fixt/seed";
import { AUTONOMY, BRINGUP_STAGES, type Alert, type Investigation, type Severity } from "@/lib/fixt/types";
import { isConnectorKind, isRole, isSeverity, isShift, isUuid, parseBringup, parseChannel, parseComment, parseConnectorConfig, parseLimits, parseSettings } from "@/lib/fixt/validate";
import { currentTenant } from "@/lib/tenant";

// Server actions for every FIXT page. Each one checks the session first;
// lib/fixt/repo scopes to the caller's organization. Arguments come from the
// browser, so they're validated here before anything else runs.

export type ActionResult<T = undefined> = { ok: true; value?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const GONE: ActionResult<never> = { ok: false, error: "That no longer exists. Refresh the page." };
const BAD: ActionResult<never> = { ok: false, error: "Invalid request" };

async function run<T>(fn: () => Promise<T | false | null>, revalidate: string | null = "/"): Promise<ActionResult<T>> {
  try {
    await requireUser();
    const value = await fn();
    if (value === false || value === null) return GONE;
    if (revalidate) revalidatePath(revalidate, "layout");
    return { ok: true, value: value === true ? undefined : (value as T) };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof repo.FixtError || err instanceof AiBlocked || err instanceof AiFailed) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Members only; contract-manufacturer partners can't change the line. */
async function requireEditor() {
  const { userId, orgRole } = await currentTenant();
  const roles = await repo.listRoles();
  if (roles[userId] === "cm_partner" && orgRole !== "org:admin") throw new repo.FixtError("Contract manufacturer accounts can view but not change this.");
}

async function requireOrgAdmin() {
  const { orgRole, actingAsAdmin } = await currentTenant();
  if (orgRole !== "org:admin" && !actingAsAdmin) throw new repo.FixtError("Only organization admins can change this.");
}

// Demo data -----------------------------------------------------------------------------

export async function loadDemoAction() {
  return run(async () => {
    await requireOrgAdmin();
    await loadDemoData();
    return true;
  });
}

export async function clearFleetAction(confirm: unknown) {
  if (confirm !== "DELETE") return { ok: false, error: 'Type DELETE to confirm' } satisfies ActionResult;
  return run(async () => {
    await requireOrgAdmin();
    await clearFleetData();
    return true;
  });
}

// Limits --------------------------------------------------------------------------------

/** Sends new limits for a test to Approvals; nothing changes on the line until someone approves. */
export async function proposeLimitsAction(testId: unknown, input: unknown): Promise<ActionResult<string>> {
  if (!isUuid(testId)) return BAD;
  const parsed = parseLimits(input);
  if ("errors" in parsed) return { ok: false, error: "Check the limits", fieldErrors: parsed.errors };
  const { lsl, usl, rationale } = parsed.fields;
  return run(async () => {
    await requireEditor();
    return repo.proposeLimitChange(testId, { lsl, usl }, rationale);
  });
}

// Approvals -----------------------------------------------------------------------------

export async function decideActionAction(id: unknown, approve: unknown, note: unknown) {
  if (!isUuid(id) || typeof approve !== "boolean") return BAD;
  const n = typeof note === "string" && note.trim() ? note.trim().slice(0, 1000) : null;
  return run(async () => {
    await requireEditor();
    return repo.decideAction(id, approve, n);
  });
}

export async function rollbackActionAction(id: unknown) {
  if (!isUuid(id)) return BAD;
  return run(async () => {
    await requireEditor();
    return repo.rollbackAction(id);
  });
}

export async function setAutonomyAction(lineId: unknown, autonomy: unknown) {
  if (!isUuid(lineId) || !AUTONOMY.some((a) => a.key === autonomy)) return BAD;
  return run(async () => {
    await requireOrgAdmin();
    return repo.setAutonomy(lineId, autonomy as (typeof AUTONOMY)[number]["key"]);
  });
}

// Alerts --------------------------------------------------------------------------------

const ALERT_STATUSES: Alert["status"][] = ["open", "acknowledged", "resolved", "suppressed"];

export async function setAlertStatusAction(id: unknown, status: unknown) {
  if (!isUuid(id) || !ALERT_STATUSES.includes(status as Alert["status"])) return BAD;
  return run(async () => {
    await requireEditor();
    return repo.setAlertStatus(id, status as Alert["status"]);
  });
}

export async function investigateAlertAction(id: unknown) {
  if (!isUuid(id)) return BAD;
  return run<string>(async () => {
    await requireEditor();
    return repo.investigateAlert(id);
  });
}

// Investigations ------------------------------------------------------------------------

const INV_STATUSES: Investigation["status"][] = ["open", "testing", "root_caused", "closed"];

export async function updateInvestigationAction(id: unknown, input: unknown) {
  if (!isUuid(id)) return BAD;
  const o = (input ?? {}) as Record<string, unknown>;
  const fields: Parameters<typeof repo.updateInvestigation>[1] = {};
  if (o.status !== undefined) {
    if (!INV_STATUSES.includes(o.status as Investigation["status"])) return BAD;
    fields.status = o.status as Investigation["status"];
  }
  if (o.severity !== undefined) {
    if (!isSeverity(o.severity)) return BAD;
    fields.severity = o.severity;
  }
  if (o.assignee !== undefined) {
    const name = typeof o.assignee === "string" ? o.assignee.trim().slice(0, 120) : "";
    fields.assignee_name = name || null;
    fields.assignee_id = null;
  }
  return run(async () => {
    await requireEditor();
    return repo.updateInvestigation(id, fields);
  });
}

export async function assignToMeAction(id: unknown) {
  if (!isUuid(id)) return BAD;
  return run(async () => {
    await requireEditor();
    const me = await repo.actor();
    return repo.updateInvestigation(id, { assignee_id: me.id, assignee_name: me.name });
  });
}

export async function diagnoseAction(id: unknown) {
  if (!isUuid(id)) return BAD;
  return run(async () => {
    await requireEditor();
    return diagnose(id);
  });
}

export async function runSuggestedTestAction(id: unknown) {
  if (!isUuid(id)) return BAD;
  return run<string>(async () => {
    await requireEditor();
    return repo.runSuggestedTest(id);
  });
}

export async function addCommentAction(id: unknown, body: unknown) {
  const text = parseComment(body);
  if (!isUuid(id)) return BAD;
  if (!text) return { ok: false, error: "Write a comment first (4,000 characters at most)." } satisfies ActionResult;
  return run(() => repo.addComment(id, text));
}

export async function feedbackAction(id: unknown, verdict: unknown, note: unknown) {
  if (!isUuid(id) || !["right", "partly", "wrong"].includes(verdict as string)) return BAD;
  const n = typeof note === "string" && note.trim() ? note.trim().slice(0, 1000) : null;
  return run(() => repo.giveFeedback(id, verdict as "right" | "partly" | "wrong", n));
}

export async function setSharingAction(id: unknown, on: unknown) {
  if (!isUuid(id) || typeof on !== "boolean") return BAD;
  return run<string | undefined>(async () => {
    await requireEditor();
    return (await repo.setSharing(id, on)) ?? undefined;
  });
}

// Bring-up ------------------------------------------------------------------------------

export async function createBringupAction(input: unknown) {
  const parsed = parseBringup(input);
  if ("errors" in parsed) return { ok: false, error: "Check the highlighted fields", fieldErrors: parsed.errors } satisfies ActionResult;
  return run<string>(async () => {
    await requireEditor();
    return repo.createBringup(parsed.fields);
  });
}

export async function updateBringupAction(id: unknown, input: unknown) {
  if (!isUuid(id)) return BAD;
  const o = (input ?? {}) as Record<string, unknown>;
  const fields: Parameters<typeof repo.updateBringup>[1] = {};
  if (o.stage !== undefined) {
    if (!BRINGUP_STAGES.some((s) => s.key === o.stage)) return BAD;
    fields.stage = o.stage as (typeof BRINGUP_STAGES)[number]["key"];
  }
  if (o.golden_units !== undefined) {
    const n = Number(o.golden_units);
    if (!Number.isInteger(n) || n < 0 || n > 1000) return BAD;
    fields.golden_units = n;
  }
  if (o.design_notes !== undefined) {
    if (typeof o.design_notes !== "string" || o.design_notes.length > 20000) return { ok: false, error: "Keep design notes under 20,000 characters" } satisfies ActionResult;
    fields.design_notes = o.design_notes.trim() || null;
  }
  return run(async () => {
    await requireEditor();
    return repo.updateBringup(id, fields);
  });
}

export async function generatePlanAction(id: unknown) {
  if (!isUuid(id)) return BAD;
  return run(async () => {
    await requireEditor();
    return generateTestPlan(id);
  });
}

// Collaboration -------------------------------------------------------------------------

export async function addHandoffAction(lineId: unknown, shift: unknown, body: unknown) {
  const text = parseComment(body);
  if (!isUuid(lineId) || !isShift(shift)) return BAD;
  if (!text) return { ok: false, error: "Write the handoff note first." } satisfies ActionResult;
  return run(() => repo.addHandoff(lineId, shift, text));
}

// Integrations --------------------------------------------------------------------------

export async function createConnectorAction(kind: unknown, name: unknown, config: unknown = {}) {
  const n = typeof name === "string" ? name.trim().slice(0, 120) : "";
  if (!isConnectorKind(kind)) return BAD;
  if (!n) return { ok: false, error: "Name the connector", fieldErrors: { name: "Required" } } satisfies ActionResult;
  const parsed = parseConnectorConfig(kind, config);
  if ("errors" in parsed) return { ok: false, error: "Check the highlighted fields", fieldErrors: parsed.errors } satisfies ActionResult;
  return run<{ id: string; key: string | null }>(async () => {
    await requireOrgAdmin();
    return repo.createConnector(kind, n, parsed.fields);
  });
}

export async function syncConnectorAction(id: unknown) {
  if (!isUuid(id)) return BAD;
  return run(async () => {
    await requireOrgAdmin();
    return repo.syncPreviewConnector(id);
  });
}

export async function rotateConnectorKeyAction(id: unknown) {
  if (!isUuid(id)) return BAD;
  return run<string>(async () => {
    await requireOrgAdmin();
    return repo.rotateConnectorKey(id);
  });
}

export async function setConnectorStatusAction(id: unknown, status: unknown) {
  if (!isUuid(id) || (status !== "connected" && status !== "paused")) return BAD;
  return run(async () => {
    await requireOrgAdmin();
    return repo.setConnectorStatus(id, status);
  });
}

export async function removeConnectorAction(id: unknown) {
  if (!isUuid(id)) return BAD;
  return run(async () => {
    await requireOrgAdmin();
    return repo.removeConnector(id);
  });
}

export async function addChannelAction(input: unknown) {
  const parsed = parseChannel(input);
  if ("errors" in parsed) return { ok: false, error: "Check the highlighted fields", fieldErrors: parsed.errors } satisfies ActionResult;
  if (parsed.fields.kind === "email" && !emailReady()) return { ok: false, error: "Email alerts need RESEND_API_KEY and EMAIL_FROM set on the server." } satisfies ActionResult;
  return run<string>(async () => {
    await requireOrgAdmin();
    return repo.addChannel(parsed.fields);
  });
}

export async function updateChannelAction(id: unknown, input: unknown) {
  if (!isUuid(id)) return BAD;
  const o = (input ?? {}) as Record<string, unknown>;
  const fields: { enabled?: boolean; min_severity?: Severity } = {};
  if (typeof o.enabled === "boolean") fields.enabled = o.enabled;
  if (o.min_severity !== undefined) {
    if (!isSeverity(o.min_severity)) return BAD;
    fields.min_severity = o.min_severity;
  }
  return run(async () => {
    await requireOrgAdmin();
    return repo.updateChannel(id, fields);
  });
}

export async function removeChannelAction(id: unknown) {
  if (!isUuid(id)) return BAD;
  return run(async () => {
    await requireOrgAdmin();
    return repo.removeChannel(id);
  });
}

export async function testChannelAction(id: unknown) {
  if (!isUuid(id)) return BAD;
  return run(async () => {
    await requireOrgAdmin();
    const c = (await repo.listChannels()).find((x) => x.id === id);
    if (!c) return null;
    try {
      await testChannel(c);
    } catch (err) {
      throw new repo.FixtError(`The test didn't go through: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300));
    }
    return true;
  }, null);
}

// Team & settings -----------------------------------------------------------------------

export async function setRoleAction(userId: unknown, role: unknown) {
  if (typeof userId !== "string" || !/^user_[A-Za-z0-9]{1,60}$/.test(userId) || !isRole(role)) return BAD;
  return run(async () => {
    await requireOrgAdmin();
    await repo.setRole(userId, role);
    return true;
  });
}

export async function updateSettingsAction(input: unknown) {
  const parsed = parseSettings(input);
  if ("errors" in parsed) return { ok: false, error: "Check the highlighted fields", fieldErrors: parsed.errors } satisfies ActionResult;
  return run(async () => {
    await requireOrgAdmin();
    await repo.updateSettings(parsed.fields);
    return true;
  });
}

export async function previewSummaryAction() {
  return run<{ subject: string; body: string }>(async () => {
    const { tenantId } = await currentTenant();
    return writeWeeklySummary(tenantId);
  }, null);
}

export async function sendSummaryNowAction() {
  return run<string>(async () => {
    await requireOrgAdmin();
    if (!emailReady()) throw new repo.FixtError("Email isn't set up yet (RESEND_API_KEY and EMAIL_FROM).");
    const { tenantId } = await currentTenant();
    const s = await repo.getSettings();
    if (!s.weekly_summary_to) throw new repo.FixtError("Add recipients and save first.");
    return (await sendWeeklySummary(tenantId, s.weekly_summary_to)).subject;
  });
}

// Assistant -----------------------------------------------------------------------------

export async function deleteConversationAction(id: unknown) {
  if (!isUuid(id)) return { ok: false, error: "That conversation no longer exists." } satisfies ActionResult;
  return run(async () => ((await deleteConversation(id)) ? true : null), "/assistant");
}
