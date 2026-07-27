alter table public.users
add column if not exists has_racket boolean not null default false;

grant select, insert, update, delete
on table public.users
to service_role;
