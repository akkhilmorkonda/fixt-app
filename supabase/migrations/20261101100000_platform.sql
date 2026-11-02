-- FIXT platform: organizations, platform admins and their audit trail.
--
-- Every tenant-owned table references tenants (id), keyed by the Clerk
-- organization id, and cascades on UPDATE so moving to the production Clerk
-- instance is `update tenants set id = ...`. An organization can only be
-- hard-deleted once it has been archived.
--
-- RLS is on with no policies and anon/authenticated have no grants: only
-- server code holding the secret key reaches these tables, and it scopes every
-- query by tenant_id (lib/tenant.ts decides which one).

-- Shared trigger helpers -------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- tenant_id may change only when it cascades from tenants.id (a re-key).
create function public.keep_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id and pg_trigger_depth() < 2 then
    raise exception 'tenant_id cannot change';
  end if;
  return new;
end;
$$;

-- Tenants -------------------------------------------------------------------------------

create table public.tenants (
  id text primary key check (char_length(id) between 1 and 64 and id ~ '^[A-Za-z0-9_-]+$'),
  name text not null default '' check (char_length(name) <= 120),
  -- active: normal. suspended: members are locked out and no alerts go out.
  -- archived: same as suspended, and the organization may be deleted.
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  status_reason text check (char_length(status_reason) <= 500),
  admin_notes text check (char_length(admin_notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenants_touch before update on public.tenants
  for each row execute function public.touch_updated_at();

create function public.tenants_guard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'archived' then
    raise exception 'archive organization % before deleting it', old.id;
  end if;
  return old;
end;
$$;

create trigger tenants_guard_delete before delete on public.tenants
  for each row execute function public.tenants_guard_delete();

-- Platform admins and their audit trail ----------------------------------------------

create table public.platform_admins (
  -- Matched against the signed-in user's verified email addresses in Clerk.
  email text primary key check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  added_at timestamptz not null default now(),
  note text
);

insert into public.platform_admins (email) values ('28shashwat@gmail.com');

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_user_id text not null,
  admin_email text not null,
  tenant_id text references public.tenants (id) on update cascade on delete set null,
  action text not null check (char_length(action) <= 80),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index admin_audit_log_tenant_idx on public.admin_audit_log (tenant_id, created_at desc);
create index admin_audit_log_recent_idx on public.admin_audit_log (created_at desc);

-- Registers an organization the first time one of its members signs in, and
-- returns its status, in one round trip per request.
create function public.platform_touch_tenant(p_id text, p_name text default null)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  insert into public.tenants (id, name) values (p_id, coalesce(left(p_name, 120), ''))
  on conflict (id) do nothing;
  select status into v_status from public.tenants where id = p_id;
  return v_status;
end;
$$;

-- Lock down ---------------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.platform_admins enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on public.tenants, public.platform_admins, public.admin_audit_log from anon, authenticated;

revoke execute on function
  public.touch_updated_at(), public.keep_tenant(), public.tenants_guard_delete(),
  public.platform_touch_tenant(text, text)
  from public, anon, authenticated;
