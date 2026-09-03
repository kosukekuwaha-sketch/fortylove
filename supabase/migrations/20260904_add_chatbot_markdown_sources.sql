-- Markdown資料から取り込んだ回答データの出典と重複防止情報
alter table public.chatbot_knowledge
  add column if not exists source_type text check (source_type in ('markdown')),
  add column if not exists source_name text,
  add column if not exists source_section text,
  add column if not exists source_hash text;

create unique index if not exists chatbot_knowledge_source_section_unique
on public.chatbot_knowledge (source_hash, source_section);
