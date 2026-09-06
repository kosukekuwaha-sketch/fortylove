begin;

create table if not exists public.ops_notification_settings (
  id smallint primary key default 1 check (id = 1),
  email text check (email is null or (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  health_enabled boolean not null default false,
  errors_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((not health_enabled and not errors_enabled) or email is not null)
);
insert into public.ops_notification_settings(id) values(1) on conflict do nothing;
alter table public.ops_notification_settings enable row level security;
revoke all on public.ops_notification_settings from public;
grant select,insert,update,delete on public.ops_notification_settings to service_role;

create table if not exists public.ops_notification_deliveries (
  delivery_key text primary key check (length(delivery_key) between 1 and 128),
  lease uuid,
  leased_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.ops_notification_deliveries enable row level security;
revoke all on public.ops_notification_deliveries from public;
grant select,insert,update,delete on public.ops_notification_deliveries to service_role;

create or replace function public.update_ops_notification_settings(p_actor uuid,p_email text,p_health boolean,p_errors boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from users where id=p_actor and role='super_admin') then raise exception 'Forbidden'; end if;
  if p_health is null or p_errors is null then raise exception 'Invalid settings'; end if;
  update ops_notification_settings set email=nullif(trim(p_email),''),health_enabled=p_health,errors_enabled=p_errors,updated_at=clock_timestamp() where id=1;
  if not found then raise exception 'Missing settings'; end if;
  insert into audit_logs(actor_id,action,target_type) values(p_actor,'ops.notification.settings.update','ops_settings');
end $$;

create or replace function public.claim_ops_delivery(p_key text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_lease uuid := gen_random_uuid(); v_sent timestamptz; v_until timestamptz;
begin
  insert into ops_notification_deliveries(delivery_key) values(p_key) on conflict do nothing;
  select sent_at,leased_until into v_sent,v_until from ops_notification_deliveries where delivery_key=p_key for update;
  if v_sent is not null or v_until>now() then return null; end if;
  update ops_notification_deliveries set lease=v_lease,leased_until=now()+interval '2 minutes' where delivery_key=p_key;
  return v_lease;
end $$;

create or replace function public.finish_ops_delivery(p_key text,p_lease uuid,p_sent boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  update ops_notification_deliveries set sent_at=case when p_sent then now() else sent_at end,leased_until=null,lease=null
  where delivery_key=p_key and lease=p_lease;
end $$;

revoke all on function public.update_ops_notification_settings(uuid,text,boolean,boolean),public.claim_ops_delivery(text),public.finish_ops_delivery(text,uuid,boolean) from public;
grant execute on function public.update_ops_notification_settings(uuid,text,boolean,boolean),public.claim_ops_delivery(text),public.finish_ops_delivery(text,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
