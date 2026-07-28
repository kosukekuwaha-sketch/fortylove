-- FAQ登録時に選択するカテゴリ
create table if not exists public.faq_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.faq_categories (name, sort_order)
values
  ('初めての方へ', 10),
  ('練習・イベント', 20),
  ('予約・キャンセル', 30),
  ('入会について', 40),
  ('持ち物・ラケット', 50),
  ('その他', 90)
on conflict (name) do nothing;

alter table public.faq_categories enable row level security;

grant select, insert, update, delete
on table public.faq_categories
to service_role;
