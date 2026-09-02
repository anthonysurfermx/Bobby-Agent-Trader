-- ============================================================
-- Bobby Protocol schema — EXACT copy of the legacy DDL (pg_dump 18.4,
-- --schema-only --no-owner --no-privileges, 2026-09-02), reduced by
-- scripts/migration/filter-schema.mts to the 34 tables Bobby uses plus their
-- constraints, indexes, defaults, sequences, RLS, policies, triggers, the
-- functions those triggers call, and the Bobby RPCs. Kept objects are
-- verbatim. Apply on a CLEAN destination (after 20260903000002_reset_baseline)
-- and before 20260903000003_migration_outbox.
-- Kept: 251 objects · dropped: 474 (DeFi México product, see report)
-- ============================================================
SET statement_timeout = 0; SET lock_timeout = 0; SET client_encoding = 'UTF8'; SET standard_conforming_strings = on;
SET check_function_bodies = false; SET search_path = public, pg_catalog;

-- extensions the kept DDL depends on (detected by the filter)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- Name: bobby_control_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bobby_control_touch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: bobby_publish_debate(uuid, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bobby_publish_debate(p_receipt_id uuid, p_wallet text, p_thread jsonb, p_posts jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $_$
declare
  v_thread_id uuid;
  v_post jsonb;
begin
  if p_receipt_id is null or p_wallet is null or p_thread is null or jsonb_typeof(p_posts) <> 'array' or jsonb_array_length(p_posts) < 2 then
    raise exception 'bobby_publish_debate: invalid arguments' using errcode = '22023';
  end if;
  if p_wallet !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'bobby_publish_debate: invalid wallet' using errcode = '22023';
  end if;
  -- conviction is stored on the protocol scale 0..1 (judge-mode / checkpoint / cycles multiply by 10 for display)
  if (p_thread->>'conviction_score') is null or (p_thread->>'conviction_score')::real < 0 or (p_thread->>'conviction_score')::real > 1 then
    raise exception 'bobby_publish_debate: conviction_score must be within 0..1' using errcode = '22023';
  end if;

  -- single use: duplicate receipt → unique_violation → whole call rolls back
  insert into public.forum_publish_receipts (receipt_id, wallet) values (p_receipt_id, lower(p_wallet));

  insert into public.forum_threads (
    topic, trigger_reason, trigger_data, language, conviction_score, price_at_creation,
    symbol, direction, entry_price, stop_price, target_price, expires_at, scope, owner_wallet
  ) values (
    left(p_thread->>'topic', 200),
    'User debate in Bobby Chat',
    coalesce(p_thread->'trigger_data', '{}'::jsonb),
    coalesce(p_thread->>'language', 'en'),
    (p_thread->>'conviction_score')::real,
    '{}'::jsonb,
    p_thread->>'symbol',
    p_thread->>'direction',
    (p_thread->>'entry_price')::real,
    (p_thread->>'stop_price')::real,
    (p_thread->>'target_price')::real,
    coalesce((p_thread->>'expires_at')::timestamptz, now() + interval '48 hours'),
    'public',
    lower(p_wallet)
  ) returning id into v_thread_id;

  for v_post in select * from jsonb_array_elements(p_posts) loop
    insert into public.forum_posts (thread_id, agent, content, data_snapshot)
    values (v_thread_id, v_post->>'agent', left(v_post->>'content', 4000), '{}'::jsonb);
  end loop;

  update public.forum_publish_receipts set thread_id = v_thread_id where receipt_id = p_receipt_id;
  return v_thread_id;
end $_$;


--
-- Name: bobby_rls_matrix(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bobby_rls_matrix() RETURNS TABLE(tablename text, policyname text, cmd text, roles text[], permissive text, qual text, with_check text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  select p.tablename::text, p.policyname::text, p.cmd::text, p.roles::text[], p.permissive::text, p.qual::text, p.with_check::text
  from pg_policies p
  where p.schemaname = 'public'
  order by p.tablename, p.policyname
$$;


--
-- Name: bobby_rls_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bobby_rls_status() RETURNS TABLE(tablename text, rls_enabled boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  select c.relname::text, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: agent_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_config (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    signals_found integer DEFAULT 0,
    signals_filtered integer DEFAULT 0,
    llm_decisions integer DEFAULT 0,
    trades_executed integer DEFAULT 0,
    trades_blocked integer DEFAULT 0,
    total_usd_deployed numeric(12,2) DEFAULT 0,
    latency_ms integer,
    llm_model text,
    llm_reasoning text,
    error text,
    status text DEFAULT 'running'::text,
    trades_successful integer DEFAULT 0,
    mood text DEFAULT 'confident'::text,
    dynamic_conviction numeric DEFAULT 0,
    safe_mode_active boolean DEFAULT false,
    vibe_phrase text,
    user_id uuid,
    owner_address text,
    state text DEFAULT 'IDLE'::text,
    state_version integer DEFAULT 1,
    idempotency_key text,
    locked_until timestamp with time zone,
    cost_tokens integer DEFAULT 0,
    cost_usd numeric(12,6) DEFAULT 0,
    idle_cash_usd numeric,
    yield_debate_triggered boolean DEFAULT false NOT NULL,
    yield_recommendation_status text DEFAULT 'none'::text NOT NULL,
    yield_position_id uuid,
    CONSTRAINT agent_cycles_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT agent_cycles_yield_reco_status_check CHECK ((yield_recommendation_status = ANY (ARRAY['none'::text, 'recommended'::text, 'active'::text, 'skipped'::text])))
);


--
-- Name: agent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id text NOT NULL,
    thread_id text,
    agent text NOT NULL,
    event_type text NOT NULL,
    tool text,
    symbol text,
    direction text,
    decision text,
    conviction real,
    risk_score real,
    policy_hits jsonb,
    reason text,
    payment_tx text,
    trade_tx text,
    latency_ms integer,
    tokens_in integer,
    tokens_out integer,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_macro_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_macro_events (
    event_key text NOT NULL,
    source text NOT NULL,
    event_type text NOT NULL,
    country text DEFAULT 'US'::text,
    title text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    severity smallint DEFAULT 3,
    risk_window_before_min integer DEFAULT 120,
    risk_window_after_min integer DEFAULT 60,
    state text DEFAULT 'upcoming'::text,
    actual jsonb,
    consensus jsonb,
    previous jsonb,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_market_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_market_snapshots (
    symbol text NOT NULL,
    venue text DEFAULT 'okx'::text NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    price numeric,
    funding_rate numeric,
    next_funding_time timestamp with time zone,
    open_interest numeric,
    oi_ccy numeric,
    top_trader_long_pct numeric,
    top_trader_short_pct numeric,
    taker_buy_volume numeric,
    taker_sell_volume numeric,
    regime text,
    source_quality jsonb,
    derived jsonb
);


--
-- Name: agent_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_memory (
    id bigint NOT NULL,
    agent text NOT NULL,
    user_id uuid,
    owner_address text,
    memory_type text NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    importance smallint DEFAULT 5,
    source_cycle_id uuid,
    tags text[] DEFAULT '{}'::text[],
    decay_after timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_memory_importance_check CHECK (((importance >= 1) AND (importance <= 10))),
    CONSTRAINT agent_memory_memory_type_check CHECK ((memory_type = ANY (ARRAY['experience'::text, 'reflection'::text, 'preference'::text, 'mistake'::text, 'playbook'::text, 'evolution'::text, 'metacog'::text])))
);


--
-- Name: agent_memory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_memory_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_memory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_memory_id_seq OWNED BY public.agent_memory.id;


--
-- Name: agent_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_address text NOT NULL,
    advisor_name text NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_position_rechecks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_position_rechecks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid,
    symbol text NOT NULL,
    direction text NOT NULL,
    checked_at timestamp with time zone DEFAULT now(),
    trigger_type text NOT NULL,
    hard_invalidated boolean DEFAULT false,
    action text DEFAULT 'hold'::text,
    reason text,
    metrics jsonb
);


--
-- Name: agent_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chain text NOT NULL,
    token_address text NOT NULL,
    token_symbol text NOT NULL,
    entry_price numeric(24,12) NOT NULL,
    amount numeric(24,12) NOT NULL,
    amount_usd numeric(12,2) NOT NULL,
    current_price numeric(24,12),
    unrealized_pnl numeric(12,2),
    stop_loss_pct numeric(5,2) DEFAULT 15,
    take_profit_pct numeric(5,2) DEFAULT 50,
    opened_at timestamp with time zone DEFAULT now(),
    closed_at timestamp with time zone,
    close_reason text
);


--
-- Name: agent_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    wallet_address text NOT NULL,
    agent_name text NOT NULL,
    voice text DEFAULT 'male'::text NOT NULL,
    personality text DEFAULT 'analytical'::text NOT NULL,
    cadence_hours integer DEFAULT 6 NOT NULL,
    markets jsonb DEFAULT '["BTC"]'::jsonb NOT NULL,
    delivery jsonb DEFAULT '["web"]'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    last_error text,
    mascot jsonb,
    CONSTRAINT agent_profiles_agent_name_check CHECK (((char_length(agent_name) >= 1) AND (char_length(agent_name) <= 20))),
    CONSTRAINT agent_profiles_cadence_hours_check CHECK ((cadence_hours = ANY (ARRAY[4, 6, 12, 24]))),
    CONSTRAINT agent_profiles_delivery_check CHECK ((jsonb_typeof(delivery) = 'array'::text)),
    CONSTRAINT agent_profiles_markets_check CHECK ((jsonb_typeof(markets) = 'array'::text)),
    CONSTRAINT agent_profiles_personality_check CHECK ((personality = ANY (ARRAY['direct'::text, 'analytical'::text, 'wise'::text]))),
    CONSTRAINT agent_profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'deploying'::text]))),
    CONSTRAINT agent_profiles_voice_check CHECK ((voice = ANY (ARRAY['male'::text, 'female'::text]))),
    CONSTRAINT agent_profiles_wallet_address_check CHECK ((wallet_address ~* '^0x[a-f0-9]{40}$'::text))
);


--
-- Name: agent_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid,
    source text NOT NULL,
    chain text,
    token_symbol text,
    token_address text,
    signal_type text,
    amount_usd numeric(12,2),
    sold_ratio_pct numeric(5,2),
    confidence numeric(3,2),
    raw_data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_signals_source_check CHECK ((source = ANY (ARRAY['okx_dex_signal'::text, 'polymarket'::text, 'okx_trenches'::text, 'okx_cex'::text])))
);


--
-- Name: agent_source_health; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_source_health (
    source text NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    ok boolean DEFAULT true NOT NULL,
    latency_ms integer,
    freshness_s integer,
    records integer,
    quality_score numeric,
    error text,
    payload jsonb
);


--
-- Name: agent_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_trades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid,
    chain text NOT NULL,
    token_address text NOT NULL,
    token_symbol text NOT NULL,
    direction text NOT NULL,
    amount_usd numeric(12,2) NOT NULL,
    entry_price numeric(24,12),
    tx_hash text,
    status text DEFAULT 'pending'::text,
    llm_reasoning text,
    confidence numeric(3,2),
    signal_sources text[],
    created_at timestamp with time zone DEFAULT now(),
    stop_price numeric,
    target_price numeric,
    exit_price numeric,
    outcome text,
    realized_pnl_pct numeric(6,2),
    settled_at timestamp with time zone,
    expires_at timestamp with time zone,
    user_id uuid,
    owner_address text,
    intent_hash text,
    idempotency_key text,
    cio_signature text,
    arbiter_signature text,
    CONSTRAINT agent_trades_direction_check CHECK ((direction = ANY (ARRAY['BUY'::text, 'SELL'::text]))),
    CONSTRAINT agent_trades_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'failed'::text, 'simulated'::text])))
);


--
-- Name: api_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_cache (
    cache_key text NOT NULL,
    payload jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bobby_control; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bobby_control (
    id text DEFAULT 'global'::text NOT NULL,
    write_freeze boolean DEFAULT false NOT NULL,
    canary boolean DEFAULT false NOT NULL,
    note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bobby_early_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bobby_early_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
    consent boolean DEFAULT true NOT NULL,
    consent_text text NOT NULL,
    consent_at timestamp with time zone DEFAULT now() NOT NULL,
    source_page text DEFAULT '/app'::text NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    campaign text DEFAULT 'bobby-ios-early-access'::text NOT NULL,
    referrer text,
    user_agent text,
    ip_hash text,
    unsubscribed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bobby_early_access_language_check CHECK ((language = ANY (ARRAY['en'::text, 'es'::text])))
);


--
-- Name: cycle_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cycle_transitions (
    id bigint NOT NULL,
    cycle_id uuid NOT NULL,
    from_state text,
    to_state text NOT NULL,
    payload jsonb,
    actor text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cycle_transitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cycle_transitions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cycle_transitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cycle_transitions_id_seq OWNED BY public.cycle_transitions.id;


--
-- Name: forum_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    agent text NOT NULL,
    content text NOT NULL,
    data_snapshot jsonb DEFAULT '{}'::jsonb,
    upvotes integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: forum_publish_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_publish_receipts (
    receipt_id uuid NOT NULL,
    wallet text NOT NULL,
    thread_id uuid,
    consumed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: forum_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic text NOT NULL,
    trigger_reason text NOT NULL,
    trigger_data jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'active'::text NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    conviction_score real,
    price_at_creation jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    symbol text,
    direction text DEFAULT 'long'::text,
    entry_price real,
    stop_price real,
    target_price real,
    resolution text DEFAULT 'pending'::text,
    resolution_price real,
    resolved_at timestamp with time zone,
    resolution_pnl_pct real,
    expires_at timestamp with time zone,
    cycle_id uuid,
    kind text DEFAULT 'scheduled'::text,
    execution_status text DEFAULT 'pending'::text,
    execution_reason text,
    resolution_tx_hash text,
    scope text DEFAULT 'public'::text NOT NULL,
    owner_user_id uuid,
    agent_profile_id uuid,
    owner_wallet text,
    debate_quality jsonb,
    CONSTRAINT forum_threads_resolution_check CHECK ((resolution = ANY (ARRAY['pending'::text, 'win'::text, 'loss'::text, 'expired'::text, 'break_even'::text]))),
    CONSTRAINT forum_threads_scope_check CHECK ((scope = ANY (ARRAY['public'::text, 'private'::text])))
);


--
-- Name: hardness_agent_proofs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hardness_agent_proofs (
    id bigint NOT NULL,
    session_id text NOT NULL,
    prediction_hash text,
    commit_tx_hash text,
    signal_tx_hash text,
    resolve_tx_hash text,
    chain_id integer DEFAULT 196 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hardness_agent_proofs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.hardness_agent_proofs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.hardness_agent_proofs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: hardness_agent_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hardness_agent_sessions (
    id bigint NOT NULL,
    session_id text NOT NULL,
    agent_id text NOT NULL,
    intent text NOT NULL,
    symbol text,
    direction text,
    request_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    context_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    decision_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    policy_result text,
    hardness_score integer,
    status text DEFAULT 'received'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hardness_agent_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.hardness_agent_sessions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.hardness_agent_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: hardness_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hardness_agents (
    id bigint NOT NULL,
    agent_id text NOT NULL,
    owner_address text NOT NULL,
    name text NOT NULL,
    agent_type text DEFAULT 'trading-agent'::text NOT NULL,
    version text,
    capabilities jsonb DEFAULT '[]'::jsonb NOT NULL,
    mcp_endpoint text,
    webhook_url text,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    risk_policy_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hardness_agents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.hardness_agents ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.hardness_agents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: indicator_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.indicator_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inst_id text NOT NULL,
    timeframe text DEFAULT '1H'::text NOT NULL,
    indicators jsonb NOT NULL,
    composite_score real,
    signal text,
    conviction real,
    agreement real,
    trade_plan jsonb,
    breakdown jsonb,
    source text DEFAULT 'OKX Agent Trade Kit'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: llm_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_calls (
    id bigint NOT NULL,
    cycle_id uuid,
    provider text NOT NULL,
    model text NOT NULL,
    agent text,
    endpoint text,
    tokens_in integer,
    tokens_out integer,
    cached_tokens integer DEFAULT 0,
    cost_usd numeric(12,6),
    cache_hit boolean DEFAULT false,
    latency_ms integer,
    status text,
    error text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: llm_calls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.llm_calls_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: llm_calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.llm_calls_id_seq OWNED BY public.llm_calls.id;


--
-- Name: mcp_payment_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_payment_challenges (
    challenge_id uuid DEFAULT gen_random_uuid() NOT NULL,
    tool_name text NOT NULL,
    request_hash text,
    price_wei text DEFAULT '1000000000000000'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    payer_address text,
    tx_hash text,
    external_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    consumed_at timestamp with time zone,
    CONSTRAINT mcp_payment_challenges_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'consumed'::text, 'expired'::text])))
);


--
-- Name: mcp_payment_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_payment_receipts (
    tx_hash text NOT NULL,
    challenge_id uuid NOT NULL,
    payer_address text NOT NULL,
    tool_name text NOT NULL,
    block_number bigint NOT NULL,
    value_wei text NOT NULL,
    value_okb text NOT NULL,
    verified_at timestamp with time zone DEFAULT now() NOT NULL,
    response_hash text,
    explorer_url text
);


--
-- Name: memory_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    thread_id text,
    symbol text,
    direction text,
    regime text,
    conviction real,
    outcome text,
    pnl_pct real,
    lesson text NOT NULL,
    tags jsonb,
    source_events jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: sandbox_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sandbox_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    playbook_slug text NOT NULL,
    ticker text NOT NULL,
    market_snapshot jsonb,
    alpha_text text,
    red_text text,
    cio_text text,
    cio_action text,
    cio_conviction numeric(4,2),
    judge_scores jsonb,
    guardrail_results jsonb,
    verdict_action text,
    guardrails_passed integer,
    guardrails_failed integer,
    guardrails_total integer,
    verdict_reason text,
    status text DEFAULT 'completed'::text NOT NULL,
    error_phase text,
    error_message text,
    ip_hash text,
    user_agent text
);


--
-- Name: telegram_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_address text,
    agent_profile_id uuid,
    telegram_user_id bigint NOT NULL,
    telegram_chat_id bigint NOT NULL,
    telegram_username text,
    connect_token text,
    status text DEFAULT 'active'::text NOT NULL,
    message_count integer DEFAULT 0 NOT NULL,
    is_premium boolean DEFAULT false NOT NULL,
    premium_until timestamp with time zone,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_connections_status_check CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'disconnected'::text])))
);


--
-- Name: trade_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_intents (
    id bigint NOT NULL,
    intent_hash text NOT NULL,
    cycle_id uuid,
    user_id uuid,
    owner_address text,
    chain_id integer DEFAULT 196 NOT NULL,
    symbol text NOT NULL,
    direction text NOT NULL,
    size_usd numeric(16,2),
    entry_ref numeric(32,8),
    slippage_max_bps integer,
    treasury text,
    nonce bigint,
    expires_at timestamp with time zone,
    cio_signature text,
    arbiter_signature text,
    verification_status text DEFAULT 'pending'::text,
    rejection_reason text,
    commit_tx_hash text,
    verify_tx_hash text,
    execute_tx_hash text,
    resolve_tx_hash text,
    attestation_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT trade_intents_direction_check CHECK ((direction = ANY (ARRAY['long'::text, 'short'::text]))),
    CONSTRAINT trade_intents_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'executed'::text, 'failed'::text])))
);


--
-- Name: trade_intents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trade_intents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trade_intents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trade_intents_id_seq OWNED BY public.trade_intents.id;


--
-- Name: user_digests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_digests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid,
    thread_id uuid,
    wallet_address text,
    summary text NOT NULL,
    highlights jsonb DEFAULT '[]'::jsonb,
    positions_snapshot jsonb,
    market_snapshot jsonb,
    language text DEFAULT 'en'::text,
    kind text DEFAULT 'scheduled'::text,
    delivered_at timestamp with time zone,
    viewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_digests_kind_check CHECK ((kind = ANY (ARRAY['scheduled'::text, 'morning'::text, 'alert'::text, 'manual'::text])))
);


--
-- Name: user_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_email text,
    wallet_address text,
    type text DEFAULT 'bug'::text NOT NULL,
    message text NOT NULL,
    page text,
    context jsonb,
    status text DEFAULT 'new'::text,
    resolution text
);


--
-- Name: user_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_interests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_address text NOT NULL,
    asset text NOT NULL,
    context text,
    target_threshold numeric DEFAULT 0.75,
    last_conviction numeric DEFAULT 0,
    last_notified_at timestamp with time zone,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_memory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory ALTER COLUMN id SET DEFAULT nextval('public.agent_memory_id_seq'::regclass);


--
-- Name: cycle_transitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cycle_transitions ALTER COLUMN id SET DEFAULT nextval('public.cycle_transitions_id_seq'::regclass);


--
-- Name: llm_calls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_calls ALTER COLUMN id SET DEFAULT nextval('public.llm_calls_id_seq'::regclass);


--
-- Name: trade_intents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_intents ALTER COLUMN id SET DEFAULT nextval('public.trade_intents_id_seq'::regclass);


--
-- Name: agent_config agent_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_config
    ADD CONSTRAINT agent_config_pkey PRIMARY KEY (key);


--
-- Name: agent_cycles agent_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_cycles
    ADD CONSTRAINT agent_cycles_pkey PRIMARY KEY (id);


--
-- Name: agent_events agent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_events
    ADD CONSTRAINT agent_events_pkey PRIMARY KEY (id);


--
-- Name: agent_macro_events agent_macro_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_macro_events
    ADD CONSTRAINT agent_macro_events_pkey PRIMARY KEY (event_key);


--
-- Name: agent_market_snapshots agent_market_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_market_snapshots
    ADD CONSTRAINT agent_market_snapshots_pkey PRIMARY KEY (symbol, venue, ts);


--
-- Name: agent_memory agent_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_pkey PRIMARY KEY (id);


--
-- Name: agent_messages agent_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_pkey PRIMARY KEY (id);


--
-- Name: agent_position_rechecks agent_position_rechecks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_position_rechecks
    ADD CONSTRAINT agent_position_rechecks_pkey PRIMARY KEY (id);


--
-- Name: agent_positions agent_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_positions
    ADD CONSTRAINT agent_positions_pkey PRIMARY KEY (id);


--
-- Name: agent_profiles agent_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_profiles
    ADD CONSTRAINT agent_profiles_pkey PRIMARY KEY (id);


--
-- Name: agent_profiles agent_profiles_wallet_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_profiles
    ADD CONSTRAINT agent_profiles_wallet_address_key UNIQUE (wallet_address);


--
-- Name: agent_signals agent_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_signals
    ADD CONSTRAINT agent_signals_pkey PRIMARY KEY (id);


--
-- Name: agent_source_health agent_source_health_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_source_health
    ADD CONSTRAINT agent_source_health_pkey PRIMARY KEY (source, checked_at);


--
-- Name: agent_trades agent_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_trades
    ADD CONSTRAINT agent_trades_pkey PRIMARY KEY (id);


--
-- Name: api_cache api_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_cache
    ADD CONSTRAINT api_cache_pkey PRIMARY KEY (cache_key);


--
-- Name: bobby_control bobby_control_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bobby_control
    ADD CONSTRAINT bobby_control_pkey PRIMARY KEY (id);


--
-- Name: bobby_early_access bobby_early_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bobby_early_access
    ADD CONSTRAINT bobby_early_access_pkey PRIMARY KEY (id);


--
-- Name: cycle_transitions cycle_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cycle_transitions
    ADD CONSTRAINT cycle_transitions_pkey PRIMARY KEY (id);


--
-- Name: forum_posts forum_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_posts
    ADD CONSTRAINT forum_posts_pkey PRIMARY KEY (id);


--
-- Name: forum_publish_receipts forum_publish_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_publish_receipts
    ADD CONSTRAINT forum_publish_receipts_pkey PRIMARY KEY (receipt_id);


--
-- Name: forum_threads forum_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_threads
    ADD CONSTRAINT forum_threads_pkey PRIMARY KEY (id);


--
-- Name: hardness_agent_proofs hardness_agent_proofs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardness_agent_proofs
    ADD CONSTRAINT hardness_agent_proofs_pkey PRIMARY KEY (id);


--
-- Name: hardness_agent_sessions hardness_agent_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardness_agent_sessions
    ADD CONSTRAINT hardness_agent_sessions_pkey PRIMARY KEY (id);


--
-- Name: hardness_agent_sessions hardness_agent_sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardness_agent_sessions
    ADD CONSTRAINT hardness_agent_sessions_session_id_key UNIQUE (session_id);


--
-- Name: hardness_agents hardness_agents_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardness_agents
    ADD CONSTRAINT hardness_agents_agent_id_key UNIQUE (agent_id);


--
-- Name: hardness_agents hardness_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardness_agents
    ADD CONSTRAINT hardness_agents_pkey PRIMARY KEY (id);


--
-- Name: indicator_cache indicator_cache_inst_id_timeframe_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicator_cache
    ADD CONSTRAINT indicator_cache_inst_id_timeframe_key UNIQUE (inst_id, timeframe);


--
-- Name: indicator_cache indicator_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicator_cache
    ADD CONSTRAINT indicator_cache_pkey PRIMARY KEY (id);


--
-- Name: llm_calls llm_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_calls
    ADD CONSTRAINT llm_calls_pkey PRIMARY KEY (id);


--
-- Name: mcp_payment_challenges mcp_payment_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_payment_challenges
    ADD CONSTRAINT mcp_payment_challenges_pkey PRIMARY KEY (challenge_id);


--
-- Name: mcp_payment_challenges mcp_payment_challenges_tx_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_payment_challenges
    ADD CONSTRAINT mcp_payment_challenges_tx_hash_key UNIQUE (tx_hash);


--
-- Name: mcp_payment_receipts mcp_payment_receipts_challenge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_payment_receipts
    ADD CONSTRAINT mcp_payment_receipts_challenge_id_key UNIQUE (challenge_id);


--
-- Name: mcp_payment_receipts mcp_payment_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_payment_receipts
    ADD CONSTRAINT mcp_payment_receipts_pkey PRIMARY KEY (tx_hash);


--
-- Name: memory_objects memory_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_objects
    ADD CONSTRAINT memory_objects_pkey PRIMARY KEY (id);


--
-- Name: sandbox_runs sandbox_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sandbox_runs
    ADD CONSTRAINT sandbox_runs_pkey PRIMARY KEY (id);


--
-- Name: telegram_connections telegram_connections_connect_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_connections
    ADD CONSTRAINT telegram_connections_connect_token_key UNIQUE (connect_token);


--
-- Name: telegram_connections telegram_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_connections
    ADD CONSTRAINT telegram_connections_pkey PRIMARY KEY (id);


--
-- Name: trade_intents trade_intents_intent_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_intents
    ADD CONSTRAINT trade_intents_intent_hash_key UNIQUE (intent_hash);


--
-- Name: trade_intents trade_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_intents
    ADD CONSTRAINT trade_intents_pkey PRIMARY KEY (id);


--
-- Name: user_digests user_digests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_digests
    ADD CONSTRAINT user_digests_pkey PRIMARY KEY (id);


--
-- Name: user_feedback user_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_feedback
    ADD CONSTRAINT user_feedback_pkey PRIMARY KEY (id);


--
-- Name: user_interests user_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_pkey PRIMARY KEY (id);


--
-- Name: agent_cycles_idem_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agent_cycles_idem_uidx ON public.agent_cycles USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: agent_cycles_state_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_cycles_state_started_idx ON public.agent_cycles USING btree (state, started_at DESC);


--
-- Name: agent_memory_agent_type_imp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_memory_agent_type_imp_idx ON public.agent_memory USING btree (agent, memory_type, importance DESC, created_at DESC);


--
-- Name: agent_memory_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_memory_embedding_idx ON public.agent_memory USING ivfflat (embedding public.vector_cosine_ops);


--
-- Name: agent_trades_cycle_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_trades_cycle_id_idx ON public.agent_trades USING btree (cycle_id);


--
-- Name: agent_trades_idem_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agent_trades_idem_uidx ON public.agent_trades USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: agent_trades_status_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_trades_status_open_idx ON public.agent_trades USING btree (status) WHERE (status = 'open'::text);


--
-- Name: agent_trades_symbol_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_trades_symbol_created_idx ON public.agent_trades USING btree (token_symbol, created_at DESC);


--
-- Name: api_cache_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_cache_expires_at_idx ON public.api_cache USING btree (expires_at);


--
-- Name: bobby_early_access_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bobby_early_access_created_idx ON public.bobby_early_access USING btree (created_at DESC);


--
-- Name: bobby_early_access_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bobby_early_access_email_idx ON public.bobby_early_access USING btree (email_normalized);


--
-- Name: cycle_transitions_cycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cycle_transitions_cycle_idx ON public.cycle_transitions USING btree (cycle_id, created_at);


--
-- Name: forum_threads_dir_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX forum_threads_dir_status_created_idx ON public.forum_threads USING btree (direction, status, created_at DESC);


--
-- Name: idx_agent_cycles_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_cycles_started ON public.agent_cycles USING btree (started_at DESC);


--
-- Name: idx_agent_cycles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_cycles_status ON public.agent_cycles USING btree (status);


--
-- Name: idx_agent_events_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_events_agent ON public.agent_events USING btree (agent);


--
-- Name: idx_agent_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_events_created_at ON public.agent_events USING btree (created_at DESC);


--
-- Name: idx_agent_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_events_event_type ON public.agent_events USING btree (event_type);


--
-- Name: idx_agent_events_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_events_run_id ON public.agent_events USING btree (run_id);


--
-- Name: idx_agent_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_messages_created ON public.agent_messages USING btree (created_at DESC);


--
-- Name: idx_agent_messages_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_messages_wallet ON public.agent_messages USING btree (wallet_address);


--
-- Name: idx_agent_positions_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_positions_open ON public.agent_positions USING btree (closed_at) WHERE (closed_at IS NULL);


--
-- Name: idx_agent_profiles_due_runs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_profiles_due_runs ON public.agent_profiles USING btree (next_run_at) WHERE (status = ANY (ARRAY['active'::text, 'deploying'::text]));


--
-- Name: idx_agent_profiles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_profiles_status ON public.agent_profiles USING btree (status);


--
-- Name: idx_agent_profiles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_profiles_user_id ON public.agent_profiles USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_agent_signals_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_signals_created ON public.agent_signals USING btree (created_at DESC);


--
-- Name: idx_agent_signals_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_signals_cycle ON public.agent_signals USING btree (cycle_id);


--
-- Name: idx_agent_trades_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_trades_created ON public.agent_trades USING btree (created_at DESC);


--
-- Name: idx_agent_trades_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_trades_cycle ON public.agent_trades USING btree (cycle_id);


--
-- Name: idx_challenges_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenges_expires ON public.mcp_payment_challenges USING btree (expires_at) WHERE (status = 'pending'::text);


--
-- Name: idx_challenges_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenges_status ON public.mcp_payment_challenges USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: idx_forum_posts_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_posts_thread ON public.forum_posts USING btree (thread_id);


--
-- Name: idx_forum_threads_agent_profile_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_agent_profile_created ON public.forum_threads USING btree (agent_profile_id, created_at DESC) WHERE (agent_profile_id IS NOT NULL);


--
-- Name: idx_forum_threads_agent_profile_quality; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_agent_profile_quality ON public.forum_threads USING btree (agent_profile_id, created_at DESC) WHERE ((scope = 'private'::text) AND (debate_quality IS NOT NULL));


--
-- Name: idx_forum_threads_agent_profile_resolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_agent_profile_resolved ON public.forum_threads USING btree (agent_profile_id, created_at DESC) WHERE ((scope = 'private'::text) AND (resolution IS NOT NULL));


--
-- Name: idx_forum_threads_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_created ON public.forum_threads USING btree (created_at DESC);


--
-- Name: idx_forum_threads_lang; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_lang ON public.forum_threads USING btree (language);


--
-- Name: idx_forum_threads_owner_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_owner_created ON public.forum_threads USING btree (owner_user_id, created_at DESC) WHERE (owner_user_id IS NOT NULL);


--
-- Name: idx_forum_threads_owner_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_owner_wallet ON public.forum_threads USING btree (owner_wallet) WHERE (owner_wallet IS NOT NULL);


--
-- Name: idx_forum_threads_scope_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_scope_created ON public.forum_threads USING btree (scope, created_at DESC);


--
-- Name: idx_indicator_cache_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_indicator_cache_lookup ON public.indicator_cache USING btree (inst_id, timeframe, created_at DESC);


--
-- Name: idx_macro_events_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_macro_events_scheduled ON public.agent_macro_events USING btree (scheduled_at);


--
-- Name: idx_market_snapshots_symbol_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_market_snapshots_symbol_ts ON public.agent_market_snapshots USING btree (symbol, ts DESC);


--
-- Name: idx_memory_objects_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_objects_created_at ON public.memory_objects USING btree (created_at DESC);


--
-- Name: idx_memory_objects_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_objects_kind ON public.memory_objects USING btree (kind);


--
-- Name: idx_memory_objects_outcome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_objects_outcome ON public.memory_objects USING btree (outcome);


--
-- Name: idx_memory_objects_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_objects_symbol ON public.memory_objects USING btree (symbol);


--
-- Name: idx_position_rechecks_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_position_rechecks_thread ON public.agent_position_rechecks USING btree (thread_id, checked_at DESC);


--
-- Name: idx_sandbox_runs_created_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sandbox_runs_created_desc ON public.sandbox_runs USING btree (created_at DESC);


--
-- Name: idx_sandbox_runs_ip_hash_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sandbox_runs_ip_hash_recent ON public.sandbox_runs USING btree (ip_hash, created_at DESC);


--
-- Name: idx_sandbox_runs_playbook_verdict; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sandbox_runs_playbook_verdict ON public.sandbox_runs USING btree (playbook_slug, verdict_action);


--
-- Name: idx_source_health_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_source_health_source ON public.agent_source_health USING btree (source, checked_at DESC);


--
-- Name: idx_tg_connections_chat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tg_connections_chat ON public.telegram_connections USING btree (telegram_chat_id);


--
-- Name: idx_tg_connections_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tg_connections_token ON public.telegram_connections USING btree (connect_token) WHERE (connect_token IS NOT NULL);


--
-- Name: idx_tg_connections_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tg_connections_wallet ON public.telegram_connections USING btree (wallet_address) WHERE (wallet_address IS NOT NULL);


--
-- Name: idx_user_digests_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_digests_cycle ON public.user_digests USING btree (cycle_id);


--
-- Name: idx_user_digests_global; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_digests_global ON public.user_digests USING btree (created_at DESC) WHERE (wallet_address IS NULL);


--
-- Name: idx_user_digests_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_digests_wallet ON public.user_digests USING btree (wallet_address, created_at DESC);


--
-- Name: idx_user_interests_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_interests_asset ON public.user_interests USING btree (asset);


--
-- Name: idx_user_interests_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_interests_wallet ON public.user_interests USING btree (wallet_address);


--
-- Name: llm_calls_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_calls_agent_idx ON public.llm_calls USING btree (agent, created_at DESC);


--
-- Name: llm_calls_cycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_calls_cycle_idx ON public.llm_calls USING btree (cycle_id);


--
-- Name: llm_calls_model_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_calls_model_created_idx ON public.llm_calls USING btree (model, created_at DESC);


--
-- Name: trade_intents_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trade_intents_owner_idx ON public.trade_intents USING btree (owner_address, created_at DESC);


--
-- Name: trade_intents_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trade_intents_status_idx ON public.trade_intents USING btree (verification_status, created_at DESC);


--
-- Name: bobby_control bobby_control_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bobby_control_touch BEFORE UPDATE ON public.bobby_control FOR EACH ROW EXECUTE FUNCTION public.bobby_control_touch();


--
-- Name: agent_profiles trg_agent_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agent_profiles_updated_at BEFORE UPDATE ON public.agent_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: agent_position_rechecks agent_position_rechecks_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_position_rechecks
    ADD CONSTRAINT agent_position_rechecks_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id);


--
-- Name: agent_profiles agent_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_profiles
    ADD CONSTRAINT agent_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_signals agent_signals_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_signals
    ADD CONSTRAINT agent_signals_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.agent_cycles(id) ON DELETE CASCADE;


--
-- Name: agent_trades agent_trades_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_trades
    ADD CONSTRAINT agent_trades_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.agent_cycles(id) ON DELETE CASCADE;


--
-- Name: forum_posts forum_posts_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_posts
    ADD CONSTRAINT forum_posts_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_threads forum_threads_agent_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_threads
    ADD CONSTRAINT forum_threads_agent_profile_id_fkey FOREIGN KEY (agent_profile_id) REFERENCES public.agent_profiles(id) ON DELETE SET NULL;


--
-- Name: forum_threads forum_threads_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_threads
    ADD CONSTRAINT forum_threads_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mcp_payment_receipts mcp_payment_receipts_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_payment_receipts
    ADD CONSTRAINT mcp_payment_receipts_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.mcp_payment_challenges(challenge_id);


--
-- Name: telegram_connections telegram_connections_agent_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_connections
    ADD CONSTRAINT telegram_connections_agent_profile_id_fkey FOREIGN KEY (agent_profile_id) REFERENCES public.agent_profiles(id) ON DELETE SET NULL;


--
-- Name: user_digests user_digests_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_digests
    ADD CONSTRAINT user_digests_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.agent_cycles(id);


--
-- Name: agent_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_config ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_config agent_config_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_config_service_all ON public.agent_config TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_cycles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_cycles ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_cycles agent_cycles_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_cycles_public_read ON public.agent_cycles FOR SELECT TO authenticated, anon USING (true);


--
-- Name: agent_cycles agent_cycles_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_cycles_service_all ON public.agent_cycles TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_events agent_events_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_events_public_read ON public.agent_events FOR SELECT TO authenticated, anon USING (true);


--
-- Name: agent_events agent_events_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_events_service_all ON public.agent_events TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_macro_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_macro_events ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_macro_events agent_macro_events_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_macro_events_service_all ON public.agent_macro_events TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_market_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_market_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_market_snapshots agent_market_snapshots_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_market_snapshots_service_all ON public.agent_market_snapshots TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_memory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_memory agent_memory_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_memory_service_all ON public.agent_memory TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_messages agent_messages_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_messages_service_all ON public.agent_messages TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_position_rechecks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_position_rechecks ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_position_rechecks agent_position_rechecks_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_position_rechecks_service_all ON public.agent_position_rechecks TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_positions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_positions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_positions agent_positions_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_positions_public_read ON public.agent_positions FOR SELECT TO authenticated, anon USING (true);


--
-- Name: agent_positions agent_positions_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_positions_service_all ON public.agent_positions TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_profiles agent_profiles_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_profiles_service_all ON public.agent_profiles TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_signals ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_signals agent_signals_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_signals_public_read ON public.agent_signals FOR SELECT TO authenticated, anon USING (true);


--
-- Name: agent_signals agent_signals_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_signals_service_all ON public.agent_signals TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_source_health; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_source_health ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_source_health agent_source_health_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_source_health_service_all ON public.agent_source_health TO service_role USING (true) WITH CHECK (true);


--
-- Name: agent_trades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_trades ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_trades agent_trades_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_trades_public_read ON public.agent_trades FOR SELECT TO authenticated, anon USING (true);


--
-- Name: agent_trades agent_trades_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_trades_service_all ON public.agent_trades TO service_role USING (true) WITH CHECK (true);


--
-- Name: api_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: api_cache api_cache_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_cache_anon_read ON public.api_cache FOR SELECT TO authenticated, anon USING ((expires_at > now()));


--
-- Name: api_cache api_cache_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_cache_service_all ON public.api_cache TO service_role USING (true) WITH CHECK (true);


--
-- Name: bobby_control; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bobby_control ENABLE ROW LEVEL SECURITY;

--
-- Name: bobby_early_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bobby_early_access ENABLE ROW LEVEL SECURITY;

--
-- Name: bobby_early_access bobby_early_access_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bobby_early_access_service_all ON public.bobby_early_access TO service_role USING (true) WITH CHECK (true);


--
-- Name: cycle_transitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cycle_transitions ENABLE ROW LEVEL SECURITY;

--
-- Name: cycle_transitions cycle_transitions_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycle_transitions_service_all ON public.cycle_transitions TO service_role USING (true) WITH CHECK (true);


--
-- Name: forum_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_posts forum_posts_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY forum_posts_public_read ON public.forum_posts FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.forum_threads t
  WHERE ((t.id = forum_posts.thread_id) AND (t.scope = 'public'::text)))));


--
-- Name: forum_posts forum_posts_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY forum_posts_service_all ON public.forum_posts TO service_role USING (true) WITH CHECK (true);


--
-- Name: forum_publish_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_publish_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_publish_receipts forum_publish_receipts_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY forum_publish_receipts_service_all ON public.forum_publish_receipts TO service_role USING (true) WITH CHECK (true);


--
-- Name: forum_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_threads forum_threads_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY forum_threads_public_read ON public.forum_threads FOR SELECT TO authenticated, anon USING ((scope = 'public'::text));


--
-- Name: forum_threads forum_threads_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY forum_threads_service_all ON public.forum_threads TO service_role USING (true) WITH CHECK (true);


--
-- Name: hardness_agent_proofs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hardness_agent_proofs ENABLE ROW LEVEL SECURITY;

--
-- Name: hardness_agent_proofs hardness_agent_proofs_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardness_agent_proofs_public_read ON public.hardness_agent_proofs FOR SELECT TO authenticated, anon USING (true);


--
-- Name: hardness_agent_proofs hardness_agent_proofs_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardness_agent_proofs_service_all ON public.hardness_agent_proofs TO service_role USING (true) WITH CHECK (true);


--
-- Name: hardness_agent_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hardness_agent_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: hardness_agent_sessions hardness_agent_sessions_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardness_agent_sessions_service_all ON public.hardness_agent_sessions TO service_role USING (true) WITH CHECK (true);


--
-- Name: hardness_agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hardness_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: hardness_agents hardness_agents_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardness_agents_service_all ON public.hardness_agents TO service_role USING (true) WITH CHECK (true);


--
-- Name: indicator_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.indicator_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: indicator_cache indicator_cache_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY indicator_cache_anon_read ON public.indicator_cache FOR SELECT TO authenticated, anon USING (true);


--
-- Name: indicator_cache indicator_cache_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY indicator_cache_service_all ON public.indicator_cache TO service_role USING (true) WITH CHECK (true);


--
-- Name: llm_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.llm_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_calls llm_calls_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY llm_calls_service_all ON public.llm_calls TO service_role USING (true) WITH CHECK (true);


--
-- Name: mcp_payment_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcp_payment_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_payment_challenges mcp_payment_challenges_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mcp_payment_challenges_service_all ON public.mcp_payment_challenges TO service_role USING (true) WITH CHECK (true);


--
-- Name: mcp_payment_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcp_payment_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: mcp_payment_receipts mcp_payment_receipts_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mcp_payment_receipts_service_all ON public.mcp_payment_receipts TO service_role USING (true) WITH CHECK (true);


--
-- Name: memory_objects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memory_objects ENABLE ROW LEVEL SECURITY;

--
-- Name: memory_objects memory_objects_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memory_objects_service_all ON public.memory_objects TO service_role USING (true) WITH CHECK (true);


--
-- Name: sandbox_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sandbox_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: sandbox_runs sandbox_runs_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sandbox_runs_service_all ON public.sandbox_runs TO service_role USING (true) WITH CHECK (true);


--
-- Name: telegram_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_connections telegram_connections_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_connections_service_all ON public.telegram_connections TO service_role USING (true) WITH CHECK (true);


--
-- Name: trade_intents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trade_intents ENABLE ROW LEVEL SECURITY;

--
-- Name: trade_intents trade_intents_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trade_intents_service_all ON public.trade_intents TO service_role USING (true) WITH CHECK (true);


--
-- Name: user_digests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_digests ENABLE ROW LEVEL SECURITY;

--
-- Name: user_digests user_digests_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_digests_service_all ON public.user_digests TO service_role USING (true) WITH CHECK (true);


--
-- Name: user_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: user_feedback user_feedback_anon_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_feedback_anon_insert ON public.user_feedback FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: user_feedback user_feedback_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_feedback_service_all ON public.user_feedback TO service_role USING (true) WITH CHECK (true);


--
-- Name: user_interests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;

--
-- Name: user_interests user_interests_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_interests_service_all ON public.user_interests TO service_role USING (true) WITH CHECK (true);


--
