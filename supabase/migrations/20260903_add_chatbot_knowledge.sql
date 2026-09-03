-- super_admin専用のWebチャットBot回答データと非公開初期設定
alter table public.app_settings
  add column if not exists chatbot_enabled boolean not null default false,
  add column if not exists chatbot_faq_enabled boolean not null default false,
  add column if not exists chatbot_event_enabled boolean not null default true,
  add column if not exists chatbot_fallback_message text not null
    default 'この質問はまだ回答データがありません。担当者が確認できるよう、回答内容を追加してください。';

create table if not exists public.chatbot_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 100),
  content text not null check (char_length(trim(content)) between 2 and 2000),
  category text not null default '基本情報' check (char_length(trim(category)) between 1 and 50),
  keywords text[] not null check (cardinality(keywords) between 1 and 20),
  priority integer not null default 0 check (priority between 0 and 100),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chatbot_knowledge_active_priority_idx
on public.chatbot_knowledge (is_active, priority desc, updated_at desc);

alter table public.chatbot_knowledge enable row level security;

grant select, insert, update, delete
on table public.chatbot_knowledge
to service_role;
