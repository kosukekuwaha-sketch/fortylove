-- 一般ユーザーから寄せられた質問を、管理者が回答・公開するための受信箱
create table if not exists public.faq_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  question text not null check (char_length(trim(question)) between 5 and 500),
  status text not null default 'pending' check (status in ('pending', 'answered', 'dismissed')),
  published_faq_id uuid references public.faqs(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists faq_questions_status_created_idx
on public.faq_questions (status, created_at);

alter table public.faq_questions enable row level security;

grant select, insert, update, delete
on table public.faq_questions
to service_role;
