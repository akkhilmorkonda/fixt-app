import { dateTime, timeAgo } from "@/lib/fixt/format";
import { TIMELINE_KINDS, type Comment, type Evidence, type TimelineEvent } from "@/lib/fixt/types";
import { Icon } from "../../_ui/icons";

// Read-only pieces shared by the investigation page and its public share page.

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return null;
  return (
    <ul className="flex flex-col gap-2.5">
      {evidence.map((e, i) => (
        <li key={i} className="flex gap-2.5 text-sm">
          <span
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${e.supports ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}
            aria-label={e.supports ? "Supports" : "Against or not yet checked"}
          >
            <Icon name={e.supports ? "check" : "close"} className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <p className="font-medium">{e.label}</p>
            <p className="leading-6 text-zinc-600">{e.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export type TimelineItem = { key: string; at: string; dot: string; label: string; title: string; detail?: string | null; extra?: React.ReactNode };

export const timelineItems = (events: TimelineEvent[]): TimelineItem[] =>
  events.map((e) => ({ key: `e${e.id}`, at: e.at, dot: TIMELINE_KINDS[e.kind]?.dot ?? "bg-zinc-400", label: TIMELINE_KINDS[e.kind]?.label ?? e.kind, title: e.title, detail: e.detail }));

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return <p className="px-4 py-8 text-center text-sm text-zinc-500">Nothing on the timeline yet.</p>;
  const sorted = [...items].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <ol className="relative flex flex-col px-4 py-4">
      {sorted.map((e, i) => (
        <li key={e.key} className="relative flex gap-3 pb-5 last:pb-0">
          {i < sorted.length - 1 && <span className="absolute left-[4px] top-3 h-full w-px bg-zinc-200" aria-hidden="true" />}
          <span className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white ${e.dot}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-zinc-500">
              <span className="font-medium text-zinc-600">{e.label}</span>
              <time dateTime={e.at}>{dateTime(e.at)}</time>
            </div>
            <p className="text-sm font-medium">{e.title}</p>
            {e.detail && <p className="text-sm leading-6 text-zinc-600">{e.detail}</p>}
            {e.extra}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Comments({ comments }: { comments: Comment[] }) {
  if (!comments.length) return <p className="px-4 py-6 text-center text-sm text-zinc-500">No comments yet.</p>;
  return (
    <ul className="divide-y divide-zinc-100">
      {comments.map((c) => (
        <li key={c.id} className="flex gap-3 px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">{c.author.charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-500">
              <span className="font-medium text-[#1a1a1a]">{c.author}</span> · {timeAgo(c.created_at)}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-700">{c.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ConfidenceMeter({ value }: { value: number | null }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const color = value >= 0.85 ? "#1baf7a" : value >= 0.5 ? "#2a78d6" : "#eda100";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-28 rounded-full bg-zinc-100" role="meter" aria-label="Confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-zinc-700">{pct}% confidence</span>
    </div>
  );
}
