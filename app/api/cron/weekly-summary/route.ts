import { timingSafeEqual } from "node:crypto";
import { dueWeeklySummaries, sendWeeklySummary } from "@/lib/ai/summary";
import { emailReady } from "@/lib/fixt/notify";

// Monday summaries, called by the scheduler (Vercel Cron) with
// `Authorization: Bearer $CRON_SECRET`. No session (see proxy.ts WEBHOOKS).

export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!emailReady()) return Response.json({ sent: 0, skipped: "Email isn't configured" });
  const due = await dueWeeklySummaries();
  let sent = 0;
  const failed: string[] = [];
  for (const s of due) {
    try {
      await sendWeeklySummary(s.tenant_id, s.weekly_summary_to);
      sent++;
    } catch (err) {
      console.error("Weekly summary failed", s.tenant_id, err);
      failed.push(s.tenant_id);
    }
  }
  return Response.json({ sent, failed: failed.length });
}
