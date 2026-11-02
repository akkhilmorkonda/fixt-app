"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { capability, limitImpact, suggestLimits, TARGET_CPK, type Limits } from "@/lib/fixt/capability";
import { histogram } from "@/lib/fixt/spc";
import { proposeLimitsAction } from "../../_actions/fixt";
import { Histogram } from "../../_ui/charts";
import { BUTTON, INPUT, TEXTAREA } from "../../_ui/kit";
import { capTone, ppm } from "../format";

type Method = "cpk" | "percentile" | "manual";

const METHODS: { key: Method; label: string; hint: string }[] = [
  { key: "cpk", label: "Target Ppk", hint: "Mean ± 3 × target × σ. For roughly normal data." },
  { key: "percentile", label: "Percentile", hint: "From the data's own tails, plus a margin. For skewed or bimodal data." },
  { key: "manual", label: "Manual", hint: "Type the limits, e.g. from the design spec." },
];

const num = (s: string) => (s.trim() === "" ? null : Number(s));

/**
 * Try limits against this test's history: what Ppk and ppm they'd give, and
 * which units would have passed or failed. Sending them creates a change for
 * approval; nothing on the line moves until someone approves it.
 */
export default function LimitTuner({
  testId,
  values,
  current,
  unit,
  suggestion,
  normal,
  pending,
}: {
  testId: string;
  values: number[];
  current: Limits;
  unit: string;
  suggestion: Limits | null;
  normal: boolean;
  pending: string | null;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>(suggestion ? "manual" : normal ? "cpk" : "percentile");
  const [target, setTarget] = useState(TARGET_CPK);
  const [tail, setTail] = useState(0.001);
  const [margin, setMargin] = useState(0.1);
  const [manual, setManual] = useState({ lsl: String(suggestion?.lsl ?? current.lsl ?? ""), usl: String(suggestion?.usl ?? current.usl ?? "") });
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, start] = useTransition();

  const proposed: Limits = useMemo(() => {
    if (method === "cpk") return suggestLimits(values, current, "cpk", target);
    if (method === "percentile") return suggestLimits(values, current, "percentile", tail, margin);
    return { lsl: num(manual.lsl), usl: num(manual.usl) };
  }, [method, values, current, target, tail, margin, manual]);

  const valid = (proposed.lsl == null || Number.isFinite(proposed.lsl)) && (proposed.usl == null || Number.isFinite(proposed.usl)) && (proposed.lsl != null || proposed.usl != null) && (proposed.lsl == null || proposed.usl == null || proposed.lsl < proposed.usl);
  const now = useMemo(() => capability(values, current), [values, current]);
  const next = useMemo(() => (valid ? capability(values, proposed) : null), [values, proposed, valid]);
  const impact = valid ? limitImpact(values, current, proposed) : null;
  const unchanged = proposed.lsl === current.lsl && proposed.usl === current.usl;
  const widens = valid && ((current.lsl != null && (proposed.lsl == null || proposed.lsl < current.lsl)) || (current.usl != null && (proposed.usl == null || proposed.usl > current.usl)));

  const bins = useMemo(() => histogram(values, 32), [values]);
  const pickManual = () => {
    setManual({ lsl: proposed.lsl == null ? "" : String(proposed.lsl), usl: proposed.usl == null ? "" : String(proposed.usl) });
    setMethod("manual");
  };

  const limitsText = (l: Limits) => `${l.lsl ?? "—"} to ${l.usl ?? "—"} ${unit}`;
  const rows: [string, string, string, string?][] = [
    ["Limits", limitsText(current), valid ? limitsText(proposed) : "—"],
    ["Ppk", now.ppk?.toFixed(2) ?? "—", next?.ppk?.toFixed(2) ?? "—", "ppk"],
    ["Cpk", now.cpk?.toFixed(2) ?? "—", next?.cpk?.toFixed(2) ?? "—", "cpk"],
    ["Expected fallout", `${ppm(now.ppm.total)} ppm`, next ? `${ppm(next.ppm.total)} ppm` : "—"],
    ["Failures in history", impact ? `${impact.current.fails} of ${values.length}` : "—", impact ? `${impact.proposed.fails} of ${values.length}` : "—"],
    ["Yield in history", impact ? `${(impact.current.yield * 100).toFixed(2)}%` : "—", impact ? `${(impact.proposed.yield * 100).toFixed(2)}%` : "—"],
  ];

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="How to set the limits">
          {METHODS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={method === m.key}
              onClick={() => (m.key === "manual" ? pickManual() : setMethod(m.key))}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${method === m.key ? "bg-[#1a1a1a] text-white" : "text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">{METHODS.find((m) => m.key === method)!.hint}</p>

        {method === "cpk" && (
          <label className="flex max-w-md items-center gap-3 text-sm">
            <span className="w-24 shrink-0 text-zinc-600">Target Ppk</span>
            <input type="range" min={1} max={2.5} step={0.01} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="flex-1 accent-[#6250d6]" />
            <span className="w-10 text-right font-medium tabular-nums">{target.toFixed(2)}</span>
          </label>
        )}
        {method === "percentile" && (
          <div className="flex flex-col gap-2">
            <label className="flex max-w-md items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-zinc-600">Tail</span>
              <select value={tail} onChange={(e) => setTail(Number(e.target.value))} className={`${INPUT} max-w-[220px]`}>
                <option value={0.00135}>0.135% each side (±3σ)</option>
                <option value={0.001}>0.1% each side</option>
                <option value={0.005}>0.5% each side</option>
                <option value={0.01}>1% each side</option>
              </select>
            </label>
            <label className="flex max-w-md items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-zinc-600">Margin</span>
              <input type="range" min={0} max={0.5} step={0.01} value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="flex-1 accent-[#6250d6]" />
              <span className="w-10 text-right font-medium tabular-nums">{Math.round(margin * 100)}%</span>
            </label>
          </div>
        )}
        {method === "manual" && (
          <div className="grid max-w-md grid-cols-2 gap-3">
            {(["lsl", "usl"] as const).map((k) => (
              <label key={k} className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-zinc-700">
                  {k === "lsl" ? "Lower limit" : "Upper limit"} ({unit})
                </span>
                <input inputMode="decimal" value={manual[k]} onChange={(e) => setManual({ ...manual, [k]: e.target.value })} placeholder="None" className={`${INPUT} tabular-nums`} />
              </label>
            ))}
          </div>
        )}
      </div>

      <Histogram ariaLabel="Distribution with current and proposed limits" bins={bins} lsl={current.lsl} usl={current.usl} unit={unit} proposed={valid ? proposed : null} fit={{ mean: now.mean, sd: now.sd }} height={180} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
              <th className="py-1.5 pr-4 font-medium"></th>
              <th className="py-1.5 pr-4 font-medium">Current</th>
              <th className="py-1.5 font-medium text-[#6250d6]">Proposed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map(([label, a, b, tone]) => (
              <tr key={label}>
                <td className="py-1.5 pr-4 text-zinc-600">{label}</td>
                <td className={`py-1.5 pr-4 tabular-nums ${tone ? capTone(tone === "ppk" ? now.ppk : now.cpk) : ""}`}>{a}</td>
                <td className={`py-1.5 font-medium tabular-nums ${tone && next ? capTone(tone === "ppk" ? next.ppk : next.cpk) : ""}`}>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {impact && !unchanged && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {impact.newlyPassing > 0 && (
            <li className="text-zinc-700">
              <b className="font-medium">{impact.newlyPassing}</b> {impact.newlyPassing === 1 ? "unit that failed would have passed" : "units that failed would have passed"}.
            </li>
          )}
          {impact.newlyFailing > 0 && (
            <li className="text-zinc-700">
              <b className="font-medium">{impact.newlyFailing}</b> {impact.newlyFailing === 1 ? "unit that passed would have failed" : "units that passed would have failed"}.
            </li>
          )}
          {widens && <li className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">These limits are wider, so units that fail today would ship. Check the design spec allows it before this is approved.</li>}
        </ul>
      )}
      {!valid && <p className="text-sm text-rose-600">Set at least one limit, with the lower limit below the upper one.</p>}

      {pending ? (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          A limit change for this test is waiting for approval.{" "}
          <Link href="/approvals" className="font-medium text-sky-700 hover:underline">
            Open Approvals
          </Link>
        </p>
      ) : sent ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Sent for approval. The limits change when someone approves it.{" "}
          <Link href="/approvals" className="font-medium hover:underline">
            Open Approvals
          </Link>
        </p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await proposeLimitsAction(testId, { lsl: proposed.lsl, usl: proposed.usl, rationale });
              if (!r.ok) setError(Object.values(r.fieldErrors ?? {})[0] ?? r.error);
              else {
                setError(null);
                setSent(true);
                router.refresh();
              }
            });
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700">Why (for the approver)</span>
            <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2} maxLength={1000} placeholder="e.g. Design spec allows 280 to 320 mAh; current limits fail good cells." className={TEXTAREA} />
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button type="submit" disabled={busy || !valid || unchanged} className={`${BUTTON} self-start`}>
            {busy ? "Sending…" : "Send for approval"}
          </button>
        </form>
      )}
    </div>
  );
}
