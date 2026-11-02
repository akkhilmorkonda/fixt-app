// Display helpers, safe on server and client.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money = (n: number | null | undefined) => (n == null ? "—" : usd.format(n));

/** $1.2M / $340K for big headline numbers. */
export function moneyShort(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${n < 0 ? "-" : ""}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 10_000) return `${n < 0 ? "-" : ""}$${Math.round(a / 1000)}K`;
  return money(n);
}

export const percent = (fraction: number, digits = 1) => `${(fraction * 100).toFixed(digits)}%`;

/** A measured value with sensible precision for its size. */
export function measure(v: number | null | undefined, unit = "") {
  if (v == null || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  const s = a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(3) : v.toPrecision(3);
  return unit ? `${s} ${unit}` : s;
}

/** "Oct 12" (adds the year when it isn't this year). Takes YYYY-MM-DD or an ISO timestamp. */
export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "Oct 12, 14:05". */
export function dateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${shortDate(iso)}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return shortDate(iso);
}

/** "3h 20m", "2.5 days": a span of hours, for time-to-root-cause. */
export function duration(hours: number | null | undefined) {
  if (hours == null || !Number.isFinite(hours)) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = hours / 24;
  return `${d < 10 ? d.toFixed(1).replace(/\.0$/, "") : Math.round(d)} days`;
}

export const hoursBetween = (from: string, to: string | null | undefined, now = Date.now()) => ((to ? Date.parse(to) : now) - Date.parse(from)) / 3_600_000;

export const invNumber = (n: number) => `INV-${n}`;

/** YYYY-MM-DD in UTC. */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
