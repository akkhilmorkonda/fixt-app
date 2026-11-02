<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Authentication (FIXT platform)

Every route requires a Clerk session. Keep it that way:

- `proxy.ts` denies by default. Only the exact paths in `PUBLIC_PATHS` (and `/share/<token>`) are reachable signed out. Don't widen the matcher or add public paths without a reason.
- New pages go in `app/(protected)/` and call `await requireUser()` from `lib/auth.ts` at the top, even though the group layout also checks.
- Every Server Action and Route Handler must call `await requireUser()` before reading or writing data. Layouts don't cover them.
- The exceptions are in `WEBHOOKS` in `proxy.ts`: `/api/ingest` authenticates with a connector key (only its SHA-256 is stored, in `fx_connectors.key_hash`), and `/api/cron/weekly-summary` with `CRON_SECRET`. `/share/<token>` pages are read-only and the token is the credential (`getSharedInvestigation`). Keep it that way for any new one.

## Data (Supabase)

- The organization a request acts for comes only from `currentTenant()` in `lib/tenant.ts` (the member's Clerk organization, or the one a platform admin opened). Never take a tenant id from the browser, and never fall back to the user id.
- All FIXT data access goes through `lib/fixt/repo.ts`, which starts from `currentTenant()` and filters every query by `tenant_id`. The no-session paths (`lib/fixt/ingest.ts`, `lib/ai/summary.ts`) take the tenant id from the connector key or the settings row and filter by it the same way.
- Cross-organization access is only for platform admins, through `lib/admin.ts`: every function calls `requireAdmin()` and every write calls `auditAdmin()`.
- New tenant-owned tables need `tenant_id text not null references tenants (id) on update cascade on delete cascade`, and any reference to another tenant-owned row must include `tenant_id` in the foreign key.
- `lib/supabase/admin.ts` uses the secret key and bypasses RLS. Only import it from `server-only` modules in `lib/`, never from client components or pages directly.
- New tables get RLS enabled with no policies, and access revoked from `anon` and `authenticated` (see the loop at the end of `20261101120000_fixt.sql`).
- Every model call goes through `runAi()` in `lib/ai/run.ts` (budgets, rate limits, tracing, fallback).
- Agent changes to the line (limits, sequences, calibration, baselines, lot quarantine) are rows in `fx_actions`. They're applied only by `decideAction()` / `rollbackAction()` in the repo, which write `change.after` / restore `change.before` and log to `fx_agent_log`. Don't change a station or test from anywhere else on an agent's behalf.
- Schema changes go in a new file in `supabase/migrations/`. Never edit an applied migration.
