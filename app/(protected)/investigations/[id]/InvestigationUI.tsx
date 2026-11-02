"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCommentAction,
  assignToMeAction,
  diagnoseAction,
  feedbackAction,
  runSuggestedTestAction,
  setSharingAction,
  updateInvestigationAction,
  type ActionResult,
} from "../../_actions/fixt";
import { Icon } from "../../_ui/icons";
import { BUTTON, BUTTON_SECONDARY, BUTTON_SMALL, BUTTON_SMALL_BASE, INPUT, INPUT_BASE, TEXTAREA } from "../../_ui/kit";
import { INVESTIGATION_STATUSES, SEVERITIES, type Feedback } from "@/lib/fixt/types";

// Interactive pieces of the investigation page. Each calls a server action and
// refreshes the page, so the server stays the source of truth.

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = <T,>(fn: () => Promise<ActionResult<T>>, onOk?: (value: T | undefined) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        onOk?.(r.value);
        router.refresh();
      }
    });
  return { pending, error, go };
}

const Err = ({ error }: { error: string | null }) => (error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null);

export function Controls({ id, status, severity, assignee, shareToken }: { id: string; status: string; severity: string; assignee: string | null; shareToken: string | null }) {
  const { pending, error, go } = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(assignee ?? "");
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="sr-only" htmlFor="inv-status">Status</label>
        <select id="inv-status" disabled={pending} value={status} onChange={(e) => go(() => updateInvestigationAction(id, { status: e.target.value }))} className={`${INPUT_BASE} h-8 w-auto py-0 text-xs`}>
          {INVESTIGATION_STATUSES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="inv-severity">Severity</label>
        <select id="inv-severity" disabled={pending} value={severity} onChange={(e) => go(() => updateInvestigationAction(id, { severity: e.target.value }))} className={`${INPUT_BASE} h-8 w-auto py-0 text-xs`}>
          {SEVERITIES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        {editing ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              go(() => updateInvestigationAction(id, { assignee: name }), () => setEditing(false));
            }}
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Assignee" className={`${INPUT_BASE} h-8 w-36 text-xs`} />
            <button type="submit" disabled={pending} className={BUTTON_SMALL}>Save</button>
            <button type="button" onClick={() => setEditing(false)} className={BUTTON_SMALL}>Cancel</button>
          </form>
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)} className={BUTTON_SMALL} title="Change assignee">
              <Icon name="customers" className="h-3.5 w-3.5" />
              {assignee || "Unassigned"}
            </button>
            <button type="button" disabled={pending} onClick={() => go(() => assignToMeAction(id))} className={BUTTON_SMALL}>
              Assign to me
            </button>
          </>
        )}
      </div>
      <Share id={id} token={shareToken} />
      <Err error={error} />
    </div>
  );
}

function Share({ id, token }: { id: string; token: string | null }) {
  const { pending, error, go } = useAction();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser's origin after mount
  useEffect(() => setOrigin(window.location.origin), []);
  const url = token ? `${origin}/share/${token}` : null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
      {url ? (
        <>
          <span className="flex items-center gap-1 text-zinc-500">
            <Icon name="link" className="h-3.5 w-3.5" />
            Shared read-only
          </span>
          <code className="max-w-[260px] truncate rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-700">{url}</code>
          <button
            type="button"
            className={BUTTON_SMALL}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {}
            }}
          >
            <Icon name="copy" className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" disabled={pending} onClick={() => go(() => setSharingAction(id, false))} className={BUTTON_SMALL}>
            Stop sharing
          </button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => go(() => setSharingAction(id, true))} className={BUTTON_SMALL} title="A read-only link for contract manufacturers and suppliers">
          <Icon name="link" className="h-3.5 w-3.5" />
          Share link
        </button>
      )}
      <Err error={error} />
    </div>
  );
}

export function RediagnoseButton({ id, available, hasHypothesis }: { id: string; available: boolean; hasHypothesis: boolean }) {
  const { pending, error, go } = useAction();
  if (!available) return <p className="text-xs text-zinc-500">AI diagnosis isn&apos;t turned on for your organization.</p>;
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={() => go(() => diagnoseAction(id))} className={BUTTON_SMALL}>
        <Icon name="sparkle" className="h-3.5 w-3.5" />
        {pending ? "Diagnosing…" : hasHypothesis ? "Re-run diagnosis" : "Diagnose"}
      </button>
      <Err error={error} />
    </div>
  );
}

export function RunTestButton({ id }: { id: string }) {
  const { pending, error, go } = useAction();
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" disabled={pending || done} onClick={() => go(() => runSuggestedTestAction(id), () => setDone(true))} className={BUTTON}>
        <Icon name="play" className="h-3.5 w-3.5" />
        {done ? "Queued on the station" : pending ? "Queuing…" : "Approve and run"}
      </button>
      <Err error={error} />
    </div>
  );
}

const VERDICTS = [
  { key: "right", label: "Right", icon: "thumbUp" },
  { key: "partly", label: "Partly", icon: "activity" },
  { key: "wrong", label: "Wrong", icon: "thumbDown" },
] as const;

export function FeedbackForm({ id, mine }: { id: string; mine: Feedback | null }) {
  const { pending, error, go } = useAction();
  const [verdict, setVerdict] = useState<string | null>(mine?.verdict ?? null);
  const [note, setNote] = useState(mine?.note ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (verdict) go(() => feedbackAction(id, verdict, note), () => setSaved(true));
      }}
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Was this diagnosis right?">
        {VERDICTS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="radio"
            aria-checked={verdict === v.key}
            onClick={() => {
              setVerdict(v.key);
              setSaved(false);
            }}
            className={verdict === v.key ? `${BUTTON_SMALL_BASE} border-sky-600 bg-sky-50 text-sky-700` : BUTTON_SMALL}
          >
            <Icon name={v.icon} className="h-3.5 w-3.5" />
            {v.label}
          </button>
        ))}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What did it get right or wrong? (optional)" aria-label="Feedback note" className={`${INPUT_BASE} h-9 w-full text-xs`} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending || !verdict} className={BUTTON_SMALL}>
          {saved ? "Saved" : mine ? "Update feedback" : "Send feedback"}
        </button>
        <Err error={error} />
      </div>
    </form>
  );
}

export function CommentForm({ id }: { id: string }) {
  const { pending, error, go } = useAction();
  const [body, setBody] = useState("");
  return (
    <form
      className="flex flex-col gap-2 border-t border-zinc-100 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        go(() => addCommentAction(id, body), () => setBody(""));
      }}
    >
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} placeholder="Add a comment for the team, the CM or the supplier…" aria-label="Comment" className={TEXTAREA} />
      <div className="flex items-center justify-between gap-2">
        <Err error={error} />
        <button type="submit" disabled={pending || !body.trim()} className={`${BUTTON_SECONDARY} ml-auto`}>
          {pending ? "Posting…" : "Comment"}
        </button>
      </div>
    </form>
  );
}
