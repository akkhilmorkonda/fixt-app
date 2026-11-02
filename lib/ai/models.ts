// The models FIXT can run, what they cost, and how each AI feature uses them.
// Pure data and arithmetic, so it's shared by the server, /admin and tests.

export type Provider = "anthropic" | "openai";

export type ModelInfo = {
  id: string;
  provider: Provider;
  label: string;
  /** US dollars per million tokens. */
  input: number;
  output: number;
};

// Prices are the providers' list prices (Anthropic as of 2026-10-06, OpenAI
// 2026-10). Budgets are enforced from these numbers, so a model goes here
// before anyone can pick it. Thinking/reasoning tokens bill as output.
export const MODELS: ModelInfo[] = [
  { id: "claude-opus-5-5", provider: "anthropic", label: "Claude Opus 5.5", input: 4, output: 20 },
  { id: "claude-sonnet-5-5", provider: "anthropic", label: "Claude Sonnet 5.5", input: 2, output: 10 },
  { id: "claude-haiku-5-5", provider: "anthropic", label: "Claude Haiku 5.5", input: 0.1, output: 0.5 },
  { id: "gpt-5.4", provider: "openai", label: "GPT-5.4", input: 2.5, output: 15 },
  { id: "gpt-5-mini", provider: "openai", label: "GPT-5 mini", input: 0.25, output: 2 },
];

export const PROVIDERS: { key: Provider; label: string; envKey: string; defaultModel: string }[] = [
  { key: "anthropic", label: "Anthropic", envKey: "ANTHROPIC_API_KEY", defaultModel: "claude-opus-5-5" },
  { key: "openai", label: "OpenAI", envKey: "OPENAI_API_KEY", defaultModel: "gpt-5.4" },
];

export const modelInfo = (id: string) => MODELS.find((m) => m.id === id) ?? null;
export const isProvider = (v: unknown): v is Provider => v === "anthropic" || v === "openai";
export const providerInfo = (p: Provider) => PROVIDERS.find((x) => x.key === p)!;

/** Cost of a call in millionths of a dollar (rounded up, so budgets never undercount). */
export function costMicros(model: string, inputTokens: number, outputTokens: number) {
  const m = modelInfo(model);
  if (!m) return 0;
  return Math.ceil(inputTokens * m.input + outputTokens * m.output);
}

export const dollars = (micros: number) => {
  const d = micros / 1_000_000;
  return d === 0 ? "$0" : d < 0.01 ? "<$0.01" : `$${d.toFixed(2)}`;
};

// Features ------------------------------------------------------------------------------

export type Feature = "assistant" | "diagnosis" | "test_plan" | "weekly_summary";

export type FeatureInfo = {
  key: Feature;
  label: string;
  description: string;
  /** Ceiling per model call, thinking included. Length is set by the prompt; this only stops runaways. */
  maxTokens: number;
  /** How hard the model thinks: low for short writing, medium for multi-step reasoning. */
  effort: "low" | "medium";
  /** Model calls one request may make (the assistant loops through tools). */
  calls: number;
  /** Rough input size used to reserve budget before the call. */
  inputTokens: number;
};

export const FEATURES: FeatureInfo[] = [
  {
    key: "assistant",
    label: "Ask FIXT",
    description: "Questions about the organization's fleet, yield, alerts and investigations.",
    maxTokens: 6000,
    effort: "medium",
    calls: 6,
    inputTokens: 8000,
  },
  {
    key: "diagnosis",
    label: "Root-cause diagnosis",
    description: "A hypothesis, its evidence and the next test for an investigation.",
    maxTokens: 8000,
    effort: "medium",
    calls: 1,
    inputTokens: 12000,
  },
  {
    key: "test_plan",
    label: "Bring-up test plans",
    description: "A test plan, limits and coverage map from a new design's notes.",
    maxTokens: 10000,
    effort: "medium",
    calls: 1,
    inputTokens: 10000,
  },
  {
    key: "weekly_summary",
    label: "Weekly summary",
    description: "The Monday email to the head of manufacturing.",
    maxTokens: 4000,
    effort: "low",
    calls: 1,
    inputTokens: 8000,
  },
];

export const featureInfo = (key: Feature) => FEATURES.find((f) => f.key === key)!;
export const isFeature = (v: unknown): v is Feature => FEATURES.some((f) => f.key === v);

/** Budget held back while a call runs: the most it could cost if every call hit its ceiling. */
export function reserveMicros(model: string, feature: Feature) {
  const f = featureInfo(feature);
  return costMicros(model, f.inputTokens * f.calls, f.maxTokens * f.calls);
}

// Limits --------------------------------------------------------------------------------

export type Limits = {
  enabled: boolean;
  provider: Provider | null;
  model: string | null;
  monthly_budget_cents: number;
  daily_request_limit: number;
  user_minute_limit: number;
  disabled_features: Feature[];
};

/** An organization with no settings row gets these (they match the table's defaults). */
export const DEFAULT_LIMITS: Limits = {
  enabled: true,
  provider: null,
  model: null,
  monthly_budget_cents: 2000,
  daily_request_limit: 300,
  user_minute_limit: 12,
  disabled_features: [],
};

export type BlockReason = "off" | "unconfigured" | "inactive" | "disabled" | "feature_disabled" | "budget" | "daily" | "minute";

/** What a member sees when a request is refused. */
export const BLOCK_MESSAGES: Record<BlockReason, string> = {
  off: "AI is switched off right now.",
  unconfigured: "AI isn't set up yet. Ask FIXT support to connect a model provider.",
  inactive: "This organization isn't active.",
  disabled: "AI is turned off for your organization. Contact FIXT support to turn it on.",
  feature_disabled: "This AI feature is turned off for your organization.",
  budget: "Your organization has used this month's AI budget. It resets on the 1st, or FIXT support can raise it.",
  daily: "Your organization has reached today's AI limit. Try again tomorrow.",
  minute: "You're going a bit fast. Wait a minute and try again.",
};
