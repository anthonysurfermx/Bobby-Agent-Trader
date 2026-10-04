-- Reviewed financial facts and delivered educational recommendations, shared by account across clients.
-- Service-only: identity comes from verified authentication, never a model argument. No raw conversations.
create table if not exists public.bobby_financial_settings (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  enabled boolean not null default false
);
create table if not exists public.bobby_financial_items (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  item jsonb not null,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(identity_id, fingerprint)
);
create table if not exists public.bobby_financial_drafts (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  items jsonb not null,
  expires_at timestamptz not null default now() + interval '24 hours'
);
create table if not exists public.bobby_financial_imports (
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  primary key(identity_id, request_id)
);
create table if not exists public.bobby_saved_recommendations (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists bobby_financial_drafts_owner_idx on public.bobby_financial_drafts(identity_id, expires_at);
create index if not exists bobby_recommendations_owner_idx on public.bobby_saved_recommendations(identity_id, created_at desc);
create index if not exists bobby_recommendations_expiry_idx on public.bobby_saved_recommendations(created_at);
create index if not exists bobby_drafts_expiry_idx on public.bobby_financial_drafts(expires_at);
create index if not exists bobby_imports_expiry_idx on public.bobby_financial_imports(created_at);

create or replace function public.bobby_financial_item_valid(p_item jsonb)
returns boolean language plpgsql immutable security invoker set search_path = public, pg_temp as $$
declare k text; v text;
begin
  if jsonb_typeof(p_item) <> 'object' or p_item is null then return false; end if;
  for k in select jsonb_object_keys(p_item) loop
    if k not in ('category','summary','amount','currency','observedAt') then return false; end if;
  end loop;
  if coalesce(p_item->>'category','') not in ('goal','income','expense','debt','asset','preference','transaction') then return false; end if;
  v := p_item->>'summary';
  if jsonb_typeof(p_item->'summary') <> 'string' or v is null or length(btrim(v)) < 3 or length(v) > 240 or v ~ '[[:cntrl:]]' then return false; end if;
  if v ~ '[0-9]([ -]?[0-9]){12,18}' or v ~* '[A-Z]{2}[0-9]{2}[A-Z0-9 ]{11,30}' or v ~ 'sk-[A-Za-z0-9_-]{12,}' or v like '%PRIVATE KEY%' then return false; end if;
  if p_item ? 'currency' and (jsonb_typeof(p_item->'currency') <> 'string' or p_item->>'currency' !~ '^[A-Z]{3}$') then return false; end if;
  if p_item ? 'amount' then
    if jsonb_typeof(p_item->'amount') <> 'number' or not p_item ? 'currency' then return false; end if;
    if (p_item->>'amount')::numeric < 0 or (p_item->>'amount')::numeric > 1000000000000 then return false; end if;
  end if;
  if p_item ? 'observedAt' then
    v := p_item->>'observedAt';
    if jsonb_typeof(p_item->'observedAt') <> 'string' or v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (v::date)::text <> v then return false; end if;
  end if;
  return true;
exception when others then return false;
end;
$$;
create or replace function public.bobby_financial_items_valid(p_items jsonb)
returns boolean language plpgsql immutable security invoker set search_path = public, pg_temp as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return false; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then return false; end if;
  return not exists(select 1 from jsonb_array_elements(p_items) i where not bobby_financial_item_valid(i));
end;
$$;
create or replace function public.bobby_financial_enabled(p_identity uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select exists(select 1 from bobby_identities where id=p_identity and auth_user_id is not null)
    and exists(select 1 from bobby_financial_settings where identity_id=p_identity and enabled)
    and not exists(select 1 from bobby_user_prefs where identity_id=p_identity and not memory_enabled);
$$;
create or replace function public.bobby_financial_list(p_identity uuid)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare items jsonb; drafts jsonb; recs jsonb;
begin
  if not exists(select 1 from bobby_identities where id=p_identity and auth_user_id is not null) then return jsonb_build_object('error','signin_required'); end if;
  select coalesce(jsonb_agg(item || jsonb_build_object('id',id,'source','chatgpt','verification','user_reported','createdAt',created_at,'updatedAt',updated_at) order by updated_at desc,id),'[]') into items from bobby_financial_items where identity_id=p_identity;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'items',d.items,'expiresAt',d.expires_at) order by d.expires_at desc),'[]') into drafts from bobby_financial_drafts d where d.identity_id=p_identity and d.expires_at>now();
  select coalesce(jsonb_agg(snapshot || jsonb_build_object('id',id,'createdAt',created_at) order by created_at desc,id),'[]') into recs from (select * from bobby_saved_recommendations where identity_id=p_identity and created_at>=now()-interval '90 days' order by created_at desc,id limit 20) r;
  return jsonb_build_object('enabled',bobby_financial_enabled(p_identity),
    'financialMemoryEnabled',exists(select 1 from bobby_financial_settings where identity_id=p_identity and enabled),
    'accountMemoryEnabled',not exists(select 1 from bobby_user_prefs where identity_id=p_identity and not memory_enabled),
    'items',items,'drafts',drafts,'recommendations',recs);
end;
$$;
create or replace function public.bobby_financial_prepare(p_identity uuid,p_items jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare draft bobby_financial_drafts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_identity::text, 61004));
  if not bobby_financial_enabled(p_identity) then return jsonb_build_object('error','context_paused'); end if;
  if not bobby_financial_items_valid(p_items) then return jsonb_build_object('error','invalid_context'); end if;
  delete from bobby_financial_drafts where identity_id=p_identity and expires_at<=now();
  if (select count(*) from bobby_financial_drafts where identity_id=p_identity)>=5 then return jsonb_build_object('error','draft_limit'); end if;
  insert into bobby_financial_drafts(identity_id,items) values(p_identity,p_items) returning * into draft;
  return jsonb_build_object('id',draft.id,'items',draft.items,'expiresAt',draft.expires_at);
end;
$$;
create or replace function public.bobby_financial_import(p_identity uuid,p_items jsonb,p_request uuid,p_draft uuid default null)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare payload text; prior text; incoming int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_identity::text, 61004));
  if not bobby_financial_enabled(p_identity) then return jsonb_build_object('error','context_paused'); end if;
  if p_request is null or not bobby_financial_items_valid(p_items) then return jsonb_build_object('error','invalid_context'); end if;
  payload := encode(sha256(convert_to(p_items::text || coalesce(p_draft::text,''),'UTF8')),'hex');
  select payload_hash into prior from bobby_financial_imports where identity_id=p_identity and request_id=p_request;
  if prior is not null then
    if prior <> payload then return jsonb_build_object('error','request_conflict'); end if;
    return jsonb_build_object('ok',true);
  end if;
  if p_draft is not null and not exists(select 1 from bobby_financial_drafts where id=p_draft and identity_id=p_identity and expires_at>now()) then return jsonb_build_object('error','draft_unavailable'); end if;
  select count(*) into incoming from (select distinct encode(sha256(convert_to(i::text,'UTF8')),'hex') fingerprint from jsonb_array_elements(p_items) i) n where not exists(select 1 from bobby_financial_items where identity_id=p_identity and fingerprint=n.fingerprint);
  if (select count(*) from bobby_financial_items where identity_id=p_identity)+incoming>50 then return jsonb_build_object('error','context_limit'); end if;
  insert into bobby_financial_items(identity_id,item,fingerprint) select p_identity,i,encode(sha256(convert_to(i::text,'UTF8')),'hex') from jsonb_array_elements(p_items) i on conflict(identity_id,fingerprint) do nothing;
  insert into bobby_financial_imports(identity_id,request_id,payload_hash) values(p_identity,p_request,payload);
  if p_draft is not null then delete from bobby_financial_drafts where id=p_draft and identity_id=p_identity; end if;
  delete from bobby_financial_imports where identity_id=p_identity and created_at<now()-interval '90 days';
  return jsonb_build_object('ok',true);
end;
$$;
create or replace function public.bobby_financial_update(p_identity uuid,p_id uuid,p_item jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_identity::text, 61004));
  if not bobby_financial_item_valid(p_item) then return jsonb_build_object('error','invalid_context'); end if;
  if not exists(select 1 from bobby_financial_items where id=p_id and identity_id=p_identity) then return jsonb_build_object('error','item_unavailable'); end if;
  if exists(select 1 from bobby_financial_items where identity_id=p_identity and fingerprint=encode(sha256(convert_to(p_item::text,'UTF8')),'hex') and id<>p_id) then return jsonb_build_object('error','duplicate_context'); end if;
  update bobby_financial_items set item=p_item,fingerprint=encode(sha256(convert_to(p_item::text,'UTF8')),'hex'),updated_at=now() where id=p_id and identity_id=p_identity;
  return jsonb_build_object('ok',true);
end;
$$;
create or replace function public.bobby_financial_set_enabled(p_identity uuid,p_enabled boolean)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_identity::text, 61004));
  if p_enabled is null or not exists(select 1 from bobby_identities where id=p_identity and auth_user_id is not null) then return jsonb_build_object('error','signin_required'); end if;
  insert into bobby_financial_settings values(p_identity,p_enabled) on conflict(identity_id) do update set enabled=excluded.enabled;
  return jsonb_build_object('ok',true);
end;
$$;
create or replace function public.bobby_financial_forget(p_identity uuid,p_id uuid default null)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_identity::text, 61004));
  delete from bobby_financial_items where identity_id=p_identity and (p_id is null or id=p_id);
  if p_id is null then
    delete from bobby_financial_drafts where identity_id=p_identity;
    delete from bobby_saved_recommendations where identity_id=p_identity;
    delete from bobby_financial_imports where identity_id=p_identity;
  end if;
  return jsonb_build_object('ok',true);
end;
$$;
create or replace function public.bobby_financial_dismiss(p_identity uuid,p_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  delete from bobby_financial_drafts where identity_id=p_identity and id=p_id;
  return jsonb_build_object('ok',true);
end;
$$;
create or replace function public.bobby_financial_record_recommendation(p_identity uuid,p_snapshot jsonb)
returns boolean language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare k text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_identity::text, 61004));
  if not bobby_financial_enabled(p_identity) then return false; end if;
  if jsonb_typeof(p_snapshot)<>'object' or not p_snapshot ?& array['symbol','asOf','headline','why','risk','watch','verdict','direction'] then return false; end if;
  for k in select jsonb_object_keys(p_snapshot) loop
    if k not in ('symbol','asOf','headline','why','risk','watch','verdict','direction') or jsonb_typeof(p_snapshot->k)<>'string' then return false; end if;
  end loop;
  if coalesce(p_snapshot->>'symbol','') !~ '^[A-Z0-9.^=-]{1,20}$' or p_snapshot->>'verdict' not in ('wait','review') or p_snapshot->>'direction' not in ('long','short','none') then return false; end if;
  if length(p_snapshot->>'headline')>500 or length(p_snapshot->>'why')>500 or length(p_snapshot->>'risk')>500 or length(p_snapshot->>'watch')>500 then return false; end if;
  perform (p_snapshot->>'asOf')::timestamptz;
  insert into bobby_saved_recommendations(identity_id,snapshot) values(p_identity,p_snapshot);
  delete from bobby_saved_recommendations where identity_id=p_identity and (created_at<now()-interval '90 days' or id in (select id from bobby_saved_recommendations where identity_id=p_identity order by created_at desc,id offset 100));
  return true;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

-- Erase-all remains one atomic memory operation; the financial preference stays paused if paused.
create or replace function public.bobby_financial_purge()
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  delete from bobby_financial_drafts where id in (select id from bobby_financial_drafts where expires_at<=now() limit 5000 for update skip locked);
  delete from bobby_saved_recommendations where id in (select id from bobby_saved_recommendations where created_at<now()-interval '90 days' limit 5000 for update skip locked);
  delete from bobby_financial_imports where (identity_id,request_id) in (select identity_id,request_id from bobby_financial_imports where created_at<now()-interval '90 days' limit 5000 for update skip locked);
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.bobby_memory_forget(p_identity uuid,p_symbol text default null)
returns int language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare n int := 0;
begin
  if p_identity is null then return 0; end if;
  if p_symbol is null then
    perform bobby_financial_forget(p_identity,null);
    delete from bobby_user_assets where identity_id=p_identity;
    get diagnostics n=row_count;
    delete from bobby_user_prefs where identity_id=p_identity and memory_enabled;
    update bobby_user_prefs set horizon=null,experience=null,risk=null,updated_at=now() where identity_id=p_identity;
  else
    delete from bobby_user_assets where identity_id=p_identity and symbol=p_symbol;
    get diagnostics n=row_count;
  end if;
  return n;
end;
$$;

do $$ declare name text; signature text;
begin
  foreach name in array array['bobby_financial_settings','bobby_financial_items','bobby_financial_drafts','bobby_financial_imports','bobby_saved_recommendations'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('grant all on public.%I to service_role',name);
  end loop;
  for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname like 'bobby_financial_%' loop
    execute 'revoke all on function '||signature||' from public,anon,authenticated';
    execute 'grant execute on function '||signature||' to service_role';
  end loop;
end $$;
revoke all on function public.bobby_memory_forget(uuid,text) from public,anon,authenticated;
grant execute on function public.bobby_memory_forget(uuid,text) to service_role;
