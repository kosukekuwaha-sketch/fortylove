-- テニスとその他のイベントを区別する
alter table public.events
add column if not exists event_type text not null default 'tennis';

-- 旧区分がある場合は「イベント」へ統合する
update public.events
set event_type = 'event'
where event_type in ('social', 'other');

-- 使用できるイベント種別を制限する
alter table public.events
drop constraint if exists events_event_type_check;

alter table public.events
add constraint events_event_type_check
check (event_type in ('tennis', 'event'));
