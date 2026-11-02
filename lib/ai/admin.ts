import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { auditAdmin, requireAdmin } from "@/lib/tenant";
import { PROVIDERS, type Feature, type Limits } from "./models";
import { aiSwitchedOff, providerReady, resolveModel } from "./models.server";
import { getLimits } from "./run";
import { tracingEnabled, configureTracing } from "./tracing";
import type { AiSettingsFields } from "./validate";

// AI controls for FIXT staff: each organization's settings and limits, and
// what it has used. Like lib/admin.ts, every function calls requireAdmin() and
// every write calls auditAdmin().

export type AiPlatformStatus = {
  switchedOff: boolean;
  providers: { key: string; label: string; ready: boolean }[];
  tracing: boolean;
  project: string | null;
};

export async function aiPlatformStatus(): Promise<AiPlatformStatus> {
  await requireAdmin();
  configureTracing();
  return {
    switchedOff: aiSwitchedOff(),
    providers: PROVIDERS.map((p) => ({ key: p.key, label: p.label, ready: providerReady(p.key) })),
    tracing: tracingEnabled(),
    project: tracingEnabled() ? (process.env.LANGSMITH_PROJECT ?? null) : null,
  };
}

export type AiUsageRow = {
  id: string;
  feature: Feature;
  provider: string;
  model: string;
  status: "pending" | "ok" | "error";
  input_tokens: number;
  output_tokens: number;
  cost_micros: number;
  latency_ms: number | null;
  error: string | null;
  user_id: string | null;
  created_at: string;
};

export type OrgAi = {
  limits: Limits;
  hasRow: boolean;
  running: { provider: string; model: string } | null;
  month: { feature: Feature; requests: number; errors: number; input_tokens: number; output_tokens: number; cost_micros: number }[];
  recent: AiUsageRow[];
};

export async function getOrgAi(tenantId: string): Promise<OrgAi> {
  await requireAdmin();
  const db = createAdminSupabase();
  const [limits, row, month, recent] = await Promise.all([
    getLimits(tenantId),
    db.from("tenant_ai_settings").select("tenant_id").eq("tenant_id", tenantId).maybeSingle(),
    db.rpc("ai_month_summary", { p_tenant_id: tenantId }),
    db
      .from("ai_usage")
      .select("id, feature, provider, model, status, input_tokens, output_tokens, cost_micros, latency_ms, error, user_id, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<AiUsageRow[]>(),
  ]);
  for (const r of [row, month, recent]) if (r.error) throw new Error(`Failed to load AI usage: ${r.error.message}`);
  return {
    limits,
    hasRow: !!row.data,
    running: resolveModel(limits),
    month: ((month.data ?? []) as OrgAi["month"]).map((m) => ({ ...m, requests: Number(m.requests), errors: Number(m.errors), input_tokens: Number(m.input_tokens), output_tokens: Number(m.output_tokens), cost_micros: Number(m.cost_micros) })),
    recent: (recent.data ?? []).map((r) => ({ ...r, cost_micros: Number(r.cost_micros) })),
  };
}

export async function updateOrgAi(tenantId: string, fields: AiSettingsFields) {
  const admin = await requireAdmin();
  const { error } = await createAdminSupabase()
    .from("tenant_ai_settings")
    .upsert({ tenant_id: tenantId, ...fields, updated_by: admin.userId });
  if (error) {
    if (error.code === "23503") return false;
    throw new Error(`Failed to save AI settings: ${error.message}`);
  }
  await auditAdmin(admin, "update_ai_settings", tenantId, { ...fields });
  return true;
}

/** This month's AI spend for every organization, keyed by id, for the /admin list. */
export async function aiSpendByTenant(): Promise<Map<string, { requests: number; cost_micros: number }>> {
  await requireAdmin();
  const { data, error } = await createAdminSupabase().rpc("ai_month_spend");
  if (error) throw new Error(`Failed to load AI spend: ${error.message}`);
  return new Map(((data ?? []) as { tenant_id: string; requests: number; cost_micros: number }[]).map((r) => [r.tenant_id, { requests: Number(r.requests), cost_micros: Number(r.cost_micros) }]));
}
