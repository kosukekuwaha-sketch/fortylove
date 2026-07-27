alter table public.users
add column if not exists department text not null default '';

grant select, insert, update, delete
on table public.users
to service_role;
