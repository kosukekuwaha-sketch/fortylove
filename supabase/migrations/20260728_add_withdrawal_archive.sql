-- 退会者情報を最高情報責任者だけが確認するための保管テーブル
create table if not exists public.membership_withdrawals (
  id bigint generated always as identity primary key,
  former_user_id uuid not null,
  name text not null,
  university text not null default '',
  faculty text not null default '',
  department text not null default '',
  grade smallint,
  email text not null default '',
  line_id text,
  tennis_experience text not null default '',
  has_racket boolean not null default false,
  reservation_history jsonb not null default '[]'::jsonb,
  withdrawal_source text not null check (withdrawal_source in ('self', 'admin')),
  withdrawn_by uuid references public.users(id) on delete set null,
  withdrawn_at timestamptz not null default now()
);

alter table public.membership_withdrawals enable row level security;

grant select, insert
on table public.membership_withdrawals
to service_role;

grant usage, select
on all sequences in schema public
to service_role;
