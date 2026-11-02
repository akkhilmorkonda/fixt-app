"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addHandoffAction } from "../_actions/fixt";
import { BUTTON, INPUT, TEXTAREA } from "../_ui/kit";

export default function HandoffForm({ lines }: { lines: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [line, setLine] = useState(lines[0]?.id ?? "");
  const [shift, setShift] = useState<"A" | "B" | "C">("A");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!lines.length) return <p className="text-sm text-zinc-500">Add a line first.</p>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const res = await addHandoffAction(line, shift, body);
      if (!res.ok) return setError(res.error);
      setBody("");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Line</span>
          <select className={INPUT} value={line} onChange={(e) => setLine(e.target.value)}>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Shift</span>
          <select className={INPUT} value={shift} onChange={(e) => setShift(e.target.value as "A" | "B" | "C")}>
            {(["A", "B", "C"] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">What the next shift needs to know</span>
        <textarea className={`${TEXTAREA} min-h-28`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder="Stations to watch, units on hold, fixtures swapped, retests pending…" required />
      </label>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <button type="submit" className={BUTTON} disabled={pending || !body.trim()}>
        {pending ? "Posting…" : "Post handoff"}
      </button>
    </form>
  );
}
