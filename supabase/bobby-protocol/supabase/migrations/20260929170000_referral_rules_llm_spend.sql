-- Codex review of PR #103 (2026-09-29):
--   · a friend counts only for a NEW Apple/Google account: the date is auth.users.created_at (the real
--     account), not the Bobby identity's, and the account must have an apple/google identity;
--   · days given to an inviter who already pays accrue after the paid period, not on top of it;
--   · a pair lock, so two friends claiming each other at the same moment cannot both be rewarded;
--   · bobby_llm_spend(): today's and this month's desk spend from the ledger, for the spend guard.
-- Service role only, like every function of 20260929150000.

create or replace function public.bobby_referral_claim(p_invitee uuid, p_code text, p_reward_days int, p_max int, p_new_account_days int)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare inviter uuid; invitee_auth uuid; account_created timestamptz; accepted int; paid_until timestamptz;
begin
  if p_invitee is null or p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{8}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_code');
  end if;
  select identity_id into inviter from bobby_referral_codes where code = p_code;
  if inviter is null then return jsonb_build_object('ok', false, 'code', 'invalid_code'); end if;
  if inviter = p_invitee then return jsonb_build_object('ok', false, 'code', 'self'); end if;
  if not exists (select 1 from bobby_identities where id = p_invitee) then
    return jsonb_build_object('ok', false, 'code', 'invalid_invitee');
  end if;
  select auth_user_id into invitee_auth from bobby_identities where id = p_invitee;
  -- A wallet-only session is not an account yet: the client keeps the code for the Apple/Google sign-in.
  if invitee_auth is null or not exists (
    select 1 from auth.identities i where i.user_id = invitee_auth and i.provider in ('apple', 'google')
  ) then
    return jsonb_build_object('ok', false, 'code', 'account_required');
  end if;
  select u.created_at into account_created from auth.users u where u.id = invitee_auth;
  if account_created is null or account_created < now() - make_interval(days => greatest(p_new_account_days, 1)) then
    return jsonb_build_object('ok', false, 'code', 'not_new');
  end if;
  -- One claim per pair at a time, so A→B and B→A racing cannot both pass the two-way check; then the
  -- inviter's lock bounds the five slots. Always pair first, inviter second: no lock cycle.
  perform pg_advisory_xact_lock(hashtext('bobby_referral_pair:' || least(inviter, p_invitee)::text || greatest(inviter, p_invitee)::text));
  if exists (select 1 from bobby_referrals where invitee_id = p_invitee) then
    return jsonb_build_object('ok', false, 'code', 'already_claimed');
  end if;
  if exists (select 1 from bobby_referrals where inviter_id = p_invitee and invitee_id = inviter) then
    return jsonb_build_object('ok', false, 'code', 'self');
  end if;
  perform pg_advisory_xact_lock(hashtext('bobby_referral:' || inviter::text));
  select count(*) into accepted from bobby_referrals where inviter_id = inviter;
  if accepted >= greatest(p_max, 0) then return jsonb_build_object('ok', false, 'code', 'inviter_full'); end if;
  begin
    insert into bobby_referrals(inviter_id, invitee_id, reward_days) values (inviter, p_invitee, p_reward_days);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'already_claimed');
  end;
  if p_reward_days > 0 then
    -- A paying inviter's gift starts when the paid period ends.
    select max(s.current_period_end) into paid_until from bobby_subscriptions s
      where s.identity_id = inviter and s.status in ('active', 'trialing') and s.current_period_end > now();
    insert into bobby_pro_grants(identity_id, pro_until, source)
      values (inviter, greatest(now(), coalesce(paid_until, now())) + make_interval(days => p_reward_days), 'referral')
      on conflict (identity_id) do update
        set pro_until = greatest(bobby_pro_grants.pro_until, now(), coalesce(paid_until, now())) + make_interval(days => p_reward_days),
            updated_at = now();
  end if;
  return jsonb_build_object('ok', true, 'code', 'claimed', 'inviterAccepted', accepted + 1);
end;
$$;

create or replace function public.bobby_llm_spend()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'day', coalesce(sum(usd) filter (where created_at >= date_trunc('day', now())), 0),
    'month', coalesce(sum(usd), 0))
  from bobby_llm_usage where created_at >= date_trunc('month', now());
$$;

revoke all on function public.bobby_referral_claim(uuid, text, int, int, int) from public, anon, authenticated;
revoke all on function public.bobby_llm_spend() from public, anon, authenticated;
grant execute on function public.bobby_referral_claim(uuid, text, int, int, int) to service_role;
grant execute on function public.bobby_llm_spend() to service_role;
