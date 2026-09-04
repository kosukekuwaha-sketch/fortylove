\set ON_ERROR_STOP on

begin;

do $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_event uuid;
  v_result text;
begin
  insert into users (name, password_hash) values ('P0 member A', 'integration-test-hash') returning id into v_member_a;
  insert into users (name, password_hash) values ('P0 member B', 'integration-test-hash') returning id into v_member_b;
  insert into events (title, starts_at, ends_at, location, capacity)
    values ('P0 capacity', now() + interval '1 day', now() + interval '1 day 1 hour', 'court', 1)
    returning id into v_event;

  if reserve_event(v_member_a, v_event) <> 'reserved' then raise exception 'first reservation failed'; end if;
  if reserve_event(v_member_b, v_event) <> 'full' then raise exception 'capacity was exceeded'; end if;
  if (select count(*) from reservations where event_id = v_event and status = 'reserved') <> 1 then
    raise exception 'reservation count differs from capacity';
  end if;

  v_result := cancel_event_reservation(v_member_a, v_event);
  if v_result <> 'cancelled' then raise exception 'valid cancellation failed: %', v_result; end if;
end;
$$;

do $$
declare
  v_actor uuid;
  v_member uuid;
begin
  insert into users (name, password_hash, role) values ('P0 actor', 'integration-test-hash', 'super_admin') returning id into v_actor;
  insert into users (name, password_hash) values ('P0 withdrawal', 'integration-test-hash') returning id into v_member;

  if archive_and_delete_member(v_member, v_actor, 'admin') <> 'deleted' then raise exception 'atomic withdrawal failed'; end if;
  if exists (select 1 from users where id = v_member) then raise exception 'withdrawn user remains'; end if;
  if not exists (select 1 from membership_withdrawals where former_user_id = v_member) then raise exception 'withdrawal archive is missing'; end if;
  if not exists (select 1 from audit_logs where action = 'account.delete.admin' and target_id = v_member) then raise exception 'withdrawal audit is missing'; end if;
end;
$$;

do $$
declare
  v_member uuid;
  v_first jsonb;
  v_second jsonb;
begin
  insert into users (name, password_hash, grade) values ('P0 promotion', 'integration-test-hash', 1) returning id into v_member;
  v_first := promote_member_grades(2999);
  v_second := promote_member_grades(2999);
  if (v_first->>'skipped')::boolean then raise exception 'first promotion was skipped'; end if;
  if not (v_second->>'skipped')::boolean then raise exception 'second promotion was not idempotent'; end if;
  if (select grade from users where id = v_member) <> 2 then raise exception 'member was promoted more than once'; end if;
end;
$$;

do $$
declare
  v_key text := repeat('a', 64);
  v_wait integer;
begin
  perform clear_login_rate_limit(v_key);
  perform record_login_failure(v_key, 600, 5, 600) from generate_series(1, 4);
  if coalesce(check_login_rate_limit(v_key), 0) <> 0 then raise exception 'login blocked too early'; end if;
  v_wait := record_login_failure(v_key, 600, 5, 600);
  if v_wait <= 0 then raise exception 'login was not blocked at threshold'; end if;
  perform clear_login_rate_limit(v_key);
  if coalesce(check_login_rate_limit(v_key), 0) <> 0 then raise exception 'login limit was not cleared'; end if;
end;
$$;

do $$
declare
  v_user uuid;
begin
  insert into users (name, password_hash) values ('P1 session', 'integration-test-hash') returning id into v_user;
  if not set_user_role(v_user, 'admin') then raise exception 'role update failed'; end if;
  if (select session_version from users where id = v_user) <> 2 then raise exception 'role update did not invalidate sessions'; end if;
  if not replace_user_password(v_user, 'integration-test-replacement-hash') then raise exception 'password update failed'; end if;
  if (select session_version from users where id = v_user) <> 3 then raise exception 'password update did not invalidate sessions'; end if;
end;
$$;

rollback;
