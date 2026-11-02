"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generatePlanAction, updateBringupAction } from "../../_actions/fixt";
import { Meter } from "../../_ui/charts";
import { BUTTON, BUTTON_SECONDARY, BUTTON_SMALL, TEXTAREA } from "../../_ui/kit";
import { Icon } from "../../_ui/icons";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "Something went wrong");
      after?.();
      router.refresh();
    });
  return { pending, error, go };
}

export function NextStage({ id, next, label }: { id: string; next: string; label: string }) {
  const { pending, error, go } = useAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className={BUTTON} disabled={pending} onClick={() => go(() => updateBringupAction(id, { stage: next }))}>
        {pending ? "Moving…" : `Move to ${label}`}
        <Icon name="arrowRight" />
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}

export function GoldenUnits({ id, units, target }: { id: string; units: number; target: number }) {
  const { pending, error, go } = useAction();
  const set = (n: number) => go(() => updateBringupAction(id, { golden_units: n }));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-heading text-2xl font-semibold tabular-nums">
          {units} <span className="text-base text-zinc-400">/ {target}</span>
        </span>
        <div className="flex gap-1.5">
          <button type="button" className={BUTTON_SMALL} disabled={pending || units <= 0} onClick={() => set(units - 1)} aria-label="Remove a golden unit">
            −1
          </button>
          <button type="button" className={BUTTON_SMALL} disabled={pending} onClick={() => set(units + 1)} aria-label="Capture a golden unit">
            <Icon name="plus" className="h-3 w-3" />1
          </button>
        </div>
      </div>
      <Meter value={units / target} label="Golden units captured" tone={units >= target ? "good" : "neutral"} />
      <span className="text-xs text-zinc-500">{units >= target ? "Baseline complete." : `${target - units} more to capture.`}</span>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}

export function DesignNotes({ id, initial }: { id: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { pending, error, go } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <textarea
        className={`${TEXTAREA} min-h-40 font-mono text-xs leading-5`}
        value={value}
        maxLength={20000}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder="Rails and nominals, sensors, radios, charging, firmware test hooks, netlist excerpt…"
      />
      <div className="flex items-center gap-3">
        <button type="button" className={BUTTON_SECONDARY} disabled={pending || value === initial} onClick={() => go(() => updateBringupAction(id, { design_notes: value }), () => setSaved(true))}>
          {pending ? "Saving…" : "Save notes"}
        </button>
        {saved && <span className="text-xs text-emerald-700">Saved</span>}
        <span className="ml-auto text-xs tabular-nums text-zinc-400">{value.length.toLocaleString()} / 20,000</span>
      </div>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}

export function GeneratePlan({ id, available, hasNotes, regenerate }: { id: string; available: boolean; hasNotes: boolean; regenerate: boolean }) {
  const { pending, error, go } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={BUTTON} disabled={!available || !hasNotes || pending} onClick={() => go(() => generatePlanAction(id))}>
        <Icon name="sparkle" />
        {pending ? "Writing the plan… (up to a minute)" : regenerate ? "Regenerate test plan" : "Generate test plan"}
      </button>
      {!available && <span className="text-xs text-zinc-500">The bring-up agent isn&apos;t turned on for your organization (needs an AI provider key).</span>}
      {available && !hasNotes && <span className="text-xs text-zinc-500">Save design notes first.</span>}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
