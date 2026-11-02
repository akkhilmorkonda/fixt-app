-- Platform admin for the usefixt.ai work account.
insert into public.platform_admins (email) values ('akkhil@usefixt.ai') on conflict (email) do nothing;
