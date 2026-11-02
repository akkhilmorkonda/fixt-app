import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { featureInfo, isProvider, modelInfo, providerInfo, PROVIDERS, type Feature, type Limits, type Provider } from "./models";

// Builds LangChain chat models from the platform's API keys. Keys live only in
// server environment variables; organizations never bring their own.

export const providerReady = (p: Provider) => !!process.env[providerInfo(p).envKey];
export const readyProviders = () => PROVIDERS.filter((p) => providerReady(p.key)).map((p) => p.key);

/** The platform kill switch: AI_DISABLED=true stops every model call at once. */
export const aiSwitchedOff = () => process.env.AI_DISABLED === "true";

/**
 * The provider and model an organization runs: its own choice when an admin
 * set one, else AI_PROVIDER / AI_MODEL, else Anthropic's default. A choice whose
 * key isn't configured falls through to a provider that is.
 */
export function resolveModel(limits: Pick<Limits, "provider" | "model">): { provider: Provider; model: string } | null {
  const envProvider = isProvider(process.env.AI_PROVIDER) ? process.env.AI_PROVIDER : null;
  const order = [limits.provider, envProvider, "anthropic", "openai"].filter((p, i, a): p is Provider => isProvider(p) && a.indexOf(p) === i);
  for (const provider of order) {
    if (!providerReady(provider)) continue;
    const wanted = [provider === limits.provider ? limits.model : null, process.env.AI_MODEL, providerInfo(provider).defaultModel];
    const model = wanted.find((m) => m && modelInfo(m)?.provider === provider)!;
    return { provider, model };
  }
  return null;
}

/** The other provider's default model, to retry on when the first one is down. */
export function fallbackFor(provider: Provider) {
  const other = PROVIDERS.find((p) => p.key !== provider && providerReady(p.key));
  return other ? { provider: other.key, model: other.defaultModel } : null;
}

/**
 * A chat model for one feature. Length comes from the prompts; maxTokens is
 * only a runaway ceiling (thinking counts toward it, so it isn't tight).
 * Retries cover rate limits and overloads before any fallback.
 */
export function chatModel(provider: Provider, model: string, feature: Feature): BaseChatModel {
  const f = featureInfo(feature);
  if (provider === "anthropic") {
    // Claude 5.5 models always think; effort sets how much. No sampling
    // parameters: these models reject them.
    return new ChatAnthropic({
      model,
      maxTokens: f.maxTokens,
      maxRetries: 2,
      outputConfig: { effort: f.effort },
    });
  }
  return new ChatOpenAI({
    model,
    maxTokens: f.maxTokens,
    maxRetries: 2,
    reasoning: { effort: f.effort },
  });
}
