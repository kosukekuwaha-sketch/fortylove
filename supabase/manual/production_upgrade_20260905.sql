-- Fortylove existing-production upgrade through 2026-09-05.
-- Run this file once in Supabase SQL Editor after taking a backup.
-- This script is additive: it does not delete users, events, reservations, or legacy columns.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'users', 'events', 'event_documents', 'reservations',
    'membership_withdrawals', 'app_settings', 'audit_logs'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'Required base table public.% is missing. Use supabase/schema.sql for an empty project.', v_table;
    end if;
  end loop;
end;
$$;

create extension if not exists pgcrypto;

alter table public.users
  add column if not exists session_version integer not null default 1
  check (session_version > 0);

alter table public.app_settings
  add column if not exists chatbot_enabled boolean not null default false,
  add column if not exists chatbot_faq_enabled boolean not null default false,
  add column if not exists chatbot_event_enabled boolean not null default true,
  add column if not exists chatbot_fallback_message text not null
    default 'この質問はまだ回答データがありません。担当者が確認できるよう、回答内容を追加してください。',
  add column if not exists chatbot_admin_enabled boolean not null default false,
  add column if not exists chatbot_member_enabled boolean not null default false,
  add column if not exists chatbot_admin_sources text[] not null default '{}',
  add column if not exists chatbot_member_sources text[] not null default '{}';

alter table public.app_settings
  add column if not exists chatbot_escalation_email text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_settings_chatbot_escalation_email_check'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_chatbot_escalation_email_check
      check (
        chatbot_escalation_email is null
        or (
          char_length(chatbot_escalation_email) <= 254
          and chatbot_escalation_email ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'
        )
      );
  end if;
end;
$$;

create table if not exists public.chatbot_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 100),
  content text not null check (char_length(trim(content)) between 2 and 2000),
  category text not null default '基本情報' check (char_length(trim(category)) between 1 and 50),
  keywords text[] not null check (cardinality(keywords) between 1 and 20),
  priority integer not null default 0 check (priority between 0 and 100),
  is_active boolean not null default true,
  source_type text check (source_type in ('markdown')),
  source_name text,
  source_section text,
  source_hash text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chatbot_knowledge
  add column if not exists source_type text check (source_type in ('markdown')),
  add column if not exists source_name text,
  add column if not exists source_section text,
  add column if not exists source_hash text;

create index if not exists chatbot_knowledge_active_priority_idx
  on public.chatbot_knowledge (is_active, priority desc, updated_at desc);
create unique index if not exists chatbot_knowledge_source_section_unique
  on public.chatbot_knowledge (source_hash, source_section);

create table if not exists public.chatbot_daily_usage (
  user_id uuid not null references public.users(id) on delete cascade,
  usage_date date not null,
  message_count integer not null default 0 check (message_count between 0 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table if not exists public.login_rate_limits (
  key_hash text primary key check (char_length(key_hash) = 64),
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from public.event_documents
    group by file_path having count(*) > 1
  ) then
    raise exception 'Duplicate event_documents.file_path values exist. Resolve them before this upgrade.';
  end if;
end;
$$;

create unique index if not exists event_documents_file_path_key
  on public.event_documents (file_path);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-documents', 'event-documents', false, 15728640, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.chatbot_knowledge enable row level security;
alter table public.chatbot_daily_usage enable row level security;
alter table public.login_rate_limits enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table
  public.chatbot_knowledge,
  public.chatbot_daily_usage,
  public.login_rate_limits
to service_role;

create or replace function public.consume_chatbot_message(p_user_id uuid, p_usage_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  consumed integer;
begin
  insert into public.chatbot_daily_usage (user_id, usage_date, message_count)
  values (p_user_id, p_usage_date, 1)
  on conflict (user_id, usage_date) do update
    set message_count = public.chatbot_daily_usage.message_count + 1,
        updated_at = now()
    where public.chatbot_daily_usage.message_count < 10
  returning message_count into consumed;
  return consumed is not null;
end;
$$;

create or replace function public.check_login_rate_limit(p_key_hash text)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(greatest(0, ceil(extract(epoch from (blocked_until - now())))::integer), 0)
  from public.login_rate_limits where key_hash = p_key_hash;
$$;

create or replace function public.record_login_failure(
  p_key_hash text,
  p_window_seconds integer default 600,
  p_max_failures integer default 5,
  p_block_seconds integer default 600
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blocked_until timestamptz;
begin
  if char_length(p_key_hash) <> 64 or p_window_seconds < 1 or p_max_failures < 1 or p_block_seconds < 1 then
    raise exception 'invalid login rate limit arguments';
  end if;
  insert into public.login_rate_limits (key_hash, failure_count, window_started_at, blocked_until, updated_at)
  values (p_key_hash, 1, now(), case when p_max_failures = 1 then now() + make_interval(secs => p_block_seconds) end, now())
  on conflict (key_hash) do update set
    failure_count = case
      when login_rate_limits.blocked_until > now() then login_rate_limits.failure_count
      when login_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
      else login_rate_limits.failure_count + 1
    end,
    window_started_at = case
      when login_rate_limits.blocked_until > now() then login_rate_limits.window_started_at
      when login_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
      else login_rate_limits.window_started_at
    end,
    blocked_until = case
      when login_rate_limits.blocked_until > now() then login_rate_limits.blocked_until
      when login_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then case when p_max_failures = 1 then now() + make_interval(secs => p_block_seconds) end
      when login_rate_limits.failure_count + 1 >= p_max_failures
        then now() + make_interval(secs => p_block_seconds)
      else null
    end,
    updated_at = now()
  returning blocked_until into v_blocked_until;
  return coalesce(greatest(0, ceil(extract(epoch from (v_blocked_until - now())))::integer), 0);
end;
$$;

create or replace function public.clear_login_rate_limit(p_key_hash text)
returns void
language sql
security definer
set search_path = public
as $$ delete from public.login_rate_limits where key_hash = p_key_hash; $$;

create or replace function public.consume_request_rate_limit(
  p_key_hash text,
  p_window_seconds integer,
  p_max_requests integer,
  p_block_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit public.login_rate_limits%rowtype;
begin
  if char_length(p_key_hash) <> 64 or p_window_seconds < 1 or p_max_requests < 1 or p_block_seconds < 1 then
    raise exception 'invalid request rate limit arguments';
  end if;
  insert into public.login_rate_limits (key_hash, failure_count, window_started_at, updated_at)
  values (p_key_hash, 0, now(), now()) on conflict (key_hash) do nothing;
  select * into v_limit from public.login_rate_limits where key_hash = p_key_hash for update;
  if v_limit.blocked_until > now() then return false; end if;
  if v_limit.window_started_at <= now() - make_interval(secs => p_window_seconds) then
    update public.login_rate_limits
    set failure_count = 1, window_started_at = now(), blocked_until = null, updated_at = now()
    where key_hash = p_key_hash;
    return true;
  end if;
  if v_limit.failure_count >= p_max_requests then
    update public.login_rate_limits
    set blocked_until = now() + make_interval(secs => p_block_seconds), updated_at = now()
    where key_hash = p_key_hash;
    return false;
  end if;
  update public.login_rate_limits set failure_count = failure_count + 1, updated_at = now()
  where key_hash = p_key_hash;
  return true;
end;
$$;

create or replace function public.reserve_event(p_user_id uuid, p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_starts_at timestamptz;
  v_existing_status public.reservation_status;
  v_reserved_count integer;
begin
  if not exists (select 1 from public.users where id = p_user_id) then return 'user_not_found'; end if;
  select capacity, starts_at into v_capacity, v_starts_at
  from public.events where id = p_event_id for update;
  if not found then return 'event_not_found'; end if;
  if v_starts_at <= now() then return 'event_started'; end if;
  select status into v_existing_status from public.reservations
  where user_id = p_user_id and event_id = p_event_id;
  if v_existing_status in ('reserved', 'attended') then return 'already_reserved'; end if;
  select count(*)::integer into v_reserved_count from public.reservations
  where event_id = p_event_id and status = 'reserved';
  if v_reserved_count >= v_capacity then return 'full'; end if;
  insert into public.reservations (user_id, event_id, status)
  values (p_user_id, p_event_id, 'reserved')
  on conflict (user_id, event_id) do update set status = 'reserved';
  return 'reserved';
end;
$$;

create or replace function public.archive_and_delete_member(p_user_id uuid, p_withdrawn_by uuid, p_source text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_history jsonb;
begin
  if p_source not in ('self', 'admin') then return 'invalid_source'; end if;
  select * into v_user from public.users where id = p_user_id for update;
  if not found then return 'not_found'; end if;
  if v_user.role <> 'member' then return 'forbidden'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'status', r.status,
    'created_at', r.created_at,
    'event', jsonb_build_object('title', e.title, 'starts_at', e.starts_at, 'location', e.location)
  ) order by r.created_at), '[]'::jsonb)
  into v_history
  from public.reservations r
  join public.events e on e.id = r.event_id
  where r.user_id = p_user_id;
  insert into public.membership_withdrawals (
    former_user_id, name, university, faculty, department, grade,
    instagram_id, line_display_name, tennis_experience, has_racket,
    reservation_history, withdrawal_source, withdrawn_by
  ) values (
    v_user.id, v_user.name, v_user.university, v_user.faculty, v_user.department,
    v_user.grade, v_user.instagram_id, v_user.line_display_name,
    v_user.tennis_experience, v_user.has_racket, v_history, p_source, p_withdrawn_by
  );
  insert into public.audit_logs (actor_id, action, target_type, target_id)
  values (p_withdrawn_by, case when p_source = 'self' then 'account.delete.self' else 'account.delete.admin' end, 'user', p_user_id);
  delete from public.users where id = p_user_id;
  return 'deleted';
end;
$$;

create or replace function public.cancel_event_reservation(p_user_id uuid, p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starts_at timestamptz;
begin
  select starts_at into v_starts_at from public.events where id = p_event_id for update;
  if not found then return 'event_not_found'; end if;
  if v_starts_at - now() < interval '2 hours' then return 'deadline_passed'; end if;
  update public.reservations set status = 'cancelled'
  where user_id = p_user_id and event_id = p_event_id and status = 'reserved';
  if not found then return 'not_reserved'; end if;
  return 'cancelled';
end;
$$;

create or replace function public.set_user_role(p_user_id uuid, p_role public.user_role)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users set role = p_role, session_version = session_version + 1 where id = p_user_id;
  return found;
end;
$$;

create or replace function public.set_member_role(p_user_id uuid, p_role public.user_role)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users set role = p_role, session_version = session_version + 1
  where id = p_user_id and role = 'member';
  return found;
end;
$$;

create or replace function public.replace_user_password(p_user_id uuid, p_password_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(p_password_hash) < 20 then raise exception 'invalid password hash'; end if;
  update public.users set password_hash = p_password_hash, session_version = session_version + 1 where id = p_user_id;
  return found;
end;
$$;

create or replace function public.promote_member_grades(p_year integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_updated integer;
begin
  if p_year < 2000 or p_year > 3000 then raise exception 'invalid promotion year'; end if;
  v_action := 'grade.promote.' || p_year::text;
  perform pg_advisory_xact_lock(hashtextextended(v_action, 0));
  if exists (select 1 from public.audit_logs where action = v_action) then
    return jsonb_build_object('updated', 0, 'skipped', true);
  end if;
  update public.users set grade = least(grade + 1, 5)
  where role = 'member' and grade < 5;
  get diagnostics v_updated = row_count;
  insert into public.audit_logs (action, target_type) values (v_action, 'users');
  return jsonb_build_object('updated', v_updated, 'skipped', false);
end;
$$;

revoke all on function public.consume_chatbot_message(uuid, date) from public;
revoke all on function public.check_login_rate_limit(text) from public;
revoke all on function public.record_login_failure(text, integer, integer, integer) from public;
revoke all on function public.clear_login_rate_limit(text) from public;
revoke all on function public.consume_request_rate_limit(text, integer, integer, integer) from public;
revoke all on function public.reserve_event(uuid, uuid) from public;
revoke all on function public.archive_and_delete_member(uuid, uuid, text) from public;
revoke all on function public.cancel_event_reservation(uuid, uuid) from public;
revoke all on function public.set_user_role(uuid, public.user_role) from public;
revoke all on function public.set_member_role(uuid, public.user_role) from public;
revoke all on function public.replace_user_password(uuid, text) from public;
revoke all on function public.promote_member_grades(integer) from public;

grant execute on function public.consume_chatbot_message(uuid, date) to service_role;
grant execute on function public.check_login_rate_limit(text) to service_role;
grant execute on function public.record_login_failure(text, integer, integer, integer) to service_role;
grant execute on function public.clear_login_rate_limit(text) to service_role;
grant execute on function public.consume_request_rate_limit(text, integer, integer, integer) to service_role;
grant execute on function public.reserve_event(uuid, uuid) to service_role;
grant execute on function public.archive_and_delete_member(uuid, uuid, text) to service_role;
grant execute on function public.cancel_event_reservation(uuid, uuid) to service_role;
grant execute on function public.set_user_role(uuid, public.user_role) to service_role;
grant execute on function public.set_member_role(uuid, public.user_role) to service_role;
grant execute on function public.replace_user_password(uuid, text) to service_role;
grant execute on function public.promote_member_grades(integer) to service_role;

create table if not exists public.app_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
alter table public.app_schema_migrations enable row level security;
grant select, insert on table public.app_schema_migrations to service_role;
insert into public.app_schema_migrations (version)
values ('20260905_consolidated_upgrade')
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
