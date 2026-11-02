import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { severityOf, type AlertChannel, type Severity } from "./types";

// Sends alerts to an organization's channels: Slack and Teams incoming
// webhooks, PagerDuty Events v2 and email (Resend). Each organization brings
// its own webhook URLs and routing keys; only email uses a platform key.
// Failures are recorded on the channel and never break the caller.

export type Notice = { title: string; detail: string; severity: Severity; url: string | null; dedupKey: string };

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? null;
export const absolute = (path: string) => (appUrl() ? `${appUrl()}${path}` : null);

export const emailReady = () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;

export async function sendEmail(to: string[], subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("Email isn't configured (RESEND_API_KEY, EMAIL_FROM)");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function deliver(c: AlertChannel, n: Notice) {
  const link = n.url ? `\n${n.url}` : "";
  switch (c.kind) {
    case "slack":
      return post(c.target, { text: `*[${severityOf(n.severity).label}] ${n.title}*\n${n.detail}${link}` });
    case "teams":
      return post(c.target, { text: `**[${severityOf(n.severity).label}] ${n.title}**\n\n${n.detail}${link}` });
    case "pagerduty":
      return post("https://events.pagerduty.com/v2/enqueue", {
        routing_key: c.target,
        event_action: "trigger",
        dedup_key: n.dedupKey,
        payload: { summary: n.title.slice(0, 1000), source: "fixt", severity: n.severity === "critical" ? "critical" : n.severity === "high" ? "error" : n.severity === "medium" ? "warning" : "info", custom_details: { detail: n.detail } },
        links: n.url ? [{ href: n.url, text: "Open in FIXT" }] : [],
      });
    case "email":
      return sendEmail([c.target], `[FIXT ${severityOf(n.severity).label}] ${n.title}`, `${n.detail}${link}`);
  }
}

/** Sends a notice to every enabled channel at or above its minimum severity. */
export async function notify(tenantId: string, n: Notice) {
  const db = createAdminSupabase();
  const { data } = await db.from("fx_alert_channels").select("id, kind, target, label, min_severity, enabled, last_sent_at, last_error").eq("tenant_id", tenantId).eq("enabled", true).returns<AlertChannel[]>();
  const rank = severityOf(n.severity).rank;
  await Promise.all(
    (data ?? [])
      .filter((c) => rank >= severityOf(c.min_severity).rank)
      .map(async (c) => {
        try {
          await deliver(c, n);
          await db.from("fx_alert_channels").update({ last_sent_at: new Date().toISOString(), last_error: null }).eq("tenant_id", tenantId).eq("id", c.id);
        } catch (err) {
          console.error(`Alert to ${c.kind} failed`, err);
          await db.from("fx_alert_channels").update({ last_error: String(err instanceof Error ? err.message : err).slice(0, 500) }).eq("tenant_id", tenantId).eq("id", c.id);
        }
      }),
  );
}

/** A test message, so people can check a channel works before relying on it. */
export async function testChannel(c: AlertChannel) {
  await deliver(c, { title: "Test alert from FIXT", detail: "If you can read this, alerts will reach this channel.", severity: c.min_severity, url: absolute("/alerts"), dedupKey: `test-${c.id}` });
}
