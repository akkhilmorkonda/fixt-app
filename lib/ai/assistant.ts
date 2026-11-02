import "server-only";
import { z } from "zod";
import { createAgent, modelCallLimitMiddleware, toolCallLimitMiddleware, anthropicPromptCachingMiddleware, tool } from "langchain";
import type { BaseMessage } from "@langchain/core/messages";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { currentTenant } from "@/lib/tenant";
import { getFleet, getStation, getYield, listActions, listAlerts, listFailures, listInvestigations, listLots } from "@/lib/fixt/repo";
import { classificationOf } from "@/lib/fixt/types";
import { costOfQuality, falseFailureStats, lotQuality, pareto, summarizeYield } from "@/lib/fixt/metrics";
import { cpk, mean } from "@/lib/fixt/spc";
import { isUuid } from "@/lib/fixt/validate";
import { investigationRecord } from "./fixt";
import { ASSISTANT_SYSTEM } from "./prompts";
import { getLimits, runAi } from "./run";

// Ask FIXT: a LangChain agent with read-only tools over the signed-in
// organization's own test data. The tools reach data only through
// lib/fixt/repo, which scopes every query to currentTenant(), so the model
// can't see another organization however it's prompted. Conversations are
// private to the member.

export const QUESTION_MAX = 2000;
const HISTORY = 20;

export type Conversation = { id: string; title: string; updated_at: string };
export type ChatMessage = { id: number; role: "user" | "assistant"; content: string; created_at: string };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// Tools ---------------------------------------------------------------------------------

const fleetStatus = tool(
  async () => {
    const [fleet, yieldRows, alerts] = await Promise.all([getFleet(), getYield(14), listAlerts({ status: ["open", "acknowledged"] })]);
    const recent = yieldRows.filter((y) => y.day >= new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10));
    return JSON.stringify({
      sites: fleet.sites.map((s) => s.name),
      lines: fleet.lines.map((l) => {
        const y = summarizeYield(recent.filter((r) => r.line_id === l.id));
        return {
          line: l.name,
          site: fleet.sites.find((s) => s.id === l.site_id)?.name,
          product: fleet.products.find((p) => p.id === l.product_id)?.name ?? null,
          autonomy: l.autonomy,
          first_pass_yield_7d: r3(y.fpy),
          final_yield_7d: r3(y.finalYield),
          units_7d: y.units,
        };
      }),
      stations: fleet.stations.map((s) => ({ id: s.id, name: s.name, kind: s.kind, status: s.status, line: fleet.lines.find((l) => l.id === s.line_id)?.name, open_alerts: alerts.filter((a) => a.station_id === s.id).length })),
    });
  },
  {
    name: "fleet_status",
    description: "Every site, line and station: status, line yield for the last 7 days, autonomy level and open alerts per station. Start here for most questions.",
    schema: z.object({}),
  },
);

const stationDetails = tool(
  async ({ station_id }) => {
    if (!isUuid(station_id)) return "No station with that id. Use fleet_status to get ids.";
    const d = await getStation(station_id, 200);
    if (!d) return "No station with that id. Use fleet_status to get ids.";
    return JSON.stringify({
      station: d.station,
      line: d.line?.name,
      tests: d.tests.map((t) => {
        const v = t.samples.map((m) => m.value).slice(-50);
        return {
          name: t.name,
          unit: t.unit,
          lsl: t.lsl,
          usl: t.usl,
          baseline_mean: t.baseline_mean,
          recent_mean: v.length ? r3(mean(v)) : null,
          cpk_recent: v.length ? (cpk(v, t.lsl, t.usl) ?? null) : null,
          recent_failures: t.samples.slice(-50).filter((m) => !m.passed).length,
          siblings: d.siblings.filter((s) => s.means[t.name] != null).map((s) => ({ station: s.station.name, mean: r3(s.means[t.name]) })),
        };
      }),
      alerts: d.alerts.slice(0, 10).map((a) => ({ title: a.title, kind: a.kind, status: a.status, severity: a.severity, detected: a.detected_at.slice(0, 10) })),
      pending_actions: d.actions.filter((a) => a.status === "proposed").map((a) => a.title),
    });
  },
  {
    name: "station_details",
    description: "One station: fixture health, calibration, sequence version, each test's limits, baseline, recent mean, Cpk, failures and sibling-station means, plus its alerts and pending agent actions.",
    schema: z.object({ station_id: z.string() }),
  },
);

const findAlerts = tool(
  async ({ status, kind }) => {
    const alerts = await listAlerts({ status: status?.length ? status : ["open", "acknowledged"], kind: kind?.length ? kind : undefined, limit: 40 });
    const fleet = await getFleet();
    return JSON.stringify(
      alerts.map((a) => ({
        title: a.title,
        station: fleet.stations.find((s) => s.id === a.station_id)?.name,
        station_id: a.station_id,
        kind: a.kind,
        classification: classificationOf(a.classification).label,
        severity: a.severity,
        units_at_risk: a.units_at_risk,
        baseline: a.baseline,
        current: a.current,
        unit: a.unit,
        started: a.started_at?.slice(0, 10) ?? null,
        status: a.status,
        investigation_id: a.investigation_id,
      })),
    );
  },
  {
    name: "find_alerts",
    description: "Drift, anomaly, false-failure, calibration and offline alerts. Defaults to open and acknowledged ones.",
    schema: z.object({
      status: z.array(z.enum(["open", "acknowledged", "resolved", "suppressed"])).optional(),
      kind: z.array(z.enum(["drift", "anomaly", "false_failure", "calibration", "offline", "yield"])).optional(),
    }),
  },
);

const findInvestigations = tool(
  async ({ status }) => {
    const rows = await listInvestigations({ status: status?.length ? status : undefined, limit: 40 });
    return JSON.stringify(
      rows.map((i) => ({
        id: i.id,
        number: `INV-${i.number}`,
        title: i.title,
        status: i.status,
        severity: i.severity,
        classification: classificationOf(i.classification).label,
        confidence: i.confidence,
        units_at_risk: i.units_at_risk,
        opened: i.opened_at.slice(0, 10),
        hours_to_root_cause: i.root_caused_at ? Math.round((Date.parse(i.root_caused_at) - Date.parse(i.opened_at)) / 360_000) / 10 : null,
        assignee: i.assignee_name,
      })),
    );
  },
  {
    name: "find_investigations",
    description: "Failure investigations with status, classification, the agent's confidence and time to root cause.",
    schema: z.object({ status: z.array(z.enum(["open", "testing", "root_caused", "closed"])).optional() }),
  },
);

const investigationDetails = tool(
  async ({ investigation_id }) => {
    if (!isUuid(investigation_id)) return "No investigation with that id. Use find_investigations to get ids.";
    const loaded = await investigationRecord(investigation_id);
    if (!loaded) return "No investigation with that id. Use find_investigations to get ids.";
    const i = loaded.investigation;
    return `${loaded.record}
Current hypothesis (${i.confidence != null ? Math.round(i.confidence * 100) : "?"}%): ${i.hypothesis ?? "none yet"}`;
  },
  {
    name: "investigation_details",
    description: "Everything about one investigation: the joined timeline, station data, comments, similar past failures and the current hypothesis.",
    schema: z.object({ investigation_id: z.string() }),
  },
);

const quality = tool(
  async ({ days }) => {
    const [failures, lots, fleet] = await Promise.all([listFailures(days ?? 30), listLots(), getFleet()]);
    const stationName = (id: string) => fleet.stations.find((s) => s.id === id)?.name ?? id;
    const ff = falseFailureStats(failures).slice(0, 8);
    return JSON.stringify({
      days: days ?? 30,
      failures: failures.length,
      field_returns: failures.filter((f) => f.escaped).length,
      by_mode: pareto(failures, (f) => f.mode).slice(0, 10),
      by_station: pareto(failures, (f) => stationName(f.station_id)).slice(0, 10),
      by_shift: pareto(failures, (f) => f.shift),
      false_failures: ff.map((s) => ({ station: stationName(s.station_id), failures: s.failures, retest_pass_rate: r3(s.retestPassRate) })),
      lots: lotQuality(lots, failures).slice(0, 10).map((l) => ({ lot: l.lot_code, part: l.part, supplier: l.supplier, ppm: l.ppm, failures: l.failures, quarantined: l.quarantined })),
      cost_of_quality: costOfQuality(failures, 95),
    });
  },
  {
    name: "quality_report",
    description: "Failure Pareto by mode, station and shift; false-failure rates; component-lot and supplier quality in ppm; and scrap, rework and retest totals over the last N days (default 30).",
    schema: z.object({ days: z.number().int().min(1).max(90).optional() }),
  },
);

const pendingApprovals = tool(
  async () => {
    const [actions, fleet] = await Promise.all([listActions({ status: ["proposed"] }), getFleet()]);
    return JSON.stringify(actions.map((a) => ({ title: a.title, kind: a.kind, station: fleet.stations.find((s) => s.id === a.station_id)?.name, proposed: a.proposed_at.slice(0, 10), rationale: a.rationale })));
  },
  {
    name: "pending_approvals",
    description: "Changes the agents have proposed that are waiting for a person to approve.",
    schema: z.object({}),
  },
);

const TOOLS = [fleetStatus, stationDetails, findAlerts, findInvestigations, investigationDetails, quality, pendingApprovals];

// Conversations -------------------------------------------------------------------------

async function me() {
  const { tenantId, userId } = await currentTenant();
  return { tenantId, userId, db: createAdminSupabase() };
}

export async function listConversations(): Promise<Conversation[]> {
  const { tenantId, userId, db } = await me();
  const { data, error } = await db
    .from("ai_conversations")
    .select("id, title, updated_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50)
    .returns<Conversation[]>();
  if (error) throw new Error(`Failed to load conversations: ${error.message}`);
  return data ?? [];
}

export async function getConversation(id: string): Promise<{ conversation: Conversation; messages: ChatMessage[] } | null> {
  if (!isUuid(id)) return null;
  const { tenantId, userId, db } = await me();
  const { data: conversation, error } = await db
    .from("ai_conversations")
    .select("id, title, updated_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle<Conversation>();
  if (error) throw new Error(`Failed to load conversation: ${error.message}`);
  if (!conversation) return null;
  const { data: messages, error: e2 } = await db
    .from("ai_messages")
    .select("id, role, content, created_at")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", id)
    .order("id")
    .returns<ChatMessage[]>();
  if (e2) throw new Error(`Failed to load messages: ${e2.message}`);
  return { conversation, messages: messages ?? [] };
}

export async function deleteConversation(id: string) {
  if (!isUuid(id)) return false;
  const { tenantId, userId, db } = await me();
  const { data, error } = await db.from("ai_conversations").delete().eq("tenant_id", tenantId).eq("user_id", userId).eq("id", id).select("id");
  if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** A conversation title from the first question: its first line, cut at a word. */
export function titleFor(question: string) {
  const line = question.trim().split("\n")[0];
  if (line.length <= 60) return line;
  const cut = line.slice(0, 60);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 30 ? cut.lastIndexOf(" ") : 60)}…`;
}

/**
 * Answers one question, streaming the answer's text through onText as the
 * model writes it. Creates the conversation when conversationId is null.
 * Aborting `signal` stops the model mid-answer (the usage row keeps what was
 * spent). Returns the conversation id. Throws AiBlocked / AiFailed (safe to show).
 */
export async function askAssistant(conversationId: string | null, question: string, onText: (text: string) => void, signal?: AbortSignal) {
  const { tenantId, userId, db } = await me();

  let id = conversationId;
  let history: ChatMessage[] = [];
  if (id) {
    const existing = await getConversation(id);
    if (!existing) id = null;
    else history = existing.messages.slice(-HISTORY);
  }
  if (!id) {
    const { data, error } = await db.from("ai_conversations").insert({ tenant_id: tenantId, user_id: userId, title: titleFor(question) }).select("id").single<{ id: string }>();
    if (error) throw new Error(`Failed to start conversation: ${error.message}`);
    id = data.id;
  }
  const save = async (role: "user" | "assistant", content: string, usageId: string | null = null) => {
    const { error } = await db.from("ai_messages").insert({ tenant_id: tenantId, conversation_id: id, role, content, usage_id: usageId });
    if (error) throw new Error(`Failed to save message: ${error.message}`);
  };
  await save("user", question);

  let answer = "";
  const { usageId } = await runAi({ tenantId, userId }, "assistant", async ({ model, provider, config }) => {
    const agent = createAgent({
      model,
      tools: TOOLS,
      systemPrompt: ASSISTANT_SYSTEM,
      middleware: [
        modelCallLimitMiddleware({ runLimit: 6, exitBehavior: "end" }),
        toolCallLimitMiddleware({ runLimit: 12 }),
        ...(provider === "anthropic" ? [anthropicPromptCachingMiddleware({ ttl: "5m", unsupportedModelBehavior: "ignore" })] : []),
      ],
    });
    const stream = await agent.stream(
      { messages: [...history.map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: question }] },
      { ...config, signal, streamMode: "messages", recursionLimit: 30 },
    );
    let lastStep: number | undefined;
    for await (const [chunk, meta] of stream as AsyncIterable<[BaseMessage, { langgraph_node?: string; langgraph_step?: number }]>) {
      // Only the model's own words: not tool results, not thinking.
      if (chunk?.type !== "ai" || meta.langgraph_node !== "model_request") continue;
      const text = chunk.text;
      if (!text) continue;
      // A new model call after text was already written (text, tool, more text): start a new paragraph.
      if (answer && lastStep !== undefined && meta.langgraph_step !== lastStep && !answer.endsWith("\n")) {
        answer += "\n\n";
        onText("\n\n");
      }
      lastStep = meta.langgraph_step;
      answer += text;
      onText(text);
    }
  });

  if (!answer.trim()) {
    answer = "I couldn't finish looking that up. Try asking about one thing at a time.";
    onText(answer);
  }
  await save("assistant", answer.trim(), usageId);
  await db.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", id);
  return id!;
}

/** How much of this month's AI budget the organization has used, for the assistant page. */
export async function aiUsageThisMonth() {
  const { tenantId, db } = await me();
  const [limits, { data, error }] = await Promise.all([getLimits(tenantId), db.rpc("ai_month_summary", { p_tenant_id: tenantId })]);
  if (error) throw new Error(`Failed to load AI usage: ${error.message}`);
  const spent = ((data ?? []) as { cost_micros: number }[]).reduce((s, r) => s + Number(r.cost_micros), 0);
  const budget = limits.monthly_budget_cents * 10_000;
  return { percent: budget ? Math.min(100, Math.round((spent / budget) * 100)) : 100 };
}
