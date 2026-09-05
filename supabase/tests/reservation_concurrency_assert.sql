\set ON_ERROR_STOP on

do $$
declare
  v_reserved integer;
begin
  select count(*)::integer into v_reserved
  from public.reservations
  where event_id = '10000000-0000-0000-0000-000000000001'
    and status = 'reserved';

  if v_reserved <> 1 then
    raise exception 'concurrent capacity test failed: expected 1 reservation, got %', v_reserved;
  end if;
end
$$;

select 'reservation concurrency passed' as result;
