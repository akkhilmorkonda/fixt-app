"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { timeAgo } from "@/lib/fixt/format";
import { CHANNEL_KINDS, SEVERITIES, type AlertChannel, type ChannelKind, type Severity } from "@/lib/fixt/types";
import { addChannelAction, removeChannelAction, testChannelAction, updateChannelAction, type ActionResult } from "../_actions/fixt";
import { BUTTON, BUTTON_SMALL, BUTTON_SMALL_BASE, INPUT } from "../_ui/kit";

/** Webhook URLs and routing keys are secrets: show where they point, not what they are. */
export function maskTarget(c: Pick<AlertChannel, "kind" | "target">) {
  if (c.kind === "email") return c.target;
  if (c.kind === "pagerduty") return `Routing key …${c.target.slice(-4)}`;
  try {
    return `${new URL(c.target).host} …${c.target.slice(-4)}`;
  } catch {
    return `…${c.target.slice(-4)}`;
  }
}

export function ChannelRow({ channel: c }: { channel: AlertChannel }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const act = (fn: () => Promise<ActionResult<unknown>>, okText?: string) =>
    start(async () => {
      const r = await fn();
      setNote(r.ok ? (okText ? { ok: true, text: okText } : null) : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });

  return (
    <li className={`flex flex-col gap-2 px-4 py-3 ${pending ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium">{CHANNEL_KINDS.find((k) => k.key === c.kind)?.label}</span>
        {c.label && <span className="text-sm text-zinc-600">{c.label}</span>}
        <code className="min-w-0 truncate font-mono text-xs text-zinc-500">{maskTarget(c)}</code>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600">
          <input type="checkbox" checked={c.enabled} disabled={pending} onChange={(e) => act(() => updateChannelAction(c.id, { enabled: e.target.checked }))} className="h-4 w-4 accent-sky-600" />
          Enabled
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <label className="flex items-center gap-1.5">
          Minimum severity
          <select
            value={c.min_severity}
            disabled={pending}
            onChange={(e) => act(() => updateChannelAction(c.id, { min_severity: e.target.value }))}
            className="h-7 rounded-md border border-zinc-200 bg-white px-1.5 text-xs"
          >
            {SEVERITIES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span>{c.last_sent_at ? `Last sent ${timeAgo(c.last_sent_at)}` : "Nothing sent yet"}</span>
        <span className="ml-auto flex gap-1.5">
          <button type="button" disabled={pending} className={BUTTON_SMALL} onClick={() => act(() => testChannelAction(c.id), "Test sent.")}>
            Send test
          </button>
          {confirming ? (
            <>
              <button type="button" disabled={pending} className={`${BUTTON_SMALL_BASE} border-zinc-200 bg-white text-rose-600 hover:bg-zinc-50`} onClick={() => act(() => removeChannelAction(c.id))}>
                Remove
              </button>
              <button type="button" className={BUTTON_SMALL} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" disabled={pending} className={`${BUTTON_SMALL_BASE} border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50`} onClick={() => setConfirming(true)}>
              Remove
            </button>
          )}
        </span>
      </div>
      {c.last_error && <p className="text-xs text-rose-600">Last delivery failed: {c.last_error}</p>}
      {note && <p className={`text-xs ${note.ok ? "text-emerald-700" : "text-rose-600"}`}>{note.text}</p>}
    </li>
  );
}

export function AddChannelForm({ emailReady }: { emailReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<{ kind: ChannelKind; target: string; label: string; min_severity: Severity }>({ kind: "slack", target: "", label: "", min_severity: "high" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const kind = CHANNEL_KINDS.find((k) => k.key === v.kind)!;

  return (
    <form
      className="flex flex-col gap-3 px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addChannelAction(v);
          setError(r.ok ? null : r.error);
          setFieldErrors(r.ok ? {} : (r.fieldErrors ?? {}));
          if (r.ok) {
            setV((s) => ({ ...s, target: "", label: "" }));
            router.refresh();
          }
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Channel</span>
        <select value={v.kind} onChange={(e) => setV((s) => ({ ...s, kind: e.target.value as ChannelKind }))} className={INPUT}>
          {CHANNEL_KINDS.map((k) => (
            <option key={k.key} value={k.key} disabled={k.key === "email" && !emailReady}>
              {k.label}
              {k.key === "email" && !emailReady ? " (needs email set up)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">{v.kind === "email" ? "Address" : v.kind === "pagerduty" ? "Routing key" : "Webhook URL"}</span>
        <input value={v.target} onChange={(e) => setV((s) => ({ ...s, target: e.target.value }))} placeholder={kind.placeholder} spellCheck={false} aria-invalid={!!fieldErrors.target} className={`${INPUT} ${v.kind === "email" ? "" : "font-mono"}`} />
        {fieldErrors.target && <span className="text-xs text-rose-600">{fieldErrors.target}</span>}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Label</span>
        <input value={v.label} onChange={(e) => setV((s) => ({ ...s, label: e.target.value }))} placeholder="#test-eng-alerts" maxLength={120} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">Minimum severity</span>
        <select value={v.min_severity} onChange={(e) => setV((s) => ({ ...s, min_severity: e.target.value as Severity }))} className={INPUT}>
          {SEVERITIES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label} and above
            </option>
          ))}
        </select>
      </label>
      {error && !Object.keys(fieldErrors).length && <p className="text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={pending || !v.target.trim()} className={BUTTON}>
        {pending ? "Adding…" : "Add channel"}
      </button>
    </form>
  );
}
