"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideActionAction, rollbackActionAction, type ActionResult } from "../_actions/fixt";
import { Icon } from "../_ui/icons";
import { BUTTON, BUTTON_SECONDARY, INPUT, INPUT_BASE } from "../_ui/kit";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  return { pending, error, go };
}

/** Approve (applies the change) or reject, with an optional note. */
export function Decide({ id }: { id: string }) {
  const { pending, error, go } = useRun();
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Note (optional)" aria-label="Decision note" className={`${INPUT_BASE} h-9 w-full text-xs`} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => go(() => decideActionAction(id, true, note))} className={BUTTON}>
          <Icon name="check" className="h-3.5 w-3.5" />
          Approve and apply
        </button>
        <button type="button" disabled={pending} onClick={() => go(() => decideActionAction(id, false, note))} className={BUTTON_SECONDARY}>
          Reject
        </button>
        {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
      </div>
    </div>
  );
}

/** Undo an applied change, after an inline confirmation. */
export function Rollback({ id }: { id: string }) {
  const { pending, error, go } = useRun();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <span className="text-xs text-zinc-600">Restore the previous value on the line?</span>
          <button type="button" disabled={pending} onClick={() => go(() => rollbackActionAction(id))} className={`${BUTTON} bg-rose-600 hover:bg-rose-700`}>
            {pending ? "Rolling back…" : "Yes, roll back"}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={BUTTON_SECONDARY}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={BUTTON_SECONDARY}>
          <Icon name="undo" className="h-3.5 w-3.5" />
          Roll back
        </button>
      )}
      {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
    </div>
  );
}
