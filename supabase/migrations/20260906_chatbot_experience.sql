begin;

alter table public.chatbot_knowledge add column if not exists embedding real[];
alter table public.faqs add column if not exists embedding real[];
-- Keep the old upsert constraint compatible with the currently deployed application.
create index if not exists chatbot_knowledge_source_name_idx
  on public.chatbot_knowledge(source_name);

create or replace function public.replace_chatbot_source(p_actor uuid, p_name text, p_hash text, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not exists(select 1 from users where id = p_actor and role = 'super_admin') then raise exception 'Forbidden'; end if;
  if p_name is null or length(p_name) not between 1 and 255 or p_name !~* '\.md$'
    or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid source'; end if;
  v_count := jsonb_array_length(p_rows);
  if v_count not between 1 and 1000 then raise exception 'Invalid record count'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chatbot.source.' || p_name, 0));
  delete from chatbot_knowledge where source_type = 'markdown' and source_name = p_name;
  insert into chatbot_knowledge(title,content,category,keywords,source_type,source_name,source_section,source_hash,created_by,updated_by,embedding)
    select r.title,r.content,r.category,r.keywords,'markdown',p_name,r.source_section,p_name || ':' || p_hash,p_actor,p_actor,r.embedding
    from jsonb_to_recordset(p_rows) as r(title text,content text,category text,keywords text[],source_section text,embedding real[]);
  if exists(select 1 from chatbot_knowledge where source_name = p_name and (embedding is null or cardinality(embedding) <> 768)) then
    raise exception 'Incomplete embeddings';
  end if;
  insert into audit_logs(actor_id,action,target_type) values(p_actor,'chatbot.knowledge.import_markdown','chatbot_knowledge');
  return v_count;
end $$;

create or replace function public.chatbot_source_inventory()
returns table(source_name text, record_count bigint, updated_at timestamptz, embedded_count bigint)
language sql stable security definer set search_path = public as $$
  select k.source_name,count(*),max(k.updated_at),count(k.embedding)
  from chatbot_knowledge k where source_type = 'markdown' group by k.source_name order by k.source_name;
$$;

create or replace function public.chatbot_semantic_matches(p_sources text[], p_query real[])
returns table(id uuid, similarity double precision)
language sql stable security definer set search_path = public as $$
  with permitted as (
    select k.id,k.embedding from chatbot_knowledge k where k.source_type = 'markdown' and k.source_name = any(p_sources)
    union all select f.id,f.embedding from faqs f where f.is_published = true
  ), scored as (
    select p.id, (select sum(v::double precision * p_query[i]) /
      nullif(sqrt(sum(v::double precision * v)) * sqrt(sum(p_query[i]::double precision * p_query[i])),0)
      from unnest(p.embedding) with ordinality as e(v,i)) as similarity
    from permitted p where cardinality(p.embedding) = 768 and cardinality(p_query) = 768
  ) select * from scored where similarity >= 0.68 order by similarity desc limit 20;
$$;

create or replace function public.reorder_faqs(p_actor uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from users where id=p_actor and role in ('admin','super_admin')) then raise exception 'Forbidden'; end if;
  lock table faqs in share row exclusive mode;
  if p_ids is null or cardinality(p_ids) > 10000 or cardinality(p_ids) <> (select count(*) from faqs)
    or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x)
    or exists(select 1 from unnest(p_ids) x where not exists(select 1 from faqs where id=x)) then raise exception 'FAQ list changed'; end if;
  update faqs f set sort_order=s.n-1, updated_at=now() from unnest(p_ids) with ordinality s(id,n) where f.id=s.id;
  insert into audit_logs(actor_id,action,target_type) values(p_actor,'faq.reorder','faq');
end $$;

revoke all on function public.replace_chatbot_source(uuid,text,text,jsonb) from public;
revoke all on function public.chatbot_source_inventory() from public;
revoke all on function public.chatbot_semantic_matches(text[],real[]) from public;
revoke all on function public.reorder_faqs(uuid,uuid[]) from public;
grant execute on function public.replace_chatbot_source(uuid,text,text,jsonb), public.chatbot_source_inventory(), public.chatbot_semantic_matches(text[],real[]), public.reorder_faqs(uuid,uuid[]) to service_role;
notify pgrst, 'reload schema';
commit;
