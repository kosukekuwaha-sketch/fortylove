-- P0品質要件: 予約競合、退会部分失敗、Cron二重実行、ログイン総当たりをDB側で防ぐ。

alter table public.users
  add column if not exists session_version integer not null default 1
  check (session_version > 0);

create unique index if not exists event_documents_file_path_key
  on public.event_documents (file_path);

create table if not exists public.login_rate_limits (
  key_hash text primary key check (char_length(key_hash) = 64),
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.login_rate_limits enable row level security;
grant select, insert, update, delete on table public.login_rate_limits to service_role;

create or replace function public.check_login_rate_limit(p_key_hash text)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(
    greatest(0, ceil(extract(epoch from (blocked_until - now())))::integer),
    0
  )
  from public.login_rate_limits
  where key_hash = p_key_hash;
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
  if char_length(p_key_hash) <> 64
     or p_window_seconds < 1
     or p_max_failures < 1
     or p_block_seconds < 1 then
    raise exception 'invalid login rate limit arguments';
  end if;

  insert into public.login_rate_limits (
    key_hash, failure_count, window_started_at, blocked_until, updated_at
  ) values (
    p_key_hash,
    1,
    now(),
    case when p_max_failures = 1 then now() + make_interval(secs => p_block_seconds) end,
    now()
  )
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
as $$
  delete from public.login_rate_limits where key_hash = p_key_hash;
$$;

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
  if char_length(p_key_hash) <> 64
     or p_window_seconds < 1
     or p_max_requests < 1
     or p_block_seconds < 1 then
    raise exception 'invalid request rate limit arguments';
  end if;

  insert into public.login_rate_limits (key_hash, failure_count, window_started_at, updated_at)
  values (p_key_hash, 0, now(), now())
  on conflict (key_hash) do nothing;

  select * into v_limit
  from public.login_rate_limits
  where key_hash = p_key_hash
  for update;

  if v_limit.blocked_until > now() then
    return false;
  end if;

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

  update public.login_rate_limits
  set failure_count = failure_count + 1, updated_at = now()
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
  v_existing_status reservation_status;
  v_reserved_count integer;
begin
  if not exists (select 1 from public.users where id = p_user_id) then
    return 'user_not_found';
  end if;

  select capacity, starts_at
    into v_capacity, v_starts_at
  from public.events
  where id = p_event_id
  for update;

  if not found then return 'event_not_found'; end if;
  if v_starts_at <= now() then return 'event_started'; end if;

  select status into v_existing_status
  from public.reservations
  where user_id = p_user_id and event_id = p_event_id;

  if v_existing_status in ('reserved', 'attended') then
    return 'already_reserved';
  end if;

  select count(*)::integer into v_reserved_count
  from public.reservations
  where event_id = p_event_id and status = 'reserved';

  if v_reserved_count >= v_capacity then return 'full'; end if;

  insert into public.reservations (user_id, event_id, status)
  values (p_user_id, p_event_id, 'reserved')
  on conflict (user_id, event_id) do update set status = 'reserved';

  return 'reserved';
end;
$$;

create or replace function public.archive_and_delete_member(
  p_user_id uuid,
  p_withdrawn_by uuid,
  p_source text
)
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

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then return 'not_found'; end if;
  if v_user.role <> 'member' then return 'forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'status', r.status,
    'created_at', r.created_at,
    'event', jsonb_build_object(
      'title', e.title,
      'starts_at', e.starts_at,
      'location', e.location
    )
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
  values (
    p_withdrawn_by,
    case when p_source = 'self' then 'account.delete.self' else 'account.delete.admin' end,
    'user',
    p_user_id
  );

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
  select starts_at into v_starts_at
  from public.events
  where id = p_event_id
  for update;

  if not found then return 'event_not_found'; end if;
  if v_starts_at - now() < interval '2 hours' then return 'deadline_passed'; end if;

  update public.reservations
  set status = 'cancelled'
  where user_id = p_user_id and event_id = p_event_id and status = 'reserved';
  if not found then return 'not_reserved'; end if;
  return 'cancelled';
end;
$$;

create or replace function public.set_user_role(p_user_id uuid, p_role user_role)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.users set role = p_role, session_version = session_version + 1 where id = p_user_id;
  return found;
end;
$$;

create or replace function public.set_member_role(p_user_id uuid, p_role user_role)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.users set role = p_role, session_version = session_version + 1
  where id = p_user_id and role = 'member';
  return found;
end;
$$;

create or replace function public.replace_user_password(p_user_id uuid, p_password_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
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
  if p_year < 2000 or p_year > 3000 then
    raise exception 'invalid promotion year';
  end if;

  v_action := 'grade.promote.' || p_year::text;
  perform pg_advisory_xact_lock(hashtextextended(v_action, 0));

  if exists (select 1 from public.audit_logs where action = v_action) then
    return jsonb_build_object('updated', 0, 'skipped', true);
  end if;

  update public.users
  set grade = least(grade + 1, 5)
  where role = 'member' and grade < 5;
  get diagnostics v_updated = row_count;

  insert into public.audit_logs (action, target_type)
  values (v_action, 'users');

  return jsonb_build_object('updated', v_updated, 'skipped', false);
end;
$$;

revoke all on function public.check_login_rate_limit(text) from public;
revoke all on function public.record_login_failure(text, integer, integer, integer) from public;
revoke all on function public.clear_login_rate_limit(text) from public;
revoke all on function public.consume_request_rate_limit(text, integer, integer, integer) from public;
revoke all on function public.reserve_event(uuid, uuid) from public;
revoke all on function public.archive_and_delete_member(uuid, uuid, text) from public;
revoke all on function public.cancel_event_reservation(uuid, uuid) from public;
revoke all on function public.set_user_role(uuid, user_role) from public;
revoke all on function public.set_member_role(uuid, user_role) from public;
revoke all on function public.replace_user_password(uuid, text) from public;
revoke all on function public.promote_member_grades(integer) from public;

grant execute on function public.check_login_rate_limit(text) to service_role;
grant execute on function public.record_login_failure(text, integer, integer, integer) to service_role;
grant execute on function public.clear_login_rate_limit(text) to service_role;
grant execute on function public.consume_request_rate_limit(text, integer, integer, integer) to service_role;
grant execute on function public.reserve_event(uuid, uuid) to service_role;
grant execute on function public.archive_and_delete_member(uuid, uuid, text) to service_role;
grant execute on function public.cancel_event_reservation(uuid, uuid) to service_role;
grant execute on function public.set_user_role(uuid, user_role) to service_role;
grant execute on function public.set_member_role(uuid, user_role) to service_role;
grant execute on function public.replace_user_password(uuid, text) to service_role;
grant execute on function public.promote_member_grades(integer) to service_role;

notify pgrst, 'reload schema';
