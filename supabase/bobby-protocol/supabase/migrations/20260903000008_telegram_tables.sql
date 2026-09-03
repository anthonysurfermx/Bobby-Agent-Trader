-- ============================================================
-- Bobby's Telegram activation tables — EXACT legacy DDL (pg_dump 18.4 -t, 2026-09-03).
-- Excluded from the first copy by mistake (taken for aigts-bot tables); Bobby's own
-- api/telegram-access, telegram-deliver and telegram-webhook depend on them.
-- Plus (security review): payment_tx_hash must be unique — the activation flow's
-- check-then-insert was racy; the index makes a replayed payment impossible.
-- ============================================================
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.4
-- Dumped by pg_dump version 18.4




--
-- Name: telegram_activation_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_activation_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    telegram_group_id bigint NOT NULL,
    telegram_user_id bigint NOT NULL,
    payer_wallet_address text,
    x402_reference text NOT NULL,
    resource text NOT NULL,
    payment_asset text DEFAULT 'USDT'::text NOT NULL,
    payment_amount_atomic text DEFAULT '10000'::text NOT NULL,
    pay_to text DEFAULT '0xF841b428E6d743187D7BE2242eccC1078fdE2395'::text NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    payment_payload_hash text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_activation_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'settled'::text, 'expired'::text, 'cancelled'::text, 'consumed'::text])))
);


--
-- Name: telegram_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    telegram_group_id bigint NOT NULL,
    telegram_group_name text,
    telegram_group_username text,
    added_by_telegram_user_id bigint,
    added_by_telegram_username text,
    bot_status text DEFAULT 'pending_payment'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    CONSTRAINT telegram_groups_bot_status_check CHECK ((bot_status = ANY (ARRAY['pending_payment'::text, 'active'::text, 'expired'::text, 'removed'::text, 'blocked'::text])))
);


--
-- Name: telegram_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    telegram_group_id bigint NOT NULL,
    payer_wallet_address text NOT NULL,
    payment_tx_hash text,
    payment_asset text DEFAULT 'USDT'::text NOT NULL,
    payment_amount_atomic text NOT NULL,
    chain_id integer DEFAULT 196 NOT NULL,
    x402_reference text NOT NULL,
    verification_response jsonb,
    settlement_response jsonb,
    activated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: telegram_activation_sessions telegram_activation_sessions_payment_payload_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_activation_sessions
    ADD CONSTRAINT telegram_activation_sessions_payment_payload_hash_key UNIQUE (payment_payload_hash);


--
-- Name: telegram_activation_sessions telegram_activation_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_activation_sessions
    ADD CONSTRAINT telegram_activation_sessions_pkey PRIMARY KEY (id);


--
-- Name: telegram_activation_sessions telegram_activation_sessions_x402_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_activation_sessions
    ADD CONSTRAINT telegram_activation_sessions_x402_reference_key UNIQUE (x402_reference);


--
-- Name: telegram_groups telegram_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_groups
    ADD CONSTRAINT telegram_groups_pkey PRIMARY KEY (id);


--
-- Name: telegram_groups telegram_groups_telegram_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_groups
    ADD CONSTRAINT telegram_groups_telegram_group_id_key UNIQUE (telegram_group_id);


--
-- Name: telegram_subscriptions telegram_subscriptions_payment_tx_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_subscriptions
    ADD CONSTRAINT telegram_subscriptions_payment_tx_hash_key UNIQUE (payment_tx_hash);


--
-- Name: telegram_subscriptions telegram_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_subscriptions
    ADD CONSTRAINT telegram_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: telegram_subscriptions telegram_subscriptions_x402_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_subscriptions
    ADD CONSTRAINT telegram_subscriptions_x402_reference_key UNIQUE (x402_reference);


--
-- Name: idx_tg_sessions_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tg_sessions_group ON public.telegram_activation_sessions USING btree (telegram_group_id);


--
-- Name: idx_tg_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tg_sessions_status ON public.telegram_activation_sessions USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: idx_tg_subs_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tg_subs_expires ON public.telegram_subscriptions USING btree (expires_at) WHERE (status = 'active'::text);


--
-- Name: idx_tg_subs_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tg_subs_group ON public.telegram_subscriptions USING btree (telegram_group_id);


--
-- Name: idx_tg_subs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tg_subs_status ON public.telegram_subscriptions USING btree (status) WHERE (status = 'active'::text);


--
-- Name: telegram_activation_sessions telegram_activation_sessions_telegram_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_activation_sessions
    ADD CONSTRAINT telegram_activation_sessions_telegram_group_id_fkey FOREIGN KEY (telegram_group_id) REFERENCES public.telegram_groups(telegram_group_id) ON DELETE CASCADE;


--
-- Name: telegram_subscriptions telegram_subscriptions_telegram_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_subscriptions
    ADD CONSTRAINT telegram_subscriptions_telegram_group_id_fkey FOREIGN KEY (telegram_group_id) REFERENCES public.telegram_groups(telegram_group_id) ON DELETE CASCADE;


--
-- Name: telegram_activation_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_activation_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_activation_sessions telegram_activation_sessions_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_activation_sessions_service_all ON public.telegram_activation_sessions TO service_role USING (true) WITH CHECK (true);


--
-- Name: telegram_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_groups telegram_groups_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_groups_service_all ON public.telegram_groups TO service_role USING (true) WITH CHECK (true);


--
-- Name: telegram_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_subscriptions telegram_subscriptions_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_subscriptions_service_all ON public.telegram_subscriptions TO service_role USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--



create unique index if not exists telegram_subscriptions_payment_tx_hash_uniq on public.telegram_subscriptions (payment_tx_hash) where payment_tx_hash is not null;
