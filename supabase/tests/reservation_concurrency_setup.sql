\set ON_ERROR_STOP on

delete from public.events where id = '10000000-0000-0000-0000-000000000001';
delete from public.users where id::text like '20000000-0000-0000-0000-%';

insert into public.events (id, title, starts_at, ends_at, location, capacity, event_type)
values (
  '10000000-0000-0000-0000-000000000001',
  '同時予約テスト',
  now() + interval '7 days',
  now() + interval '7 days 2 hours',
  'CI',
  1,
  'tennis'
);

insert into public.users (id, name, password_hash)
select
  ('20000000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid,
  '同時予約ユーザー' || number,
  '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV1234567890'
from generate_series(1, 20) as number;
