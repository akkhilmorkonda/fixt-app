import { FEATURES, isProvider, modelInfo, type Feature, type Limits, type Provider } from "./models";

// Validation for AI inputs that come from the browser. Pure, so tests cover it.

export type AiSettingsFields = Omit<Limits, never>;
type Result<T> = { fields: T } | { errors: Record<string, string> };

const int = (v: unknown, min: number, max: number) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** An admin's AI settings for one organization. Budget arrives in dollars. */
export function parseAiSettings(input: unknown): Result<AiSettingsFields> {
  const o = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const enabled = o.enabled === true || o.enabled === "on" || o.enabled === "true";
  const provider: Provider | null = o.provider === "" || o.provider == null ? null : isProvider(o.provider) ? o.provider : null;
  if (o.provider && !provider) errors.provider = "Pick a provider";
  let model: string | null = typeof o.model === "string" && o.model ? o.model : null;
  if (model && !provider) errors.model = "Pick a provider for this model";
  else if (model && modelInfo(model)?.provider !== provider) errors.model = "That model isn't from this provider";
  if (!provider) model = null;

  const dollars = typeof o.monthly_budget === "string" ? Number(o.monthly_budget) : o.monthly_budget;
  const budget = typeof dollars === "number" && Number.isFinite(dollars) && dollars >= 0 && dollars <= 100_000 ? Math.round(dollars * 100) : null;
  if (budget === null) errors.monthly_budget = "Enter a budget from $0 to $100,000";
  const daily = int(o.daily_request_limit, 0, 100_000);
  if (daily === null) errors.daily_request_limit = "Enter a whole number from 0 to 100,000";
  const minute = int(o.user_minute_limit, 0, 1000);
  if (minute === null) errors.user_minute_limit = "Enter a whole number from 0 to 1,000";

  const on = Array.isArray(o.features) ? o.features : [];
  const disabled = FEATURES.map((f) => f.key).filter((k) => !on.includes(k)) as Feature[];

  if (Object.keys(errors).length) return { errors };
  return {
    fields: {
      enabled,
      provider,
      model,
      monthly_budget_cents: budget!,
      daily_request_limit: daily!,
      user_minute_limit: minute!,
      disabled_features: disabled,
    },
  };
}
