import { requireUser } from "@/lib/auth";
import { getFleet, getYield, listFailures, listLots } from "@/lib/fixt/repo";
import { lotQuality } from "@/lib/fixt/metrics";

// CSV exports for management reviews and customer audits. The organization
// comes from the session (lib/fixt/repo), never the query string.

/** One CSV cell: quoted when needed, and guarded against spreadsheet formula injection. */
function cell(v: unknown) {
  if (v == null) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csv = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export async function GET(req: Request) {
  await requireUser();
  const url = new URL(req.url);
  const report = url.searchParams.get("report");
  const n = Number(url.searchParams.get("days") ?? 30);
  const days = Number.isInteger(n) && n >= 1 && n <= 365 ? n : 30;

  let body: string;
  if (report === "failures") {
    const [failures, fleet, lots] = await Promise.all([listFailures(days), getFleet(), listLots()]);
    const station = new Map(fleet.stations.map((s) => [s.id, s.name]));
    const lot = new Map(lots.map((l) => [l.id, l]));
    body = csv(
      ["failed_at", "station", "serial", "mode", "shift", "board_rev", "lot", "supplier", "retest_passed", "false_failure", "field_return", "scrap_cost", "rework_minutes", "retest_minutes"],
      failures.map((f) => [f.failed_at, station.get(f.station_id), f.serial, f.mode, f.shift, f.board_rev, f.lot_id ? lot.get(f.lot_id)?.lot_code : "", f.lot_id ? lot.get(f.lot_id)?.supplier : "", f.retest_passed, f.false_failure, f.escaped, f.scrap_cost, f.rework_minutes, f.retest_minutes]),
    );
  } else if (report === "lots") {
    const [lots, failures] = await Promise.all([listLots(), listFailures(days)]);
    body = csv(
      ["part", "lot", "supplier", "received_on", "units", "failures", "ppm", "field_returns", "quarantined"],
      lotQuality(lots, failures).map((l) => [l.part, l.lot_code, l.supplier, l.received_on, l.units, l.failures, l.ppm, l.escapes, l.quarantined]),
    );
  } else if (report === "yield") {
    const [rows, fleet] = await Promise.all([getYield(days), getFleet()]);
    const line = new Map(fleet.lines.map((l) => [l.id, l.name]));
    body = csv(
      ["day", "line", "shift", "units", "first_pass", "final_pass", "first_pass_yield", "final_yield"],
      rows.map((r) => [r.day, line.get(r.line_id), r.shift, r.units, r.first_pass, r.final_pass, r.units ? (r.first_pass / r.units).toFixed(4) : "", r.units ? (r.final_pass / r.units).toFixed(4) : ""]),
    );
  } else {
    return Response.json({ error: "report must be failures, lots or yield" }, { status: 400 });
  }

  const name = `fixt-${report}-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
