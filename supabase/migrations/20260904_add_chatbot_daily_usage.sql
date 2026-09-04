-- admin/memberは1ユーザー1日10件まで。競合時も上限を超えないようDB内で原子的に加算する。
create table if not exists public.chatbot_daily_usage (
  user_id uuid not null references public.users(id) on delete cascade,
  usage_date date not null,
  message_count integer not null default 0 check (message_count between 0 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.chatbot_daily_usage enable row level security;
grant select, insert, update, delete on table public.chatbot_daily_usage to service_role;

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

revoke all on function public.consume_chatbot_message(uuid, date) from public;
grant execute on function public.consume_chatbot_message(uuid, date) to service_role;
