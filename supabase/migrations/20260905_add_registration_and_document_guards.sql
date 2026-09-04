-- 登録Bot対策とイベントPDFの単一参照を追加する追補マイグレーション。

create unique index if not exists event_documents_file_path_key
  on public.event_documents (file_path);

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

  update public.login_rate_limits
  set failure_count = failure_count + 1, updated_at = now()
  where key_hash = p_key_hash;
  return true;
end;
$$;

revoke all on function public.consume_request_rate_limit(text, integer, integer, integer) from public;
grant execute on function public.consume_request_rate_limit(text, integer, integer, integer) to service_role;

notify pgrst, 'reload schema';
