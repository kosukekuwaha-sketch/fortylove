-- 実際のSupabase状態を変更せずに確認する棚卸しSQL。
begin transaction read only;

select
  current_database() as database_name,
  current_user as inspected_by,
  current_setting('server_version') as postgres_version,
  now() as inspected_at;

select
  required.object_name,
  to_regclass(required.object_name) is not null as exists
from (values
  ('public.users'),
  ('public.events'),
  ('public.event_documents'),
  ('public.reservations'),
  ('public.membership_withdrawals'),
  ('public.app_settings'),
  ('public.audit_logs'),
  ('public.chatbot_knowledge'),
  ('public.chatbot_daily_usage'),
  ('public.login_rate_limits'),
  ('public.app_schema_migrations')
) as required(object_name)
order by required.object_name;

select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'users', 'event_documents', 'app_settings',
    'chatbot_knowledge', 'chatbot_daily_usage', 'login_rate_limits'
  )
order by table_name, ordinal_position;

select
  required.signature,
  to_regprocedure(required.signature) is not null as exists
from (values
  ('public.consume_chatbot_message(uuid,date)'),
  ('public.check_login_rate_limit(text)'),
  ('public.record_login_failure(text,integer,integer,integer)'),
  ('public.clear_login_rate_limit(text)'),
  ('public.consume_request_rate_limit(text,integer,integer,integer)'),
  ('public.reserve_event(uuid,uuid)'),
  ('public.archive_and_delete_member(uuid,uuid,text)'),
  ('public.cancel_event_reservation(uuid,uuid)'),
  ('public.set_user_role(uuid,public.user_role)'),
  ('public.set_member_role(uuid,public.user_role)'),
  ('public.replace_user_password(uuid,text)'),
  ('public.promote_member_grades(integer)')
) as required(signature)
order by required.signature;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('event_documents', 'chatbot_knowledge', 'reservations', 'users')
order by tablename, indexname;

select
  n.nspname as schema_name,
  t.typname as enum_name,
  e.enumlabel,
  e.enumsortorder
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
order by t.typname, e.enumsortorder;

commit;
