import { requireUser } from "@/lib/auth";
import { askAssistant, QUESTION_MAX } from "@/lib/ai/assistant";
import { AiBlocked, AiFailed } from "@/lib/ai/run";
import { isUuid } from "@/lib/fixt/validate";

// Ask FIXT. Streams the answer as newline-delimited JSON:
//   {"type":"text","text":"…"}            pieces of the answer, in order
//   {"type":"done","conversationId":"…"}  finished and saved
//   {"type":"error","message":"…"}        stopped; the message is safe to show
// The organization comes from the session (lib/ai/assistant.ts), never the body.

export const maxDuration = 150;

export async function POST(req: Request) {
  await requireUser();

  let body: { conversationId?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "Type a question first." }, { status: 400 });
  if (message.length > QUESTION_MAX) return Response.json({ error: `Keep questions under ${QUESTION_MAX} characters.` }, { status: 400 });
  const conversationId = isUuid(body.conversationId) ? body.conversationId : null;

  const encoder = new TextEncoder();
  // When the browser goes away (Stop, closed tab), stop the model too, so nobody pays for an answer no one reads.
  const stop = new AbortController();
  req.signal.addEventListener("abort", () => stop.abort());
  let open = true;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const id = await askAssistant(conversationId, message, (text) => send({ type: "text", text }), stop.signal);
        send({ type: "done", conversationId: id });
      } catch (err) {
        const safe = err instanceof AiBlocked || err instanceof AiFailed;
        if (!safe && !stop.signal.aborted) console.error("Ask FIXT failed", err);
        send({ type: "error", message: safe ? err.message : "Something went wrong. Please try again." });
      } finally {
        if (open) controller.close();
        open = false;
      }
    },
    cancel() {
      open = false;
      stop.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
