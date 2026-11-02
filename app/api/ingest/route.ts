import { connectorForKey, ingest } from "@/lib/fixt/ingest";
import { csvToResults, parseIngest } from "@/lib/fixt/validate";

// Test results from stations. No session: the connector key in
// `Authorization: Bearer fxk_…` decides the organization (see proxy.ts WEBHOOKS).
//
//   POST /api/ingest   Content-Type: application/json
//   [{ "station": "FRE1 FCT-3", "test": "HR LED drive current", "value": 20.4, "unit": "mA",
//      "lsl": 18, "usl": 22, "serial": "PB123456", "measured_at": "2026-11-01T14:05:00Z",
//      "board_rev": "C", "lot": "LED-4410", "shift": "A" }]
//
//   POST /api/ingest   Content-Type: text/csv   (same columns, header row first)

export const maxDuration = 60;

export async function POST(req: Request) {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const connector = await connectorForKey(key);
  if (!connector) return Response.json({ error: "Invalid or missing connector key" }, { status: 401 });
  if (connector.status === "paused") return Response.json({ error: "This connector is paused in FIXT" }, { status: 409 });

  const type = req.headers.get("content-type") ?? "";
  const raw = await req.text();
  if (raw.length > 5_000_000) return Response.json({ error: "Request too large (5 MB max)" }, { status: 413 });
  let body: unknown;
  try {
    body = type.includes("csv") ? csvToResults(raw) : JSON.parse(raw);
  } catch {
    return Response.json({ error: "Body isn't valid JSON" }, { status: 400 });
  }

  const parsed = parseIngest(body);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  if (!parsed.rows.length) return Response.json({ stored: 0, rejected: parsed.errors }, { status: 400 });

  const result = await ingest(connector.tenant_id, connector.id, parsed.rows);
  return Response.json({ ...result, rejected: parsed.errors });
}
