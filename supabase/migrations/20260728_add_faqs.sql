-- 管理者が編集し、一般ユーザーへ公開するFAQ
create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null default 'その他',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faqs_display_order_idx
on public.faqs (is_published, sort_order, created_at);

alter table public.faqs enable row level security;

grant select, insert, update, delete
on table public.faqs
to service_role;
