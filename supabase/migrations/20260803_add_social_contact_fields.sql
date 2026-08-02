-- 新歓生が共有しやすい任意の連絡先
alter table public.users
add column if not exists instagram_id text;

alter table public.users
add column if not exists line_display_name text;

alter table public.membership_withdrawals
add column if not exists instagram_id text;

alter table public.membership_withdrawals
add column if not exists line_display_name text;

grant select, insert, update, delete
on table public.users, public.membership_withdrawals
to service_role;
