"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AiPlatformStatus, OrgAi } from "@/lib/ai/admin";
import { dollars, featureInfo, FEATURES, MODELS, PROVIDERS, type Feature } from "@/lib/ai/models";
import { timeAgo } from "@/lib/fixt/format";
import { PRIMARY } from "./AdminUI";
import { updateOrgAiAction } from "./ai-actions";

const INPUT =
  "h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 aria-[invalid=true]:border-rose-400";

/** The platform's AI wiring, at the top of /admin. */
export function AiPlatformBanner({ status }: { status: AiPlatformStatus }) {
  const ready = status.providers.filter((p) => p.ready);
  const problem = status.switchedOff ? "AI is switched off for everyone (AI_DISABLED)." : ready.length === 0 ? "No model provider key is set, so AI is off. Add ANTHROPIC_API_KEY or OPENAI_API_KEY." : null;
  return (
    <div className={`mb-6 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border px-4 py-2.5 text-sm ${problem ? "border-amber-200 bg-amber-50 text-amber-950" : "border-zinc-200 text-zinc-600"}`}>
      <span className="font-medium text-[#1a1a1a]">AI</span>
      {problem ?? (
        <>
          <span>Providers: {ready.map((p) => p.label).join(", ")}</span>
          <span>LangSmith: {status.tracing ? `tracing to ${status.project}` : "off (set LANGSMITH_API_KEY)"}</span>
        </>
      )}
    </div>
  );
}

/** One organization's AI settings, limits and usage. */
export function OrgAiSettings({ tenantId, ai }: { tenantId: string; ai: OrgAi }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const l = ai.limits;
  const [v, setV] = useState({
    enabled: l.enabled,
    provider: l.provider ?? "",
    model: l.model ?? "",
    monthly_budget: String(l.monthly_budget_cents / 100),
    daily_request_limit: String(l.daily_request_limit),
    user_minute_limit: String(l.user_minute_limit),
    features: FEATURES.map((f) => f.key).filter((k) => !l.disabled_features.includes(k)) as Feature[],
  });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => {
    setV((s) => ({ ...s, [k]: value }));
    setSaved(false);
  };

  const spent = ai.month.reduce((s, m) => s + m.cost_micros, 0);
  const budget = l.monthly_budget_cents * 10_000;
  const pct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 100;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="text-zinc-500">This month</span>
          <span className="tabular-nums">
            <b className="font-semibold">{dollars(spent)}</b> of {dollars(budget)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div className={`h-full rounded-full ${pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-400" : "bg-sky-600"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">
          {ai.running ? `Runs on ${MODELS.find((m) => m.id === ai.running!.model)?.label ?? ai.running.model}.` : "No provider key is configured, so AI can't run."}
          {!ai.hasRow && " Using the default settings."}
        </p>
      </div>

      {ai.month.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="pb-1 font-medium">Feature</th>
              <th className="pb-1 text-right font-medium">Requests</th>
              <th className="pb-1 text-right font-medium">Tokens</th>
              <th className="pb-1 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {ai.month.map((m) => (
              <tr key={m.feature} className="border-t border-zinc-100">
                <td className="py-1.5">{featureInfo(m.feature).label}</td>
                <td className="py-1.5 text-right">
                  {m.requests.toLocaleString()}
                  {m.errors > 0 && <span className="text-rose-600"> ({m.errors} failed)</span>}
                </td>
                <td className="py-1.5 text-right">{(m.input_tokens + m.output_tokens).toLocaleString()}</td>
                <td className="py-1.5 text-right">{dollars(m.cost_micros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await updateOrgAiAction(tenantId, v);
            setError(r.ok ? null : (r.error ?? Object.values(r.fieldErrors ?? {})[0] ?? "Couldn't save"));
            setFieldErrors(r.ok ? {} : (r.fieldErrors ?? {}));
            if (r.ok) {
              setSaved(true);
              router.refresh();
            }
          });
        }}
        className="grid grid-cols-1 gap-4 border-t border-zinc-100 pt-5 sm:grid-cols-2"
      >
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 sm:col-span-2">
          <input type="checkbox" checked={v.enabled} onChange={(e) => set("enabled", e.target.checked)} className="h-4 w-4 accent-black" />
          AI on for this organization
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Provider</span>
          <select aria-label="Provider" value={v.provider} onChange={(e) => (set("provider", e.target.value), set("model", ""))} className={INPUT}>
            <option value="">Platform default</option>
            {PROVIDERS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Model</span>
          <select aria-label="Model" value={v.model} onChange={(e) => set("model", e.target.value)} disabled={!v.provider} aria-invalid={!!fieldErrors.model} className={INPUT}>
            <option value="">Provider default</option>
            {MODELS.filter((m) => m.provider === v.provider).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} (${m.input} / ${m.output} per M tokens)
              </option>
            ))}
          </select>
        </label>
        <Field label="Monthly budget ($)" error={fieldErrors.monthly_budget}>
          <input inputMode="decimal" value={v.monthly_budget} onChange={(e) => set("monthly_budget", e.target.value)} aria-invalid={!!fieldErrors.monthly_budget} className={INPUT} />
        </Field>
        <Field label="Requests per day" error={fieldErrors.daily_request_limit}>
          <input inputMode="numeric" value={v.daily_request_limit} onChange={(e) => set("daily_request_limit", e.target.value)} aria-invalid={!!fieldErrors.daily_request_limit} className={INPUT} />
        </Field>
        <Field label="Requests per member per minute" error={fieldErrors.user_minute_limit}>
          <input inputMode="numeric" value={v.user_minute_limit} onChange={(e) => set("user_minute_limit", e.target.value)} aria-invalid={!!fieldErrors.user_minute_limit} className={INPUT} />
        </Field>
        <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium text-zinc-700">Features</legend>
          {FEATURES.map((f) => (
            <label key={f.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={v.features.includes(f.key)}
                onChange={(e) => set("features", e.target.checked ? [...v.features, f.key] : v.features.filter((k) => k !== f.key))}
                className="mt-0.5 h-4 w-4 accent-black"
              />
              <span>
                {f.label}
                <span className="block text-xs text-zinc-500">{f.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending ? "Saving…" : "Save AI settings"}
          </button>
          {saved && <span className="text-sm text-zinc-500">Saved</span>}
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
      </form>

      {ai.recent.length > 0 && (
        <div className="border-t border-zinc-100 pt-4">
          <h3 className="mb-2 text-sm font-medium text-zinc-500">Recent calls</h3>
          <ul className="flex flex-col gap-1.5 text-xs">
            {ai.recent.slice(0, 12).map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className={r.status === "error" ? "text-rose-600" : r.status === "pending" ? "text-amber-700" : "text-zinc-700"}>{featureInfo(r.feature).label}</span>
                <span className="text-zinc-400">{r.model}</span>
                <span className="tabular-nums text-zinc-500">{dollars(r.cost_micros)}</span>
                {r.latency_ms != null && <span className="tabular-nums text-zinc-400">{(r.latency_ms / 1000).toFixed(1)}s</span>}
                <span className="ml-auto text-zinc-400">{timeAgo(r.created_at)}</span>
                <span className="w-full font-mono text-[10px] text-zinc-300" title="LangSmith run id">
                  {r.id}
                </span>
                {r.error && <span className="w-full truncate text-rose-600">{r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      {children}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </label>
  );
}
