"use client";

import { useState } from "react";

// Small inline-SVG charts. One axis per chart, thin marks, recessive grid,
// text in ink colors (never the series color), and a hover tooltip on every
// plotted form. Categorical colors come in a fixed order (SERIES) and follow
// the entity, never its rank.

export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const INK = { primary: "#1a1a1a", secondary: "#52514e", muted: "#8a8984", grid: "#ececea", axis: "#d6d5d1" };
const LIMIT = "#e34948";
const CONTROL = "#8a8984";

type Tip = { x: number; y: number; lines: string[] } | null;

function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 70), width - 70);
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-lg"
      style={{ left: `${(left / width) * 100}%`, top: tip.y - 8 }}
    >
      {tip.lines.map((l, i) => (
        <div key={i} className={i === 0 ? "font-medium text-[#1a1a1a]" : "tabular-nums text-zinc-600"}>
          {l}
        </div>
      ))}
    </div>
  );
}

const ticks = (lo: number, hi: number, n = 4) => {
  const span = hi - lo || 1;
  const step = 10 ** Math.floor(Math.log10(span / n));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= n) ?? step * 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / nice) * nice; v <= hi + 1e-9; v += nice) out.push(Math.round(v / nice) * nice);
  return out;
};
/** Named value formats. Server pages can't pass functions to these client charts, so they pass a name. */
export type ValueFormat = "number" | "percent" | "money" | "hours";
const FORMATS: Record<ValueFormat, (v: number) => string> = {
  number: (v) => v.toLocaleString("en-US", { maximumFractionDigits: 2 }),
  percent: (v) => `${(v * 100).toFixed(1)}%`,
  money: (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v),
  hours: (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 24 ? `${Math.round(h * 10) / 10}h` : `${Math.round((h / 24) * 10) / 10} days`),
};
const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(2));

// Sparkline --------------------------------------------------------------------------

/** A tiny trend line for a stat tile. Decorative next to its number, so no tooltip. */
export function Sparkline({ values, width = 96, height = 28, tone = "neutral" }: { values: number[]; width?: number; height?: number; tone?: "neutral" | "bad" | "good" }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6);
  const color = tone === "bad" ? "#e34948" : tone === "good" ? "#1baf7a" : "#2a78d6";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5" fill={color} stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

// Line chart -------------------------------------------------------------------------

export type LineSeries = { key: string; label: string; values: (number | null)[] };

/** Lines over shared x labels (days), with a crosshair tooltip. */
export function LineChart({
  labels,
  series,
  height = 200,
  format: formatName,
  yMin,
  yMax,
  ariaLabel,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  format?: ValueFormat;
  yMin?: number;
  yMax?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const format = formatName ? FORMATS[formatName] : fmt;
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (!all.length || labels.length < 2) return <p className="py-10 text-center text-sm text-zinc-500">Not enough data yet.</p>;
  const lo = yMin ?? Math.min(...all);
  const hi = yMax ?? Math.max(...all);
  const span = hi - lo || 1;
  const y0 = lo - span * 0.08;
  const y1 = hi + span * 0.08;
  const x = (i: number) => pad.l + (i / (labels.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const grid = ticks(y0, y1);
  const every = Math.ceil(labels.length / 7);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {grid.map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke={INK.grid} />
            <text x={pad.l - 6} y={y(g)} dy="0.32em" textAnchor="end" fontSize="10" fill={INK.muted}>
              {format(g)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 || i === labels.length - 1 ? (
            <text key={l} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={INK.muted}>
              {l}
            </text>
          ) : null,
        )}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke={INK.axis} />}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
          return <polyline key={s.key} points={pts.join(" ")} fill="none" stroke={SERIES[si % SERIES.length]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {hover != null &&
          series.map((s, si) =>
            s.values[hover] == null ? null : <circle key={s.key} cx={x(hover)} cy={y(s.values[hover]!)} r="4" fill={SERIES[si % SERIES.length]} stroke="#fff" strokeWidth="2" />,
          )}
        {labels.map((l, i) => (
          <rect key={l} x={x(i) - (W - pad.l - pad.r) / (labels.length - 1) / 2} y={pad.t} width={(W - pad.l - pad.r) / (labels.length - 1)} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      <Tooltip
        width={W}
        tip={
          hover == null
            ? null
            : { x: x(hover), y: (pad.t / H) * 100, lines: [labels[hover], ...series.filter((s) => s.values[hover] != null).map((s) => `${s.label}: ${format(s.values[hover]!)}`)] }
        }
      />
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-zinc-600">
          {series.map((s, si) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full" style={{ background: SERIES[si % SERIES.length] }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Control chart ----------------------------------------------------------------------

/** Individual measurements in time order against control limits (±3σ) and spec limits. */
export function ControlChart({
  points,
  center,
  ucl,
  lcl,
  lsl,
  usl,
  unit,
  height = 220,
  ariaLabel,
}: {
  points: { at: string; value: number; passed: boolean; serial?: string | null }[];
  center: number | null;
  ucl: number | null;
  lcl: number | null;
  lsl: number | null;
  usl: number | null;
  unit: string;
  height?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 48, r: 44, t: 12, b: 22 };
  if (points.length < 2) return <p className="py-10 text-center text-sm text-zinc-500">Not enough measurements yet.</p>;
  const vals = points.map((p) => p.value);
  const refs = [center, ucl, lcl, lsl, usl].filter((v): v is number => v != null);
  const lo = Math.min(...vals, ...refs);
  const hi = Math.max(...vals, ...refs);
  const span = hi - lo || 1;
  const y0 = lo - span * 0.06;
  const y1 = hi + span * 0.06;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const ref = (v: number | null, label: string, color: string, dash: string) =>
    v == null ? null : (
      <g key={label}>
        <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={color} strokeDasharray={dash} strokeWidth="1" />
        <text x={W - pad.r + 4} y={y(v)} dy="0.32em" fontSize="10" fill={INK.secondary}>
          {label}
        </text>
      </g>
    );
  const step = (W - pad.l - pad.r) / (points.length - 1);
  const first = new Date(points[0].at);
  const last = new Date(points[points.length - 1].at);
  const d = (t: Date) => t.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks(y0, y1).map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke={INK.grid} />
            <text x={pad.l - 6} y={y(g)} dy="0.32em" textAnchor="end" fontSize="10" fill={INK.muted}>
              {fmt(g)}
            </text>
          </g>
        ))}
        {ref(usl, "USL", LIMIT, "")}
        {ref(lsl, "LSL", LIMIT, "")}
        {ref(ucl, "UCL", CONTROL, "4 3")}
        {ref(lcl, "LCL", CONTROL, "4 3")}
        {ref(center, "CL", CONTROL, "1 3")}
        <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke="#2a78d6" strokeOpacity="0.35" strokeWidth="1" />
        {points.map((p, i) => {
          const out = (ucl != null && p.value > ucl) || (lcl != null && p.value < lcl);
          return !p.passed || out || hover === i ? (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 4.5 : 3} fill={!p.passed ? LIMIT : out ? "#eda100" : "#2a78d6"} stroke="#fff" strokeWidth="1.5" />
          ) : null;
        })}
        <text x={pad.l} y={H - 6} fontSize="10" fill={INK.muted}>
          {d(first)}
        </text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize="10" fill={INK.muted}>
          {d(last)}
        </text>
        {points.map((_, i) => (
          <rect key={i} x={x(i) - step / 2} y={pad.t} width={Math.max(step, 1)} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      <Tooltip
        width={W}
        tip={
          hover == null
            ? null
            : {
                x: x(hover),
                y: (y(points[hover].value) / H) * (height * 0.95),
                lines: [
                  `${fmt(points[hover].value)} ${unit}${points[hover].passed ? "" : " · FAIL"}`,
                  `${new Date(points[hover].at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}${points[hover].serial ? ` · ${points[hover].serial}` : ""}`,
                ],
              }
        }
      />
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-zinc-600">
        <span className="flex items-center gap-1.5"><span className="h-px w-3 bg-[#e34948]" />Spec limits</span>
        <span className="flex items-center gap-1.5"><span className="h-px w-3 border-t border-dashed border-zinc-500" />Control limits (±3σ)</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#e34948]" />Failed</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#eda100]" />Outside control limits</span>
      </div>
    </div>
  );
}

// Histogram --------------------------------------------------------------------------

/** A measurement distribution with its spec limits. */
export function Histogram({ bins, lsl, usl, unit, height = 160, ariaLabel }: { bins: { from: number; to: number; count: number }[]; lsl: number | null; usl: number | null; unit: string; height?: number; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 12, r: 12, t: 10, b: 22 };
  if (!bins.length) return <p className="py-10 text-center text-sm text-zinc-500">No measurements yet.</p>;
  const lo = Math.min(bins[0].from, lsl ?? Infinity);
  const hi = Math.max(bins[bins.length - 1].to, usl ?? -Infinity);
  const span = hi - lo || 1;
  const x0 = lo - span * 0.04;
  const x1 = hi + span * 0.04;
  const x = (v: number) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const max = Math.max(...bins.map((b) => b.count));
  const h = (c: number) => (c / (max || 1)) * (H - pad.t - pad.b);
  const base = H - pad.b;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} stroke={INK.axis} />
        {bins.map((b, i) => {
          const bx = x(b.from) + 1;
          const bw = Math.max(1, x(b.to) - x(b.from) - 2);
          const bh = h(b.count);
          const out = (lsl != null && b.to <= lsl) || (usl != null && b.from >= usl);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={bx - 1} y={pad.t} width={bw + 2} height={base - pad.t} fill="transparent" />
              {bh > 0 && <path d={`M${bx},${base} V${base - bh + Math.min(4, bh)} q0,-${Math.min(4, bh)} ${Math.min(4, bw / 2)},-${Math.min(4, bh)} H${bx + bw - Math.min(4, bw / 2)} q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, bh)} V${base} Z`} fill={out ? LIMIT : "#2a78d6"} opacity={hover == null || hover === i ? 1 : 0.55} />}
            </g>
          );
        })}
        {[lsl != null && { v: lsl, l: "LSL" }, usl != null && { v: usl, l: "USL" }].filter(Boolean).map((r) => {
          const { v, l } = r as { v: number; l: string };
          return (
            <g key={l}>
              <line x1={x(v)} x2={x(v)} y1={pad.t} y2={base} stroke={LIMIT} strokeWidth="1.5" />
              <text x={x(v)} y={H - 6} textAnchor="middle" fontSize="10" fill={INK.secondary}>
                {l} {fmt(v)}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip
        width={W}
        tip={hover == null ? null : { x: x((bins[hover].from + bins[hover].to) / 2), y: ((base - h(bins[hover].count)) / H) * height, lines: [`${fmt(bins[hover].from)} to ${fmt(bins[hover].to)} ${unit}`, `${bins[hover].count} units`] }}
      />
    </div>
  );
}

// Bar list ---------------------------------------------------------------------------

/** Horizontal bars, largest first, with value labels: Paretos and comparisons. */
export function BarList({ rows, format: formatName = "number", max: maxRows = 8, tone = "#2a78d6" }: { rows: { label: string; value: number; share?: number; cumulative?: number; href?: string }[]; format?: ValueFormat; max?: number; tone?: string }) {
  const format = FORMATS[formatName];
  const shown = rows.slice(0, maxRows);
  const max = Math.max(...shown.map((r) => r.value), 0);
  if (!shown.length) return <p className="py-8 text-center text-sm text-zinc-500">Nothing to show for this period.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {shown.map((r) => (
        <li key={r.label} className="group" title={r.cumulative != null ? `${r.label}: ${format(r.value)} (${Math.round((r.share ?? 0) * 100)}%, cumulative ${Math.round(r.cumulative * 100)}%)` : `${r.label}: ${format(r.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            {r.href ? (
              <a href={r.href} className="min-w-0 truncate text-zinc-700 hover:underline">
                {r.label}
              </a>
            ) : (
              <span className="min-w-0 truncate text-zinc-700">{r.label}</span>
            )}
            <span className="shrink-0 tabular-nums text-zinc-600">
              {format(r.value)}
              {r.share != null && <span className="ml-1.5 text-xs text-zinc-400">{Math.round(r.share * 100)}%</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100">
            <div className="h-2 rounded-full transition-opacity group-hover:opacity-80" style={{ width: `${max ? Math.max(2, (r.value / max) * 100) : 0}%`, background: tone }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Meter ------------------------------------------------------------------------------

/** A 0–1 progress bar (coverage, fixture life). */
export function Meter({ value, tone = "neutral", label }: { value: number; tone?: "neutral" | "warn" | "bad" | "good"; label: string }) {
  const color = tone === "bad" ? "#e34948" : tone === "warn" ? "#eda100" : tone === "good" ? "#1baf7a" : "#2a78d6";
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-100" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }} />
    </div>
  );
}
