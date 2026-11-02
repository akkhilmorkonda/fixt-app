# FIXT

AI agents for manufacturing test: they hold each station's baseline, catch drift, root-cause
failures and help stand up test for new products. Built on the same stack and structure as the
BRIX platform: Next.js 16, Clerk for sign-in and organizations, Supabase for data, LangChain +
LangSmith for the agents.

## Screens

| Area | Route | What it does |
|---|---|---|
| Fleet overview | `/` | Sites, lines and stations with live status; first-pass/final yield by line and shift with trends; open issues ranked by severity and units at risk; agent activity; value counters |
| Stations | `/stations`, `/stations/[id]` | Control charts, distributions vs. limits, Cpk, fixture health, sibling comparison, raw log |
| Drift & anomalies | `/drift` | Drift alerts with baseline/current/start, classification, false-failure tracker, baselines |
| Investigations | `/investigations`, `/investigations/[id]` | Joined timeline, agent hypothesis + evidence + confidence, one-click suggested test, similar failures, time to root cause, comments, feedback, share link |
| Approvals | `/approvals` | Queue of agent changes to the line; approve, reject, roll back |
| Agent control | `/agents`, `/agents/audit` | Autonomy per line, diagnosis accuracy from engineer feedback, full audit log |
| Bring-up | `/bringup` | Design notes in, generated test plan + limits + coverage map out; golden units; stage tracker |
| Shift handoffs | `/handoffs` | Notes between shifts per line |
| Analytics | `/analytics` | Paretos by mode/station/shift/supplier, lot quality, cost of quality, CSV export |
| ROI | `/roi` | Hours saved, escapes prevented, time-to-diagnosis, value vs. price |
| Ask FIXT | `/assistant` | Chat over the organization's own test data (read-only tools) |
| Admin | `/integrations`, `/alerts`, `/team`, `/settings` | Connectors + ingest keys, Slack/Teams/email/PagerDuty routing, roles, ROI assumptions, weekly summary, deployment |
| Shared link | `/share/<token>` | Read-only investigation for contract manufacturers and suppliers |
| Platform admin | `/admin` | Every organization, AI budgets and limits (FIXT staff only) |

## Setup

1. `npm install`
2. Local database (Docker running): `npx supabase@latest start` (ports 563xx, so it runs next to
   BRIX's stack). It applies `supabase/migrations/`.
3. `.env.local` (never commit it):

   ```bash
   # Clerk (required; a new Clerk app for FIXT with Organizations on)
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
   CLERK_SECRET_KEY=
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

   # Supabase (server-only secret key; the app never uses the anon key)
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:56321
   SUPABASE_SECRET_KEY=

   # AI: at least one provider; the LangSmith key alone turns on tracing
   ANTHROPIC_API_KEY=
   OPENAI_API_KEY=
   LANGSMITH_API_KEY=

   # Email for the weekly summary and email alerts
   RESEND_API_KEY=
   EMAIL_FROM="FIXT <reports@yourdomain.com>"

   # Scheduler secret for /api/cron/* (openssl rand -base64 32)
   CRON_SECRET=
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. `npm run dev`, sign in, create an organization, then **Load demo data** on the empty fleet page.

Slack, Teams and PagerDuty need no platform keys: each organization pastes its own incoming
webhook URL or routing key on `/alerts`.

## Connecting real stations

Create a connector on `/integrations` to get an ingest key, then post results:

```bash
curl -X POST "$APP_URL/api/ingest" \
  -H "Authorization: Bearer fxk_…" -H "Content-Type: application/json" \
  -d '[{"station":"FRE1 FCT-3","test":"HR LED drive current","value":20.4,"unit":"mA","lsl":18,"usl":22,"serial":"PB123456","lot":"LED-4410"}]'
```

CSV works too (`Content-Type: text/csv`, same column names). Unknown stations and tests are
created under "Unassigned"; the first 30 results of a test become its baseline; after that every
batch runs the drift agent (EWMA), which raises an alert, proposes a recalibration (unless the line
is suggest-only) and notifies the organization's channels.

## Clerk

- Turn on **Organizations** and make them required: every FIXT workspace is an organization.
- Sign-up mode **Public** lets anyone create an account with Google. Set it to **Restricted** to
  make FIXT invite-only again (Google then only signs in existing users).

## Tests

- `npm run test:unit`: SPC math, ROI and quality metrics, validation.
- `npm run test:integration`: demo seed, approvals and rollback, tenant isolation, sharing, ingest
  and drift, against the local Supabase (refuses any other database).
