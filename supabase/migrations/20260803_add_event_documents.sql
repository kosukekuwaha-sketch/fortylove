-- イベントに添付するPDFのメタデータ
create table if not exists public.event_documents (
  event_id uuid primary key references public.events(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_documents enable row level security;

grant select, insert, update, delete
on table public.event_documents
to service_role;

-- PDF本体を保存する非公開Storageバケット
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-documents', 'event-documents', false, 15728640, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
