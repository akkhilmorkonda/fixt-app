"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBringupAction } from "../_actions/fixt";
import { BUTTON, INPUT, INPUT_BASE, TEXTAREA } from "../_ui/kit";

const TEXT_FILE = /\.(net|txt|csv|json|xml|md|asc|cir|edn)$/i;
const MAX_TEXT = 200_000;

/** Starts a bring-up. Files are read for their name (and text, when small and plain); the files themselves aren't stored. */
export default function NewBringup() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [schematic, setSchematic] = useState<string | null>(null);
  const [firmware, setFirmware] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const pick = async (file: File | undefined, set: (n: string | null) => void, label: string) => {
    if (!file) return set(null);
    set(file.name);
    if (TEXT_FILE.test(file.name) && file.size <= MAX_TEXT) {
      const text = await file.text();
      setNotes((n) => `${n ? `${n}\n\n` : ""}--- ${label}: ${file.name} ---\n${text}`.slice(0, 20000));
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createBringupAction({ name, schematic_name: schematic, firmware_name: firmware, design_notes: notes, golden_target: Number(target) });
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      router.push(`/bringup/${res.value}`);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 text-sm">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Product name</span>
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Halo Ring" maxLength={120} required />
        {fieldErrors.name && <span className="text-xs text-rose-600">{fieldErrors.name}</span>}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Schematic or netlist</span>
        <input type="file" onChange={(e) => pick(e.target.files?.[0], setSchematic, "Schematic")} className="text-xs text-zinc-600 file:mr-3 file:rounded-md file:border file:border-zinc-200 file:bg-white file:px-2.5 file:py-1 file:text-xs file:font-medium" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Firmware</span>
        <input type="file" onChange={(e) => pick(e.target.files?.[0], setFirmware, "Firmware")} className="text-xs text-zinc-600 file:mr-3 file:rounded-md file:border file:border-zinc-200 file:bg-white file:px-2.5 file:py-1 file:text-xs file:font-medium" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Design notes</span>
        <textarea
          className={`${TEXTAREA} min-h-32`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={20000}
          placeholder="SoC, power rails and their nominals, sensors, radios, charging, firmware test hooks…"
        />
        {fieldErrors.design_notes && <span className="text-xs text-rose-600">{fieldErrors.design_notes}</span>}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Golden units to capture</span>
        <input type="number" min={1} max={100} className={`${INPUT_BASE} h-9 w-24 text-sm`} value={target} onChange={(e) => setTarget(e.target.value)} />
        {fieldErrors.golden_target && <span className="text-xs text-rose-600">{fieldErrors.golden_target}</span>}
      </label>
      <p className="text-xs leading-5 text-zinc-500">
        Only file names and design notes are kept for now. Text netlists and exports (.net, .txt, .csv, .json under 200 KB) are added to the notes so the bring-up agent can read them.
      </p>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button type="submit" className={BUTTON} disabled={pending}>
        {pending ? "Creating…" : "Start bring-up"}
      </button>
    </form>
  );
}
