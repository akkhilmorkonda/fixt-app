"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ChatMessage, Conversation } from "@/lib/ai/assistant";
import { timeAgo } from "@/lib/fixt/format";
import { deleteConversationAction } from "../_actions/fixt";
import { Icon } from "../_ui/icons";

const SUGGESTIONS = [
  "Which stations are drifting?",
  "What's our first-pass yield by line this week?",
  "Which supplier lots have the worst ppm?",
  "What's waiting for my approval?",
];

const FIXT_LINK = /(\/(?:stations|investigations)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/** An answer's text, with links to stations and investigations made clickable. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(FIXT_LINK).map((part, i) =>
        i % 2 ? (
          <Link key={i} href={part} className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:decoration-sky-600">
            {part.startsWith("/stations") ? "open station" : "open investigation"}
          </Link>
        ) : (
          part
        ),
      )}
    </>
  );
}

type Turn = Pick<ChatMessage, "role" | "content"> & { id: string | number };

export default function AssistantUI({
  conversations,
  current,
  usagePercent,
}: {
  conversations: Conversation[];
  current: { id: string; messages: ChatMessage[] } | null;
  usagePercent: number | null;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>(current?.messages ?? []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Braces matter: scrollIntoView() returns a Promise in newer browsers, and an effect may only return a cleanup function.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [turns]);
  useEffect(() => () => abort.current?.abort(), []);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || streaming) return;
    setError(null);
    setInput("");
    const answerId = `a${Date.now()}`;
    setTurns((t) => [...t, { id: `q${Date.now()}`, role: "user", content: q }, { id: answerId, role: "assistant", content: "" }]);
    setStreaming(true);
    const controller = new AbortController();
    abort.current = controller;
    let doneId: string | null = null;

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: current?.id ?? null, message: q }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong. Please try again.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: "text"; text: string } | { type: "done"; conversationId: string } | { type: "error"; message: string };
          if (event.type === "text") setTurns((t) => t.map((x) => (x.id === answerId ? { ...x, content: x.content + event.text } : x)));
          else if (event.type === "done") doneId = event.conversationId;
          else throw new Error(event.message);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setTurns((t) => t.filter((x) => x.id !== answerId || x.content));
    } finally {
      setStreaming(false);
      abort.current = null;
    }
    // A new conversation gets its own URL; the server then shows the saved copy.
    if (doneId && doneId !== current?.id) router.replace(`/assistant?c=${doneId}`, { scroll: false });
    else if (doneId) router.refresh();
  }

  return (
    <div className="grid min-h-[60vh] grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden flex-col gap-1 lg:flex">
        <Link href="/assistant" className="mb-2 flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium transition hover:border-zinc-300 hover:bg-zinc-50">
          <Icon name="plus" className="h-3.5 w-3.5" />
          New question
        </Link>
        {conversations.map((c) => (
          <ConversationRow key={c.id} conversation={c} active={c.id === current?.id} />
        ))}
      </aside>

      <section className="flex min-w-0 flex-col">
        <div className="flex-1">
          {turns.length === 0 ? (
            <div className="flex flex-col items-start gap-4 pt-4">
              <p className="max-w-xl text-sm leading-6 text-zinc-500">
                Ask about your stations, yield, drift, false failures, investigations and supplier lots. Answers come from your FIXT data. Ask FIXT can look things up but can&apos;t change anything on the line.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="flex flex-col gap-5">
              {turns.map((t) => (
                <li key={t.id} className={t.role === "user" ? "flex justify-end" : "flex"}>
                  {t.role === "user" ? (
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-zinc-100 px-3.5 py-2 text-sm leading-6">{t.content}</div>
                  ) : (
                    <div className="flex max-w-[95%] gap-3">
                      <Icon name="sparkle" className="mt-1 text-sky-600" />
                      <div className="min-w-0 whitespace-pre-wrap text-sm leading-6">
                        {t.content ? <Rich text={t.content} /> : <span className="text-zinc-400">Looking it up…</span>}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          <div ref={bottom} />
        </div>

        {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="sticky bottom-4 mt-6 flex items-end gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Ask about your fleet, yield or investigations…"
            aria-label="Your question"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 placeholder:text-zinc-400 focus:outline-none"
          />
          {streaming ? (
            <button type="button" onClick={() => abort.current?.abort()} className="h-9 rounded-lg border border-zinc-200 px-3 text-sm font-medium hover:bg-zinc-50">
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-3 text-sm font-medium text-white transition hover:bg-[#383838] disabled:opacity-40">
              <Icon name="send" className="h-3.5 w-3.5" />
              Ask
            </button>
          )}
        </form>
        <p className="mt-2 text-[11px] text-zinc-400">
          AI can make mistakes; check important numbers against the station data.
          {usagePercent !== null && usagePercent >= 50 ? ` ${usagePercent}% of this month's AI budget used.` : ""}
        </p>
      </section>
    </div>
  );
}

function ConversationRow({ conversation, active }: { conversation: Conversation; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () =>
    start(async () => {
      const r = await deleteConversationAction(conversation.id);
      if (r.ok) router.replace(active ? "/assistant" : `/assistant${window.location.search}`);
      router.refresh();
    });
  return (
    <div className={`group flex items-center gap-1 rounded-md pr-1 ${active ? "bg-zinc-100" : "hover:bg-zinc-50"} ${pending ? "opacity-50" : ""}`}>
      <Link href={`/assistant?c=${conversation.id}`} className="min-w-0 flex-1 px-2 py-1.5">
        <span className="block truncate text-sm">{conversation.title || "Untitled"}</span>
        <span className="block text-[11px] text-zinc-400">{timeAgo(conversation.updated_at)}</span>
      </Link>
      <button type="button" onClick={remove} disabled={pending} aria-label="Delete conversation" className="rounded p-1 text-zinc-400 opacity-0 transition hover:text-rose-600 focus:opacity-100 group-hover:opacity-100">
        <Icon name="trash" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
