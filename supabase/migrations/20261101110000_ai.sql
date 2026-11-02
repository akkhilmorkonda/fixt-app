-- AI: per-organization settings and limits, a usage ledger and the
-- assistant's conversations.
--
--   tenant_ai_settings   one row per organization (FIXT staff set it in /admin);
--                        no row means the defaults below
--   ai_usage             one row per model call: who, which feature, tokens, cost.
--                        ai_begin() checks every limit and reserves the row in
--                        one locked statement, so concurrent requests can't
--                        overspend
--   ai_conversations,    the Ask FIXT assistant; private to the member who
--   ai_messages          started the conversation
--
-- Same lockdown as the rest: RLS on with no policies, nothing granted to anon
-- or authenticated. Only server code with the secret key reaches these tables.

-- Settings ------------------------------------------------------------------------------

create table public.tenant_ai_settings (
  tenant_id text primary key references public.tenants (id) on update cascade on delete cascade,
  enabled boolean not null default true,
  -- null = the platform default (AI_PROVIDER / AI_MODEL, else Anthropic).
  provider text check (provider in ('anthropic', 'openai')),
  model text check (char_length(model) <= 100),
  -- Hard ceiling on spend per calendar month (UTC), in US cents.
  monthly_budget_cents integer not null default 2000 check (monthly_budget_cents between 0 and 10000000),
  -- Requests per organization per day (UTC), and per member per minute.
  daily_request_limit integer not null default 300 check (daily_request_limit between 0 and 100000),
  user_minute_limit integer not null default 12 check (user_minute_limit between 0 and 1000),
  -- Features switched off for this organization.
  disabled_features text[] not null default '{}'
    check (disabled_features <@ array['assistant', 'diagnosis', 'test_plan', 'weekly_summary']),
  updated_at timestamptz not null default now(),
  updated_by text
);

create trigger tenant_ai_settings_touch before update on public.tenant_ai_settings
  for each row execute function public.touch_updated_at();

-- Usage ---------------------------------------------------------------------------------

create table public.ai_usage (
  -- Also the LangSmith run id of the call's trace.
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  -- The Clerk user who asked; null for background work (weekly summaries).
  user_id text check (char_length(user_id) <= 64),
  feature text not null check (feature in ('assistant', 'diagnosis', 'test_plan', 'weekly_summary')),
  provider text not null check (char_length(provider) <= 20),
  model text not null check (char_length(model) <= 100),
  -- pending: running. ok / error: finished. A pending row counts its
  -- reservation against the budget until it finishes (or for 10 minutes).
  status text not null default 'pending' check (status in ('pending', 'ok', 'error')),
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  -- Millionths of a US dollar.
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  latency_ms integer check (latency_ms >= 0),
  error text check (char_length(error) <= 500),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (tenant_id, id)
);

create index ai_usage_tenant_idx on public.ai_usage (tenant_id, created_at desc);
create index ai_usage_user_idx on public.ai_usage (tenant_id, user_id, created_at desc);
create index ai_usage_recent_idx on public.ai_usage (created_at desc);

-- Assistant -----------------------------------------------------------------------------

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  user_id text not null check (char_length(user_id) <= 64),
  title text not null default '' check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create index ai_conversations_user_idx on public.ai_conversations (tenant_id, user_id, updated_at desc);

create trigger ai_conversations_touch before update on public.ai_conversations
  for each row execute function public.touch_updated_at();

create table public.ai_messages (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.tenants (id) on update cascade on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  usage_id uuid,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, conversation_id) references public.ai_conversations (tenant_id, id) on update cascade on delete cascade,
  foreign key (tenant_id, usage_id) references public.ai_usage (tenant_id, id) on update cascade on delete set null (usage_id)
);

create index ai_messages_conversation_idx on public.ai_messages (tenant_id, conversation_id, id);

-- tenant_id never changes on a row (only through a cascade from tenants).
create trigger tenant_ai_settings_keep_tenant before update of tenant_id on public.tenant_ai_settings
  for each row execute function public.keep_tenant();
create trigger ai_usage_keep_tenant before update of tenant_id on public.ai_usage
  for each row execute function public.keep_tenant();
create trigger ai_conversations_keep_tenant before update of tenant_id on public.ai_conversations
  for each row execute function public.keep_tenant();
create trigger ai_messages_keep_tenant before update of tenant_id on public.ai_messages
  for each row execute function public.keep_tenant();

-- Limits --------------------------------------------------------------------------------

-- Checks every limit for one model call and, when it may go ahead, records it
-- as pending with its estimated cost reserved. Returns
-- {"ok": true, "id": <usage id>} or {"ok": false, "reason": <why>}, where why
-- is one of: inactive, disabled, feature_disabled, budget, daily, minute.
--
-- Callers pass the platform kill switch and defaults; the organization's own
-- row (if any) overrides them. One advisory lock per organization serializes
-- the check and the insert, so two requests can't both take the last cent.
create function public.ai_begin(
  p_tenant_id text,
  p_user_id text,
  p_feature text,
  p_provider text,
  p_model text,
  p_reserve_micros bigint
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_settings public.tenant_ai_settings;
  v_enabled boolean := true;
  v_budget_micros bigint := 2000 * 10000;
  v_daily integer := 300;
  v_minute integer := 12;
  v_disabled text[] := '{}';
  v_spent bigint;
  v_today integer;
  v_minute_count integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai:' || p_tenant_id, 0));

  select status into v_status from public.tenants where id = p_tenant_id;
  if v_status is distinct from 'active' then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;

  select * into v_settings from public.tenant_ai_settings where tenant_id = p_tenant_id;
  if found then
    v_enabled := v_settings.enabled;
    v_budget_micros := v_settings.monthly_budget_cents::bigint * 10000;
    v_daily := v_settings.daily_request_limit;
    v_minute := v_settings.user_minute_limit;
    v_disabled := v_settings.disabled_features;
  end if;

  if not v_enabled then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;
  if p_feature = any (v_disabled) then
    return jsonb_build_object('ok', false, 'reason', 'feature_disabled');
  end if;

  -- Spend this month: finished calls at their real cost, running ones at
  -- their reservation (abandoned ones stop counting after 10 minutes).
  select coalesce(sum(case
           when u.status = 'pending' and u.created_at > now() - interval '10 minutes' then u.reserved_micros
           when u.status = 'pending' then 0
           else u.cost_micros
         end), 0)
    into v_spent
    from public.ai_usage u
   where u.tenant_id = p_tenant_id
     and u.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  if v_spent + greatest(p_reserve_micros, 0) > v_budget_micros then
    return jsonb_build_object('ok', false, 'reason', 'budget');
  end if;

  select count(*) into v_today
    from public.ai_usage u
   where u.tenant_id = p_tenant_id
     and u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if v_today >= v_daily then
    return jsonb_build_object('ok', false, 'reason', 'daily');
  end if;

  if p_user_id is not null then
    select count(*) into v_minute_count
      from public.ai_usage u
     where u.tenant_id = p_tenant_id and u.user_id = p_user_id
       and u.created_at > now() - interval '1 minute';
    if v_minute_count >= v_minute then
      return jsonb_build_object('ok', false, 'reason', 'minute');
    end if;
  end if;

  insert into public.ai_usage (tenant_id, user_id, feature, provider, model, reserved_micros)
  values (p_tenant_id, p_user_id, p_feature, p_provider, p_model, greatest(p_reserve_micros, 0))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- One organization's AI use this month, for its own pages and for /admin.
create function public.ai_month_summary(p_tenant_id text)
returns table (
  feature text,
  requests bigint,
  errors bigint,
  input_tokens bigint,
  output_tokens bigint,
  cost_micros bigint
)
language sql
stable
set search_path = ''
as $$
  select u.feature, count(*), count(*) filter (where u.status = 'error'),
         coalesce(sum(u.input_tokens), 0), coalesce(sum(u.output_tokens), 0), coalesce(sum(u.cost_micros), 0)
    from public.ai_usage u
   where u.tenant_id = p_tenant_id
     and u.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
   group by u.feature
   order by u.feature
$$;

-- Every organization's AI spend this month, for the /admin list.
create function public.ai_month_spend()
returns table (tenant_id text, requests bigint, cost_micros bigint)
language sql
stable
set search_path = ''
as $$
  select u.tenant_id, count(*), coalesce(sum(u.cost_micros), 0)
    from public.ai_usage u
   where u.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
   group by u.tenant_id
$$;

-- Lock down ---------------------------------------------------------------------------

alter table public.tenant_ai_settings enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

revoke all on public.tenant_ai_settings, public.ai_usage, public.ai_conversations, public.ai_messages
  from anon, authenticated;

revoke execute on function
  public.ai_begin(text, text, text, text, text, bigint),
  public.ai_month_summary(text),
  public.ai_month_spend()
  from public, anon, authenticated;
