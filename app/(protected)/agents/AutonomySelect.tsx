"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AUTONOMY, type Autonomy } from "@/lib/fixt/types";
import { setAutonomyAction } from "../_actions/fixt";

/** The three autonomy levels for one line, as a segmented control. */
export default function AutonomySelect({ lineId, value, canEdit }: { lineId: string; value: Autonomy; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const hint = AUTONOMY.find((a) => a.key === current)?.hint;

  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="Autonomy" className="inline-flex w-fit rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
        {AUTONOMY.map((a) => (
          <button
            key={a.key}
            type="button"
            role="radio"
            aria-checked={current === a.key}
            disabled={pending || !canEdit}
            onClick={() =>
              start(async () => {
                setError(null);
                const prev = current;
                setCurrent(a.key);
                const r = await setAutonomyAction(lineId, a.key);
                if (!r.ok) {
                  setCurrent(prev);
                  setError(r.error);
                } else router.refresh();
              })
            }
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed ${
              current === a.key ? (a.key === "autonomous" ? "bg-violet-600 text-white shadow-sm" : "bg-white text-[#1a1a1a] shadow-sm ring-1 ring-zinc-200") : "text-zinc-600 hover:text-[#1a1a1a]"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500">{hint}</p>
      {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
    </div>
  );
}
