begin;
do $$
declare owner_id uuid := '78000000-0000-4000-8000-000000000001'; member_id uuid := '78000000-0000-4000-8000-000000000002'; lease_id uuid; audit_count bigint;
begin
  insert into users(id,name,password_hash,role) values(owner_id,'Ops owner','not-a-login-hash','super_admin'),(member_id,'Ops member','not-a-login-hash','member');
  select count(*) into audit_count from audit_logs;
  begin perform update_ops_notification_settings(member_id,'wrong@example.com',true,true); raise exception 'member allowed'; exception when others then if sqlerrm <> 'Forbidden' then raise; end if; end;
  perform update_ops_notification_settings(owner_id,'ops@example.com',true,true);
  if not exists(select 1 from ops_notification_settings where email='ops@example.com' and health_enabled and errors_enabled) then raise exception 'settings not saved'; end if;
  if (select count(*) from audit_logs) <> audit_count+1 then raise exception 'missing audit'; end if;
  begin perform update_ops_notification_settings(owner_id,null,true,true); raise exception 'invalid settings allowed'; exception when check_violation then null; end;
  if (select email from ops_notification_settings) <> 'ops@example.com' then raise exception 'partial update'; end if;
  lease_id := claim_ops_delivery('quality:test');
  if lease_id is null or claim_ops_delivery('quality:test') is not null then raise exception 'duplicate claim'; end if;
  perform finish_ops_delivery('quality:test',gen_random_uuid(),true);
  if (select sent_at from ops_notification_deliveries where delivery_key='quality:test') is not null then raise exception 'wrong lease accepted'; end if;
  perform finish_ops_delivery('quality:test',lease_id,false);
  lease_id := claim_ops_delivery('quality:test');
  if lease_id is null then raise exception 'cannot retry failed send'; end if;
  perform finish_ops_delivery('quality:test',lease_id,true);
  if claim_ops_delivery('quality:test') is not null then raise exception 'resent completed notification'; end if;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.proname in ('update_ops_notification_settings','claim_ops_delivery','finish_ops_delivery') and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'public execute allowed'; end if;
end $$;
rollback;
