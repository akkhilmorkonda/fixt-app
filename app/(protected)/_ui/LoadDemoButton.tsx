"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadDemoAction } from "../_actions/fixt";
import { BUTTON } from "./kit";

export default function LoadDemoButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        className={BUTTON}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await loadDemoAction();
            if (!r.ok) setError(r.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Loading demo fleet…" : "Load demo data"}
      </button>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
