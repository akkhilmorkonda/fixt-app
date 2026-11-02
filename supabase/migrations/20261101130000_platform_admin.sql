-- Second platform admin, alongside the one added in 20261101100000_platform.sql.
insert into public.platform_admins (email) values ('amorkonda28@gmail.com') on conflict (email) do nothing;
