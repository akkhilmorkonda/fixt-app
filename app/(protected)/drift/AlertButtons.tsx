"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { investigateAlertAction, setAlertStatusAction } from "../_actions/fixt";
import { BUTTON_SMALL, BUTTON_SMALL_DARK } from "../_ui/kit";

export default function AlertButtons({ id, status, investigationId }: { id: string; status: string; investigationId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const act = (fn: () => Promise<{ ok: boolean; error?: string; value?: unknown }>, after?: (v: unknown) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong");
      else if (after) after(r.value);
      else router.refresh();
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {investigationId ? (
          <button type="button" className={BUTTON_SMALL} onClick={() => router.push(`/investigations/${investigationId}`)}>
            Open investigation
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            className={BUTTON_SMALL_DARK}
            onClick={() => act(() => investigateAlertAction(id), (v) => router.push(`/investigations/${v as string}`))}
          >
            Investigate
          </button>
        )}
        {status === "open" && (
          <button type="button" disabled={pending} className={BUTTON_SMALL} onClick={() => act(() => setAlertStatusAction(id, "acknowledged"))}>
            Acknowledge
          </button>
        )}
        {(status === "open" || status === "acknowledged") && (
          <>
            <button type="button" disabled={pending} className={BUTTON_SMALL} onClick={() => act(() => setAlertStatusAction(id, "resolved"))}>
              Resolve
            </button>
            <button type="button" disabled={pending} className={BUTTON_SMALL} onClick={() => act(() => setAlertStatusAction(id, "suppressed"))}>
              Suppress
            </button>
          </>
        )}
        {(status === "resolved" || status === "suppressed") && (
          <button type="button" disabled={pending} className={BUTTON_SMALL} onClick={() => act(() => setAlertStatusAction(id, "open"))}>
            Reopen
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
