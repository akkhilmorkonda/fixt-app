"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { timeAgo } from "@/lib/fixt/format";
import { CONNECTOR_KINDS, connectorKindOf, type Connector, type ConnectorKind } from "@/lib/fixt/types";
import { createConnectorAction, removeConnectorAction, rotateConnectorKeyAction, setConnectorStatusAction, syncConnectorAction, type ActionResult } from "../_actions/fixt";
import { Icon } from "../_ui/icons";
import { BUTTON, BUTTON_SECONDARY, BUTTON_SMALL, BUTTON_SMALL_BASE, INPUT, Pill } from "../_ui/kit";

const STATUS_TONE: Record<Connector["status"], string> = {
  connected: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  error: "bg-rose-50 text-rose-700 ring-rose-200",
  paused: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

const errorOf = (r: ActionResult<unknown>) => (r.ok ? null : r.error);

/** Shows a freshly issued key once, with a copy button. */
function KeyReveal({ value, onDone }: { value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs leading-5 text-amber-900">Copy this key now. FIXT keeps only a hash of it, so it won&apos;t be shown again. Put it in the station&apos;s config or secret store, not in source control.</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-amber-200 bg-white px-2 py-1.5 font-mono text-xs">{value}</code>
        <button
          type="button"
          className={BUTTON_SMALL}
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => undefined);
            setCopied(true);
          }}
        >
          <Icon name="copy" className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <button type="button" onClick={onDone} className="self-start text-xs font-medium text-amber-900 underline">
        I&apos;ve saved it
      </button>
    </div>
  );
}

export function AddConnector({ kind: fixedKind, compact }: { kind?: ConnectorKind; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ConnectorKind>(fixedKind ?? "teststand");
  const [name, setName] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const info = connectorKindOf(kind);

  const close = () => {
    setOpen(false);
    setKey(null);
    setName("");
    setConfig({});
    setError(null);
    setFieldErrors({});
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(true)} className={compact ? BUTTON_SMALL : BUTTON}>
        <Icon name="plus" className="h-3.5 w-3.5" />
        {compact ? "Add" : "Add connector"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-900/20 p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Add connector">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold">Add connector</h2>
              <button type="button" onClick={close} aria-label="Close" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
                <Icon name="close" />
              </button>
            </div>
            {key ? (
              <KeyReveal
                value={key}
                onDone={() => {
                  close();
                  router.refresh();
                }}
              />
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  start(async () => {
                    const r = await createConnectorAction(kind, name, config);
                    setError(errorOf(r));
                    setFieldErrors(r.ok ? {} : (r.fieldErrors ?? {}));
                    if (!r.ok || !r.value) return;
                    // Preview connectors have no key to show.
                    if (r.value.key) setKey(r.value.key);
                    else {
                      close();
                      router.refresh();
                    }
                  });
                }}
              >
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-zinc-700">Source</span>
                  <select value={kind} onChange={(e) => setKind(e.target.value as ConnectorKind)} className={INPUT} disabled={!!fixedKind}>
                    {CONNECTOR_KINDS.map((k) => (
                      <option key={k.key} value={k.key}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-zinc-500">{info.hint}</span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-zinc-700">Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder={info.preview ? info.label : "Fremont TestStand stations"} maxLength={120} className={INPUT} />
                </label>
                {info.preview?.fields.map((f) => (
                  <label key={f.key} className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-zinc-700">{f.label}</span>
                    <input value={config[f.key] ?? ""} onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })} placeholder={f.placeholder} maxLength={200} className={INPUT} />
                    {fieldErrors[f.key] && <span className="text-xs text-rose-600">{fieldErrors[f.key]}</span>}
                  </label>
                ))}
                {info.preview && <p className="text-xs leading-5 text-zinc-500">Preview: FIXT simulates this connection&apos;s sync. It doesn&apos;t ask for or store credentials.</p>}
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <button type="submit" disabled={pending || !name.trim()} className={BUTTON}>
                  {pending ? (info.preview ? "Connecting…" : "Creating…") : info.preview ? `Connect ${info.label}` : "Create and get key"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ConnectorRow({ connector: c }: { connector: Connector }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const preview = connectorKindOf(c.kind).preview;
  const act = (fn: () => Promise<ActionResult<unknown>>, after?: (r: ActionResult<unknown>) => void) =>
    start(async () => {
      const r = await fn();
      setError(errorOf(r));
      if (r.ok) {
        after?.(r);
        router.refresh();
      }
    });

  return (
    <li className={`flex flex-col gap-2 px-4 py-3 ${pending ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
        <Pill tone={STATUS_TONE[c.status]}>{c.status === "connected" ? "Connected" : c.status === "error" ? "Error" : "Paused"}</Pill>
      </div>
      <p className="text-xs tabular-nums text-zinc-500">
        {c.records_synced.toLocaleString()} {preview?.unit ?? "records"} · {c.last_sync_at ? `last sync ${timeAgo(c.last_sync_at)}` : "never synced"}
        {preview && Object.keys(c.config).length > 0 && ` · ${preview.fields.map((f) => c.config[f.key]).filter(Boolean).join(" / ")}`}
        {!preview && c.key_prefix && (
          <>
            {" · key "}
            <code className="font-mono">{c.key_prefix}…</code>
          </>
        )}
      </p>
      {c.last_error && <p className="text-xs text-rose-600">{c.last_error}</p>}
      {key && <KeyReveal value={key} onDone={() => setKey(null)} />}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={pending} className={BUTTON_SMALL} onClick={() => act(() => setConnectorStatusAction(c.id, c.status === "paused" ? "connected" : "paused"))}>
          {c.status === "paused" ? "Resume" : "Pause"}
        </button>
        {preview ? (
          <button type="button" disabled={pending || c.status === "paused"} className={BUTTON_SMALL} onClick={() => act(() => syncConnectorAction(c.id))}>
            {pending ? "Syncing…" : "Sync now"}
          </button>
        ) : (
          <button type="button" disabled={pending} className={BUTTON_SMALL} onClick={() => act(() => rotateConnectorKeyAction(c.id), (r) => r.ok && typeof r.value === "string" && setKey(r.value))}>
            <Icon name="key" className="h-3.5 w-3.5" />
            Rotate key
          </button>
        )}
        {confirming ? (
          <span className="flex items-center gap-1.5 text-xs text-zinc-600">
            {preview ? "FIXT stops syncing from it." : "Stations using this key will be refused."}
            <button type="button" disabled={pending} onClick={() => act(() => removeConnectorAction(c.id))} className="font-medium text-rose-600 hover:underline">
              Remove
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-zinc-500 hover:underline">
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" disabled={pending} className={`${BUTTON_SMALL_BASE} border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-rose-600`} onClick={() => setConfirming(true)}>
            Remove
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </li>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg bg-[#0c0c0d] px-3 py-2.5 font-mono text-[11px] leading-5 text-zinc-100">{children}</pre>;
}

export function SetupDocs({ endpoint }: { endpoint: string }) {
  const [tab, setTab] = useState<"json" | "curl" | "python" | "teststand">("curl");
  // Without NEXT_PUBLIC_APP_URL the endpoint is relative; show it against this browser's origin after mount.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser's origin after mount
    setOrigin(window.location.origin);
  }, []);
  const url = endpoint.startsWith("/") ? `${origin}${endpoint}` : endpoint;
  const json = `[
  {
    "station": "FRE1 FCT-3",
    "test": "HR LED drive current",
    "value": 20.41,
    "unit": "mA",
    "lsl": 18, "usl": 22,
    "serial": "PB123456",
    "measured_at": "2026-11-01T14:05:00Z",
    "board_rev": "C",
    "lot": "LED-4410",
    "shift": "A"
  }
]`;
  const snippets = {
    json,
    curl: `curl -X POST ${url} \\
  -H "Authorization: Bearer $FIXT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '[{"station":"FRE1 FCT-3","test":"HR LED drive current","value":20.41,"unit":"mA","lsl":18,"usl":22,"serial":"PB123456"}]'`,
    python: `import os, requests

def send_results(results):
    r = requests.post(
        "${url}",
        headers={"Authorization": f"Bearer {os.environ['FIXT_KEY']}"},
        json=results,  # list of dicts like the JSON example
        timeout=10,
    )
    r.raise_for_status()
    return r.json()  # {"stored": n, "alerts": n, "rejected": [...]}`,
    teststand: `In TestStand, add a result processor (or a
SequenceFilePostUUT callback) that, for each
numeric-limit step in the UUT report, posts:

  station   = Station Globals name
  test      = step name
  value     = Step.Result.Numeric
  lsl / usl = Step.Limits.Low / High
  serial    = UUT serial number
  passed    = Step.Result.Status == "Passed"

to ${url} with the header
Authorization: Bearer <connector key>.
Batch a whole UUT per request (up to 5,000 rows).`,
  };
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Endpoint</span>
        <code className="truncate rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs">POST {url}</code>
      </div>
      <div className="flex gap-1 border-b border-zinc-100" role="tablist">
        {(["curl", "python", "teststand", "json"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-2 py-1.5 text-xs ${tab === t ? "border-sky-600 font-medium text-sky-700" : "border-transparent text-zinc-600 hover:text-[#1a1a1a]"}`}
          >
            {t === "json" ? "JSON" : t === "curl" ? "curl" : t === "python" ? "Python" : "TestStand"}
          </button>
        ))}
      </div>
      <Code>{snippets[tab]}</Code>
      <p className="text-xs leading-5 text-zinc-500">Only station, test and value are required. Passed is worked out from the limits when you leave it out. CSV works too: send the same columns with a header row and Content-Type text/csv.</p>
    </div>
  );
}

type UploadResult = { stored?: number; alerts?: number; stationsCreated?: number; testsCreated?: number; rejected?: { index: number; error: string }[]; error?: string };

export function CsvUpload() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  return (
    <form
      className="flex flex-col gap-3 px-4 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file || !key.trim()) return;
        setBusy(true);
        setResult(null);
        try {
          if (file.size > 5_000_000) throw new Error("Files over 5 MB need to be split.");
          const res = await fetch("/api/ingest", { method: "POST", headers: { Authorization: `Bearer ${key.trim()}`, "Content-Type": "text/csv" }, body: await file.text() });
          const body = (await res.json().catch(() => ({ error: `Upload failed (${res.status})` }))) as UploadResult;
          setResult(body);
          if (res.ok) router.refresh();
        } catch (err) {
          setResult({ error: err instanceof Error ? err.message : "Upload failed" });
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm leading-6 text-zinc-600">
        Exports from any tester: a header row with <code className="rounded bg-zinc-100 px-1 text-xs">station,test,value</code> and optionally unit, lsl, usl, serial, measured_at, board_rev, lot, shift.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">CSV file</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-zinc-200 file:bg-white file:px-3 file:text-sm file:font-medium" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Connector key</span>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="fxk_…" autoComplete="off" spellCheck={false} className={`${INPUT} font-mono`} />
          <span className="text-xs text-zinc-500">From a Spreadsheets &amp; CSV connector. Used for this upload only; it isn&apos;t saved.</span>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !file || !key.trim()} className={BUTTON_SECONDARY}>
          <Icon name="upload" className="h-3.5 w-3.5" />
          {busy ? "Uploading…" : "Upload"}
        </button>
        {result && !result.error && (
          <span className="text-sm text-zinc-600">
            Stored {result.stored?.toLocaleString() ?? 0} results{result.alerts ? `, ${result.alerts} new alerts` : ""}
            {result.stationsCreated ? `, ${result.stationsCreated} new stations` : ""}
            {result.rejected?.length ? `, ${result.rejected.length} rows rejected` : ""}.
          </span>
        )}
        {result?.error && <span className="text-sm text-rose-600">{result.error}</span>}
      </div>
      {!!result?.rejected?.length && (
        <ul className="max-h-40 overflow-y-auto rounded-lg border border-zinc-200 text-xs">
          {result.rejected.slice(0, 50).map((r) => (
            <li key={r.index} className="border-b border-zinc-100 px-3 py-1.5 last:border-0">
              Row {r.index + 2}: <span className="text-rose-600">{r.error}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
