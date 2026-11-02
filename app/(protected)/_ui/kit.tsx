import Link from "next/link";
import { actionStatusOf, investigationStatusOf, severityOf, stationStatusOf } from "@/lib/fixt/types";

// Shared building blocks for FIXT pages, in the same look as the rest of the app:
// bordered cards with a #fcfcfc header, stat strips, quiet pills.

export function Card({ title, href, linkLabel = "View all", actions, className = "", children }: { title: React.ReactNode; href?: string; linkLabel?: string; actions?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-zinc-200 bg-white ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-[#fcfcfc] px-4 py-2.5">
        <h2 className="font-heading text-[15px] font-semibold tracking-tight">{title}</h2>
        <div className="flex items-center gap-3">
          {actions}
          {href && (
            <Link href={href} className="text-xs font-medium text-sky-600 hover:underline">
              {linkLabel}
            </Link>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

export function StatStrip({ children, cols = 4 }: { children: React.ReactNode; cols?: 3 | 4 | 5 }) {
  const lg = cols === 5 ? "lg:grid-cols-5" : cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return <div className={`mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 ${lg}`}>{children}</div>;
}

export function Stat({ href, label, value, sub, tone, trend, children }: { href?: string; label: string; value: string; sub?: React.ReactNode; tone?: "accent" | "warn" | "good"; trend?: number | null; children?: React.ReactNode }) {
  const color = tone === "accent" ? "text-violet-700" : tone === "warn" ? "text-rose-600" : tone === "good" ? "text-emerald-700" : "";
  const body = (
    <>
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="flex items-end justify-between gap-2">
        <span className={`font-heading text-2xl font-semibold tabular-nums ${color}`}>{value}</span>
        {children}
      </span>
      {(sub || trend != null) && (
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-zinc-500">
          {trend != null && <Trend delta={trend} />}
          {sub}
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className="flex flex-col gap-1 bg-white px-4 py-3 transition hover:bg-zinc-50">
      {body}
    </Link>
  ) : (
    <div className="flex flex-col gap-1 bg-white px-4 py-3">{body}</div>
  );
}

/** ▲/▼ with the change in percentage points (for yields). */
export function Trend({ delta, unit = "pt" }: { delta: number; unit?: string }) {
  const pts = delta * 100;
  if (Math.abs(pts) < 0.05) return <span className="text-zinc-500">→ 0.0{unit}</span>;
  return (
    <span className={pts > 0 ? "text-emerald-700" : "text-rose-600"} aria-label={`${pts > 0 ? "up" : "down"} ${Math.abs(pts).toFixed(1)} points`}>
      {pts > 0 ? "▲" : "▼"} {Math.abs(pts).toFixed(1)}
      {unit}
    </span>
  );
}

const PILL = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset";

export function SeverityPill({ severity }: { severity: string }) {
  const s = severityOf(severity);
  return (
    <span className={`${PILL} ${s.tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function StationStatus({ status, className = "" }: { status: string; className?: string }) {
  const s = stationStatusOf(status);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text} ${className}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot} ${status === "alarming" ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  );
}

export function InvestigationStatusPill({ status }: { status: string }) {
  const s = investigationStatusOf(status);
  return <span className={`${PILL} ${s.tone}`}>{s.label}</span>;
}

export function ActionStatusPill({ status }: { status: string }) {
  const s = actionStatusOf(status);
  return <span className={`${PILL} ${s.tone}`}>{s.label}</span>;
}

export function Pill({ children, tone = "bg-zinc-100 text-zinc-600 ring-zinc-200" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`${PILL} ${tone}`}>{children}</span>;
}

export function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-sm text-zinc-500">{text}</p>;
}

/** Tabs driven by a search param, as plain links (works without JS, survives refresh). */
export function Tabs({ tabs, current, param = "tab", base }: { tabs: { key: string; label: string; count?: number }[]; current: string; param?: string; base: string }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-zinc-200" aria-label="Views">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.key === tabs[0].key ? base : `${base}?${param}=${t.key}`}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${active ? "border-sky-600 font-medium text-sky-700" : "border-transparent text-zinc-600 hover:text-[#1a1a1a]"}`}
          >
            {t.label}
            {t.count != null && <span className="rounded-full bg-zinc-100 px-1.5 text-[11px] tabular-nums text-zinc-600">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export const BUTTON = "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#1a1a1a] px-3.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50";
export const BUTTON_SECONDARY = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-sm font-medium text-[#1a1a1a] transition hover:bg-zinc-50 disabled:opacity-50";
// Small buttons: the base has no colors, so variants never fight over bg/text classes.
export const BUTTON_SMALL_BASE = "inline-flex h-7 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition disabled:opacity-50";
export const BUTTON_SMALL = `${BUTTON_SMALL_BASE} border-zinc-200 bg-white text-[#1a1a1a] hover:bg-zinc-50`;
export const BUTTON_SMALL_DARK = `${BUTTON_SMALL_BASE} border-[#1a1a1a] bg-[#1a1a1a] text-white hover:bg-black`;
// Inputs: the base has no height, width or text size, so callers can size it without class conflicts.
export const INPUT_BASE = "rounded-lg border border-zinc-200 bg-white px-3 outline-none transition placeholder:text-zinc-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20";
export const INPUT = `${INPUT_BASE} h-9 w-full text-sm`;
export const TEXTAREA = "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-zinc-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20";
export const TH = "px-4 py-2 text-left text-xs font-medium text-zinc-500";
export const TD = "px-4 py-2.5 text-sm";
