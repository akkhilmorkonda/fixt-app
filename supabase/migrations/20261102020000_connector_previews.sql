-- Preview connectors (Snowflake, Jira, Google Drive, OneDrive). They connect by
-- account rather than an ingest key, so they keep their settings in config.

alter table public.fx_connectors drop constraint fx_connectors_kind_check;
alter table public.fx_connectors add constraint fx_connectors_kind_check
  check (kind in ('teststand', 'python', 'labview', 'mes', 'plm', 'erp', 'csv', 'field_returns', 'snowflake', 'jira', 'google_drive', 'onedrive'));

alter table public.fx_connectors add column config jsonb not null default '{}'
  check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 4000);
