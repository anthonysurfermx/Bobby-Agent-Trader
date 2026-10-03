-- Where a subscription comes from (payments security audit 2026-10-02): written by api/_lib/revenuecat.ts and the
-- Stripe webhook. null = unknown (rows synced before). Same definition already applied to prod by
-- 20261002120000_admin_codex_review; idempotent here so this branch never depends on that one.
alter table public.bobby_subscriptions add column if not exists environment text check (environment in ('production', 'sandbox'));
alter table public.bobby_subscriptions add column if not exists period_type text check (period_type in ('normal', 'trial', 'intro', 'prepaid'));
