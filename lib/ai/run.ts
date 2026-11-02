import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { LLMResult } from "@langchain/core/outputs";
import type { RunnableConfig } from "@langchain/core/runnables";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { BLOCK_MESSAGES, costMicros, DEFAULT_LIMITS, reserveMicros, type BlockReason, type Feature, type Limits, type Provider } from "./models";
import { aiSwitchedOff, chatModel, fallbackFor, resolveModel } from "./models.server";
import { configureTracing, flushTraces } from "./tracing";

// Every model call in the app goes through runAi(). In order, it:
//   1. refuses when AI is off (platform switch, organization, or feature)
//   2. checks the organization's budget and rate limits and reserves the call
//      (ai_begin(), atomic per organization)
//   3. runs the call with LangSmith tracing tagged by organization, member and
//      feature; the trace's run id is the ai_usage row's id
//   4. on an outage or rate limit that outlasts the retries, runs once more on
//      the other provider, if its key is set
//   5. records the real tokens and cost
// Callers pass the organization from currentTenant(); nothing here trusts the browser.

export type AiContext = { tenantId: string; userId: string | null };

export type AiCall = {
  model: BaseChatModel;
  provider: Provider;
  modelId: string;
  /** Pass to every invoke/stream so the call is traced and counted. */
  config: RunnableConfig;
};

/** The request was refused before any model ran. The message is safe to show. */
export class AiBlocked extends Error {
  constructor(readonly reason: BlockReason) {
    super(BLOCK_MESSAGES[reason]);
  }
}

/** The model failed or returned something unusable. The message is safe to show. */
export class AiFailed extends Error {}

const TIMEOUT_MS: Record<Feature, number> = { assistant: 120_000, diagnosis: 90_000, test_plan: 120_000, weekly_summary: 60_000 };

export async function getLimits(tenantId: string): Promise<Limits> {
  const { data, error } = await createAdminSupabase()
    .from("tenant_ai_settings")
    .select("enabled, provider, model, monthly_budget_cents, daily_request_limit, user_minute_limit, disabled_features")
    .eq("tenant_id", tenantId)
    .maybeSingle<Limits>();
  if (error) throw new Error(`Failed to load AI settings: ${error.message}`);
  return data ?? DEFAULT_LIMITS;
}

/** Whether a feature can run for an organization right now (before limits), for showing or hiding it. */
export async function featureAvailable(tenantId: string, feature: Feature) {
  if (aiSwitchedOff()) return false;
  const limits = await getLimits(tenantId);
  return limits.enabled && !limits.disabled_features.includes(feature) && resolveModel(limits) !== null;
}

/** Adds up tokens from every model call in a run, including each step of the assistant. */
class UsageCollector extends BaseCallbackHandler {
  name = "fixt_usage";
  input = 0;
  output = 0;
  calls = 0;

  override async handleLLMEnd(output: LLMResult) {
    this.calls++;
    for (const gens of output.generations)
      for (const gen of gens) {
        const usage = (gen as { message?: { usage_metadata?: { input_tokens?: number; output_tokens?: number } } }).message?.usage_metadata;
        if (usage) {
          this.input += usage.input_tokens ?? 0;
          this.output += usage.output_tokens ?? 0;
        }
      }
  }
}

/** Errors worth trying the other provider for: rate limits, overloads, outages, timeouts. */
export function isOutage(err: unknown): boolean {
  for (let e = err as { status?: number; name?: string; message?: string; cause?: unknown } | undefined, i = 0; e && i < 4; e = e.cause as typeof e, i++) {
    if (typeof e.status === "number") return e.status === 408 || e.status === 429 || e.status >= 500;
    if (/timeout|timed out|abort|ECONNRESET|ENOTFOUND|fetch failed|connection/i.test(`${e.name} ${e.message}`)) return true;
  }
  return false;
}

export async function runAi<T>(ctx: AiContext, feature: Feature, task: (call: AiCall) => Promise<T>): Promise<{ value: T; usageId: string; model: string }> {
  if (aiSwitchedOff()) throw new AiBlocked("off");
  const limits = await getLimits(ctx.tenantId);
  if (!limits.enabled) throw new AiBlocked("disabled");
  if (limits.disabled_features.includes(feature)) throw new AiBlocked("feature_disabled");
  const primary = resolveModel(limits);
  if (!primary) throw new AiBlocked("unconfigured");

  const db = createAdminSupabase();
  const { data: begun, error } = await db.rpc("ai_begin", {
    p_tenant_id: ctx.tenantId,
    p_user_id: ctx.userId,
    p_feature: feature,
    p_provider: primary.provider,
    p_model: primary.model,
    p_reserve_micros: reserveMicros(primary.model, feature),
  });
  if (error) throw new Error(`Failed to check AI limits: ${error.message}`);
  const result = begun as { ok: true; id: string } | { ok: false; reason: BlockReason };
  if (!result.ok) throw new AiBlocked(result.reason);
  const usageId = result.id;

  if (configureTracing()) {
    try {
      after(flushTraces);
    } catch {
      // Outside a request (scripts, tests): nothing freezes, traces upload on their own.
    }
  }
  const started = Date.now();
  let tokensIn = 0;
  let tokensOut = 0;
  let cost = 0;
  let used = primary;

  const attempt = async (choice: { provider: Provider; model: string }, runId: string) => {
    used = choice;
    const usage = new UsageCollector();
    const config: RunnableConfig = {
      runId,
      runName: `fixt.${feature}`,
      tags: [feature, choice.provider],
      metadata: { tenant_id: ctx.tenantId, user_id: ctx.userId, feature, usage_id: usageId, model: choice.model },
      callbacks: [usage],
      timeout: TIMEOUT_MS[feature],
    };
    try {
      return await task({ model: chatModel(choice.provider, choice.model, feature), provider: choice.provider, modelId: choice.model, config });
    } finally {
      tokensIn += usage.input;
      tokensOut += usage.output;
      cost += costMicros(choice.model, usage.input, usage.output);
    }
  };

  const finish = async (status: "ok" | "error", message: string | null) => {
    const { error: e } = await db
      .from("ai_usage")
      .update({
        status,
        provider: used.provider,
        model: used.model,
        input_tokens: tokensIn,
        output_tokens: tokensOut,
        cost_micros: cost,
        latency_ms: Date.now() - started,
        error: message?.slice(0, 500) ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", usageId);
    if (e) console.error("Failed to record AI usage", e.message);
  };

  try {
    let value: T;
    try {
      value = await attempt(primary, usageId);
    } catch (err) {
      const backup = isOutage(err) ? fallbackFor(primary.provider) : null;
      if (!backup) throw err;
      console.warn(`AI ${feature}: ${primary.model} failed, falling back to ${backup.model}`, err);
      value = await attempt(backup, randomUUID());
    }
    await finish("ok", null);
    return { value, usageId, model: used.model };
  } catch (err) {
    await finish("error", err instanceof Error ? err.message : String(err));
    if (err instanceof AiFailed) throw err;
    console.error(`AI ${feature} failed`, err);
    throw new AiFailed(isOutage(err) ? "The AI service is busy right now. Try again in a minute." : "The AI couldn't finish that. Try again.");
  }
}
