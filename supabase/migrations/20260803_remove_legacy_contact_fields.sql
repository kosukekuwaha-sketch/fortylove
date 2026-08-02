-- 開発段階のため旧連絡先を廃止し、Instagram ID・LINE表示名へ一本化する
alter table public.users
drop column if exists email cascade;

alter table public.users
drop column if exists line_id cascade;

alter table public.membership_withdrawals
drop column if exists email cascade;

alter table public.membership_withdrawals
drop column if exists line_id cascade;
