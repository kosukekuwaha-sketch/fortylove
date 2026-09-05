begin;
insert into users(id,name,password_hash,role) values
 ('90000000-0000-4000-8000-000000000001','QA super','test','super_admin'),
 ('90000000-0000-4000-8000-000000000002','QA member','test','member');

do $$
declare rows jsonb; before_hash text; n integer;
begin
  select jsonb_agg(jsonb_build_object('title','質問'||i,'content','回答です','category','基本情報','keywords',array['質問'],
    'source_section',i::text,'embedding',array_fill(0.1::real,array[768]))) into rows from generate_series(1,1000) i;
  n := replace_chatbot_source('90000000-0000-4000-8000-000000000001','qa.md',repeat('a',64),rows);
  if n <> 1000 then raise exception '1000 import failed'; end if;
  if (select record_count from chatbot_source_inventory() where source_name='qa.md') <> 1000 then raise exception 'Inventory truncated'; end if;
  begin
    perform replace_chatbot_source('90000000-0000-4000-8000-000000000001','qa.md',repeat('b',64),rows || jsonb_build_array(rows->0));
    raise exception '1001 accepted';
  exception when others then if sqlerrm <> 'Invalid record count' then raise; end if; end;
  begin
    perform replace_chatbot_source('90000000-0000-4000-8000-000000000001','qa.md',repeat('b',64),'[{"title":"broken"}]');
    raise exception 'Invalid row accepted';
  exception when others then if sqlerrm='Invalid row accepted' then raise; end if; end;
  select source_hash into before_hash from chatbot_knowledge where source_name='qa.md' limit 1;
  if before_hash <> 'qa.md:' || repeat('a',64) or (select count(*) from chatbot_knowledge where source_name='qa.md') <> 1000 then raise exception 'Old data lost'; end if;
  begin
    perform replace_chatbot_source('90000000-0000-4000-8000-000000000002','qa.md',repeat('b',64),rows);
    raise exception 'Member import accepted';
  exception when others then if sqlerrm='Member import accepted' then raise; end if; end;
  -- Same text in differently named files is independently selectable.
  perform replace_chatbot_source('90000000-0000-4000-8000-000000000001','private.md',repeat('a',64),jsonb_build_array(rows->0));
  if exists(select 1 from chatbot_semantic_matches(array['qa.md'],array_fill(0.1::real,array[768])) m join chatbot_knowledge k on k.id=m.id where k.source_name='private.md') then raise exception 'Source leak'; end if;
end $$;

insert into faqs(id,question,answer,category,is_published,embedding) values
 ('91000000-0000-4000-8000-000000000001','公開質問','公開回答','基本情報',true,array_fill(0.1::real,array[768])),
 ('91000000-0000-4000-8000-000000000002','非公開質問','非公開回答','基本情報',false,array_fill(0.1::real,array[768]));
do $$ begin
  if exists(select 1 from chatbot_semantic_matches(array[]::text[],array_fill(0.1::real,array[768])) where id='91000000-0000-4000-8000-000000000002') then raise exception 'Draft leak'; end if;
  if not exists(select 1 from chatbot_semantic_matches(array[]::text[],array_fill(0.1::real,array[768])) where id='91000000-0000-4000-8000-000000000001') then raise exception 'Published FAQ missing'; end if;
  perform reorder_faqs('90000000-0000-4000-8000-000000000001',array(select id from faqs order by id desc));
  begin
    perform reorder_faqs('90000000-0000-4000-8000-000000000002',array(select id from faqs));
    raise exception 'Member reorder accepted';
  exception when others then if sqlerrm='Member reorder accepted' then raise; end if; end;
  if has_function_privilege('public','public.replace_chatbot_source(uuid,text,text,jsonb)','execute') then raise exception 'Public RPC access'; end if;
end $$;
rollback;
