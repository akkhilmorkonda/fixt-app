"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dateTime } from "@/lib/fixt/format";
import type { Settings } from "@/lib/fixt/types";
import { clearFleetAction, loadDemoAction, previewSummaryAction, sendSummaryNowAction, updateSettingsAction } from "../_actions/fixt";
import { BUTTON, BUTTON_SECONDARY, Card, INPUT } from "../_ui/kit";

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      {children}
      {(error || hint) && <span className={`text-xs ${error ? "text-rose-600" : "text-zinc-500"}`}>{error ?? hint}</span>}
    </label>
  );
}

export function SettingsForm({ settings: s, canEdit, emailReady }: { settings: Settings; canEdit: boolean; emailReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    engineer_hourly_rate: String(s.engineer_hourly_rate),
    escape_cost: String(s.escape_cost),
    fixt_annual_price: String(s.fixt_annual_price),
    baseline_root_cause_hours: String(s.baseline_root_cause_hours),
    weekly_summary_enabled: s.weekly_summary_enabled,
    weekly_summary_to: s.weekly_summary_to ?? "",
    deployment: s.deployment,
    data_region: s.data_region,
    sso_required: s.sso_required,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => {
    setV((x) => ({ ...x, [k]: value }));
    setMessage(null);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateSettingsAction(v);
          setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
          setMessage(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        });
      }}
      className="flex flex-col gap-6"
    >
      <fieldset disabled={!canEdit} className="contents">
        <Card title="ROI assumptions">
          <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="Engineer cost per hour ($)" error={errors.engineer_hourly_rate}>
              <input inputMode="decimal" value={v.engineer_hourly_rate} onChange={(e) => set("engineer_hourly_rate", e.target.value)} className={INPUT} />
            </Field>
            <Field label="Cost of one escape ($)" hint="A unit that fails in the field: RMA, replacement, shipping, support." error={errors.escape_cost}>
              <input inputMode="decimal" value={v.escape_cost} onChange={(e) => set("escape_cost", e.target.value)} className={INPUT} />
            </Field>
            <Field label="FIXT annual price ($)" error={errors.fixt_annual_price}>
              <input inputMode="decimal" value={v.fixt_annual_price} onChange={(e) => set("fixt_annual_price", e.target.value)} className={INPUT} />
            </Field>
            <Field label="Time to root cause before FIXT (hours)" hint="168 hours is one week." error={errors.baseline_root_cause_hours}>
              <input inputMode="decimal" value={v.baseline_root_cause_hours} onChange={(e) => set("baseline_root_cause_hours", e.target.value)} className={INPUT} />
            </Field>
          </div>
        </Card>

        <Card title="Weekly summary">
          <div className="flex flex-col gap-4 px-4 py-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.weekly_summary_enabled} onChange={(e) => set("weekly_summary_enabled", e.target.checked)} className="h-4 w-4 accent-sky-600" />
              Email a summary every Monday: yield, catches, open investigations and value delivered.
            </label>
            <Field label="Send to" hint={s.weekly_summary_sent_at ? `Last sent ${dateTime(s.weekly_summary_sent_at)}` : "Separate several addresses with commas."} error={errors.weekly_summary_to}>
              <input value={v.weekly_summary_to} onChange={(e) => set("weekly_summary_to", e.target.value)} placeholder="head-of-manufacturing@yourcompany.com" className={INPUT} />
            </Field>
            {!emailReady && <p className="text-xs text-amber-800">Email isn&apos;t set up on the server yet (RESEND_API_KEY and EMAIL_FROM), so nothing will be sent.</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                className={BUTTON_SECONDARY}
                onClick={() =>
                  start(async () => {
                    const r = await previewSummaryAction();
                    if (r.ok && r.value) setPreview(r.value);
                    else if (!r.ok) setMessage({ ok: false, text: r.error });
                  })
                }
              >
                Preview this week&apos;s email
              </button>
              <button
                type="button"
                disabled={pending || !emailReady}
                className={BUTTON_SECONDARY}
                onClick={() =>
                  start(async () => {
                    const r = await sendSummaryNowAction();
                    setMessage(r.ok ? { ok: true, text: `Sent: ${r.value ?? "weekly summary"}` } : { ok: false, text: r.error });
                    if (r.ok) router.refresh();
                  })
                }
              >
                Send now
              </button>
            </div>
            {preview && (
              <div className="rounded-lg border border-zinc-200 bg-[#fcfcfc] p-4">
                <p className="mb-2 text-sm font-medium">{preview.subject}</p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-700">{preview.body}</p>
              </div>
            )}
          </div>
        </Card>

        <Card title="Deployment & data">
          <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="Deployment" hint="What your contract specifies. FIXT operations provisions VPC and on-prem installs.">
              <select value={v.deployment} onChange={(e) => set("deployment", e.target.value as Settings["deployment"])} className={INPUT}>
                <option value="cloud">FIXT cloud</option>
                <option value="vpc">Your VPC</option>
                <option value="on_prem">On-prem</option>
              </select>
            </Field>
            <Field label="Data residency">
              <select value={v.data_region} onChange={(e) => set("data_region", e.target.value as Settings["data_region"])} className={INPUT}>
                <option value="us">United States</option>
                <option value="eu">European Union</option>
                <option value="apac">Asia-Pacific</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={v.sso_required} onChange={(e) => set("sso_required", e.target.checked)} className="h-4 w-4 accent-sky-600" />
              Require single sign-on for everyone on our domain
            </label>
          </div>
        </Card>
      </fieldset>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={BUTTON}>
            {pending ? "Saving…" : "Save settings"}
          </button>
          {message && <span className={`text-sm ${message.ok ? "text-zinc-500" : "text-rose-600"}`}>{message.text}</span>}
        </div>
      )}
    </form>
  );
}

export function LoadDemo() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        className={BUTTON}
        onClick={() =>
          start(async () => {
            const r = await loadDemoAction();
            setError(r.ok ? null : r.error);
            if (r.ok) router.push("/");
            router.refresh();
          })
        }
      >
        {pending ? "Loading… (about 20 seconds)" : "Load demo data"}
      </button>
      {error && <span className="text-sm text-rose-600">{error}</span>}
    </div>
  );
}

export function DangerZone() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <section className="mt-6 rounded-xl border border-rose-200 p-4">
      <h2 className="font-heading text-[15px] font-semibold tracking-tight text-rose-700">Delete all fleet data</h2>
      <p className="mt-1 text-sm leading-6 text-zinc-600">Removes every site, station, measurement, alert, investigation, agent action and connector for this organization. Settings stay. This can&apos;t be undone.</p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await clearFleetAction(confirm);
            setMessage(r.ok ? { ok: true, text: "Deleted." } : { ok: false, text: r.error });
            if (r.ok) {
              setConfirm("");
              router.refresh();
            }
          });
        }}
      >
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type DELETE" aria-label="Type DELETE to confirm" className={`${INPUT} max-w-[180px]`} />
        <button type="submit" disabled={pending || confirm !== "DELETE"} className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
          {pending ? "Deleting…" : "Delete everything"}
        </button>
        {message && <span className={`text-sm ${message.ok ? "text-zinc-500" : "text-rose-600"}`}>{message.text}</span>}
      </form>
    </section>
  );
}
