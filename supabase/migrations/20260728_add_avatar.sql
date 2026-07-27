alter table public.users
add column if not exists avatar_url text;

grant select, update
on table public.users
to service_role;
