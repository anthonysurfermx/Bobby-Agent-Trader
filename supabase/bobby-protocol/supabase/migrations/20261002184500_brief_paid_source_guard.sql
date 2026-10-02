-- RevenueCat Web Billing and direct Stripe both mirror as provider=stripe. Keep their paid evidence distinct:
-- a RevenueCat webhook cannot authorize a separate direct Stripe subscription and vice versa.
create or replace function public.bobby_brief_is_paid_pro(p_identity uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1 from bobby_subscriptions s
      join bobby_identities i on i.id = s.identity_id and i.auth_user_id is not null
      join bobby_brief_paid_periods p on p.identity_id = s.identity_id
     where s.identity_id = p_identity and s.status = 'active'
       and s.current_period_end is not null and s.current_period_end > now()
       and p.provider = s.provider and p.product_id = s.product_id and p.period_end = s.current_period_end
       and p.period_start <= now() and p.period_end > now()
       and p.environment = 'production' and p.period_type in ('normal', 'intro') and p.paid_amount > 0
       and p.verification_state = 'confirmed' and p.verified_at <= now()
       and (
         (p.provider = 'apple' and p.proof_source = 'revenuecat')
         or (p.provider = 'stripe' and s.stripe_subscription_id is null and p.proof_source = 'revenuecat')
         or (p.provider = 'stripe' and s.stripe_subscription_id is not null and p.proof_source = 'stripe')
       )
  );
$$;

revoke all on function public.bobby_brief_is_paid_pro(uuid) from public, anon, authenticated;
grant execute on function public.bobby_brief_is_paid_pro(uuid) to service_role;
