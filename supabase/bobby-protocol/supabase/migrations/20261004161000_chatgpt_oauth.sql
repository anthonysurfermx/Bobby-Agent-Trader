-- OAuth 2.1 for the separate ChatGPT financial-context MCP resource. Service-only.
-- Raw codes/access tokens never enter storage. Identity deletion cascades grants,
-- codes and tokens. Revocation and reauthorization invalidate every old grant version.
create table if not exists public.bobby_chatgpt_clients (
  id uuid primary key,
  name text not null check (length(name) between 1 and 100),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  scopes text[] not null check (cardinality(scopes) between 1 and 2 and scopes <@ array['bobby.context.read','bobby.context.write']),
  created_at timestamptz not null default now()
);
create table if not exists public.bobby_chatgpt_connections (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  client_id uuid not null references public.bobby_chatgpt_clients(id) on delete cascade,
  scopes text[] not null check (cardinality(scopes) between 1 and 2 and scopes <@ array['bobby.context.read','bobby.context.write']),
  grant_version uuid not null default gen_random_uuid(),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (identity_id, client_id)
);
create table if not exists public.bobby_chatgpt_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  connection_id uuid not null references public.bobby_chatgpt_connections(id) on delete cascade,
  grant_version uuid not null,
  client_id uuid not null references public.bobby_chatgpt_clients(id) on delete cascade,
  redirect_uri text not null,
  challenge text not null check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  resource text not null check (resource = 'https://bobbyprotocol.xyz/api/chatgpt'),
  issuer text not null check (issuer = 'https://bobbyprotocol.xyz'),
  scopes text[] not null check (cardinality(scopes) between 1 and 2 and scopes <@ array['bobby.context.read','bobby.context.write']),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create table if not exists public.bobby_chatgpt_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  code_hash text not null references public.bobby_chatgpt_codes(code_hash) on delete cascade,
  connection_id uuid not null references public.bobby_chatgpt_connections(id) on delete cascade,
  grant_version uuid not null,
  client_id uuid not null references public.bobby_chatgpt_clients(id) on delete cascade,
  resource text not null check (resource = 'https://bobbyprotocol.xyz/api/chatgpt'),
  issuer text not null check (issuer = 'https://bobbyprotocol.xyz'),
  scopes text[] not null check (cardinality(scopes) between 1 and 2 and scopes <@ array['bobby.context.read','bobby.context.write']),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists bobby_chatgpt_tokens_connection_idx on public.bobby_chatgpt_tokens(connection_id);
create index if not exists bobby_chatgpt_codes_expiry_idx on public.bobby_chatgpt_codes(expires_at);
create index if not exists bobby_chatgpt_tokens_expiry_idx on public.bobby_chatgpt_tokens(expires_at);
alter table public.bobby_chatgpt_clients enable row level security;
alter table public.bobby_chatgpt_connections enable row level security;
alter table public.bobby_chatgpt_codes enable row level security;
alter table public.bobby_chatgpt_tokens enable row level security;
revoke all on public.bobby_chatgpt_clients, public.bobby_chatgpt_connections, public.bobby_chatgpt_codes, public.bobby_chatgpt_tokens from public, anon, authenticated;
grant all on public.bobby_chatgpt_clients, public.bobby_chatgpt_connections, public.bobby_chatgpt_codes, public.bobby_chatgpt_tokens to service_role;

create or replace function public.bobby_chatgpt_authorize(
  p_identity uuid, p_client uuid, p_scopes text[], p_code_hash text, p_challenge text,
  p_redirect_uri text, p_resource text, p_issuer text, p_expires_at timestamptz)
returns boolean language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare conn bobby_chatgpt_connections%rowtype; cli bobby_chatgpt_clients%rowtype;
begin
  if p_resource <> 'https://bobbyprotocol.xyz/api/chatgpt' or p_issuer <> 'https://bobbyprotocol.xyz'
     or p_expires_at <= now() or p_expires_at > now() + interval '5 minutes'
     or p_code_hash !~ '^[0-9a-f]{64}$' or p_challenge !~ '^[A-Za-z0-9_-]{43}$'
     or cardinality(p_scopes) not between 1 and 2 or not p_scopes <@ array['bobby.context.read','bobby.context.write'] then return false; end if;
  if not exists(select 1 from bobby_identities where id = p_identity and auth_user_id is not null) then return false; end if;
  select * into cli from bobby_chatgpt_clients where id = p_client for key share;
  if not found or not p_redirect_uri = any(cli.redirect_uris) or not p_scopes <@ cli.scopes then return false; end if;
  insert into bobby_chatgpt_connections (identity_id,client_id,scopes)
    values(p_identity,p_client,p_scopes)
    on conflict(identity_id,client_id) do update set scopes=excluded.scopes, granted_at=now(), revoked_at=null, grant_version=gen_random_uuid()
    returning * into conn;
  insert into bobby_chatgpt_codes(code_hash,connection_id,grant_version,client_id,redirect_uri,challenge,resource,issuer,scopes,expires_at)
    values(p_code_hash,conn.id,conn.grant_version,p_client,p_redirect_uri,p_challenge,p_resource,p_issuer,p_scopes,p_expires_at);
  -- Bounded housekeeping. Expired records are unusable immediately; sweep old metadata on consent.
  delete from bobby_chatgpt_codes where code_hash in
    (select code_hash from bobby_chatgpt_codes where expires_at < now() - interval '30 days' limit 500 for update skip locked);
  return true;
end; $$;

create or replace function public.bobby_chatgpt_exchange_code(
  p_code_hash text, p_client uuid, p_redirect_uri text, p_challenge text, p_resource text,
  p_issuer text, p_token_hash text, p_expires_at timestamptz)
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare c bobby_chatgpt_codes%rowtype; conn bobby_chatgpt_connections%rowtype;
begin
  if p_resource <> 'https://bobbyprotocol.xyz/api/chatgpt' or p_issuer <> 'https://bobbyprotocol.xyz'
     or p_expires_at <= now() or p_expires_at > now() + interval '1 hour'
     or p_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into c from bobby_chatgpt_codes where code_hash = p_code_hash for update;
  if not found or c.client_id <> p_client or c.redirect_uri <> p_redirect_uri or c.challenge <> p_challenge
    or c.resource <> p_resource or c.issuer <> p_issuer then return null; end if;
  if c.consumed_at is not null then
    -- Correctly bound replay invalidates any token issued for this code.
    update bobby_chatgpt_tokens set revoked_at=now() where code_hash=p_code_hash and revoked_at is null;
    return null;
  end if;
  if c.expires_at <= now() then return null; end if;
  select * into conn from bobby_chatgpt_connections where id=c.connection_id for update;
  if not found or conn.revoked_at is not null or conn.grant_version <> c.grant_version
     or not c.scopes <@ conn.scopes or not exists(select 1 from bobby_identities where id=conn.identity_id and auth_user_id is not null) then return null; end if;
  update bobby_chatgpt_codes set consumed_at=now() where code_hash=p_code_hash;
  insert into bobby_chatgpt_tokens(token_hash,code_hash,connection_id,grant_version,client_id,resource,issuer,scopes,expires_at)
    values(p_token_hash,p_code_hash,c.connection_id,c.grant_version,p_client,p_resource,p_issuer,c.scopes,p_expires_at);
  return jsonb_build_object('scopes',c.scopes);
end; $$;

create or replace function public.bobby_chatgpt_token_identity(p_token_hash text,p_resource text,p_issuer text)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object('identity_id',c.identity_id,'client_id',t.client_id,'scopes',t.scopes)
    from bobby_chatgpt_tokens t join bobby_chatgpt_connections c on c.id=t.connection_id
    join bobby_identities i on i.id=c.identity_id
   where t.token_hash=p_token_hash and t.resource=p_resource and t.issuer=p_issuer
     and p_resource='https://bobbyprotocol.xyz/api/chatgpt' and p_issuer='https://bobbyprotocol.xyz'
     and t.expires_at>now() and t.revoked_at is null and c.revoked_at is null
     and t.grant_version=c.grant_version and t.client_id=c.client_id and t.scopes <@ c.scopes
     and i.auth_user_id is not null;
$$;
create or replace function public.bobby_chatgpt_revoke_account(p_identity uuid)
returns void language sql volatile security invoker set search_path = public, pg_temp as $$
  update bobby_chatgpt_connections set revoked_at=now() where identity_id=p_identity and revoked_at is null;
$$;
create or replace function public.bobby_chatgpt_revoke_token(p_token_hash text,p_client uuid)
returns void language sql volatile security invoker set search_path = public, pg_temp as $$
  update bobby_chatgpt_tokens set revoked_at=now() where token_hash=p_token_hash and client_id=p_client and revoked_at is null;
$$;

-- Service-only, bounded daily housekeeping; expired metadata is unusable before deletion.
-- Keep current consent records and registered clients referenced by them.
create or replace function public.bobby_chatgpt_purge()
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
begin
  delete from bobby_chatgpt_codes where code_hash in
    (select code_hash from bobby_chatgpt_codes where expires_at<now()-interval '30 days' limit 5000 for update skip locked);
  -- Tokens cascade with their code; preserve unexpired/recent records for replay checks.
  delete from bobby_chatgpt_connections where id in
    (select c.id from bobby_chatgpt_connections c where c.revoked_at<now()-interval '30 days'
      and not exists(select 1 from bobby_chatgpt_codes k where k.connection_id=c.id)
      and not exists(select 1 from bobby_chatgpt_tokens t where t.connection_id=c.id)
      limit 5000 for update skip locked);
  delete from bobby_chatgpt_clients where id in
    (select c.id from bobby_chatgpt_clients c where c.created_at<now()-interval '30 days'
      and not exists(select 1 from bobby_chatgpt_connections g where g.client_id=c.id)
      limit 5000 for update skip locked);
  return jsonb_build_object('ok',true);
end; $$;

revoke all on function public.bobby_chatgpt_authorize(uuid,uuid,text[],text,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.bobby_chatgpt_exchange_code(text,uuid,text,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.bobby_chatgpt_token_identity(text,text,text) from public,anon,authenticated;
revoke all on function public.bobby_chatgpt_revoke_account(uuid) from public,anon,authenticated;
revoke all on function public.bobby_chatgpt_revoke_token(text,uuid) from public,anon,authenticated;
revoke all on function public.bobby_chatgpt_purge() from public,anon,authenticated;
grant execute on function public.bobby_chatgpt_authorize(uuid,uuid,text[],text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.bobby_chatgpt_exchange_code(text,uuid,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.bobby_chatgpt_token_identity(text,text,text) to service_role;
grant execute on function public.bobby_chatgpt_revoke_account(uuid) to service_role;
grant execute on function public.bobby_chatgpt_revoke_token(text,uuid) to service_role;
grant execute on function public.bobby_chatgpt_purge() to service_role;
