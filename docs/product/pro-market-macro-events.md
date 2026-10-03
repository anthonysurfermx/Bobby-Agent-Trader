# Exceptional macro briefings — inactive design and pure planner

Status (2 October 2026): local qualification/planning module and finite fixture tests only. **No event ingestion,
polling job, SQL migration, paid provider work, push delivery or native opt-in is wired.**

The user's current product direction is one periodic weekly report on **Monday at 08:00 America/New_York**, plus
exceptional important macroeconomic events. Daily and market-close reports are excluded. An exceptional event is
independent of the weekly period: completing Monday's report must not suppress a later qualifying event, and an
event must not create daily report generation. The weekly implementation is owned by the separate schedule change.

## Proposed first qualifying case

A confirmed change to the **Fed federal-funds target range**, compared with the previous verified official FOMC
decision. Rates use integer basis points; do not confuse the target range with effective funds rate, IORB, market
expectations, dissenting votes, forecasts, or routine price movement. Qualifying policy is **proposed**, not a claim
that the user has approved every threshold or every macroeconomic event category.

Verification performed for this design on 2 October 2026:

- The Fed's [official RSS directory](https://www.federalreserve.gov/feeds/feeds.htm) links the Monetary Policy feed
  `https://www.federalreserve.gov/feeds/press_monetary.xml`. RSS is discovery metadata, not confirmation of a change.
  The web reader could not render the XML content; no automated feed parser or live ingestion was validated.
- The [31 July 2024 official statement](https://www.federalreserve.gov/newsevents/pressreleases/monetary20240731a.htm)
  retained the range at 5.25–5.50%. The [18 September 2024 official statement](https://www.federalreserve.gov/newsevents/pressreleases/monetary20240918a.htm)
  reduced it to 4.75–5.00%. These are historical test fixtures, not a current-rate assertion or live event signal.

The future source adapter must fetch only allowlisted HTTPS Fed URLs with bounded response bytes, timeout and
redirect checks. Persist the source URL, release timestamp, retrieved timestamp, raw-document SHA-256 and extraction
version; confirm the document really is an FOMC statement and verify its decision/range. Seed the latest confirmed
prior decision through an explicitly reviewed baseline and preserve the confirmed sequence, including unchanged
decisions. Do not jump over a missed decision. A feed headline, a matching hostname or the caller's `verification`
field alone is **not proof**. The pure planner validates an already reviewed evidence envelope; it cannot establish
network origin or validate a cryptographic hash against a document it never receives.

Reject rumors, scheduled meetings without their released statement, ordinary asset prices, unchanged ranges,
missing/unverified source data and missing prior confirmed range. Conflicting action/range, changed range width,
future timestamps or incomplete accounting require review. An authoritative correction updates the existing event;
it does not send a second alert automatically. Retractions need a separate approved correction policy.

## Local planner contract

`api/_lib/briefings/macro-events.ts` exports `macroPolicy`, `macroPollingAllowed` and `planMacroEvent`.

- Imports have no side effects; env, timestamps, baseline, dedupe history and accounting are injected.
- `BOBBY_BRIEFINGS_MACRO_ENABLED` is **off by default**. Setting it to `on` alone does not approve rollout, source
  adapter or the proposed criteria/caps. A future poller additionally needs explicit polling approval. No cron was added.
- Results are `no-op`, `review-required` or `eligible-dry-run`. There is no live mode or send method.
- Event key: `macro:fed-target-range:<official document publication id>`, stable across body-hash corrections.
  It shares no identity with a weekly period. `eligible-dry-run` is a proposal, not a durable event reservation.
- Monetary estimates are supplied upper reservations for all shared attempts, not measured cost. A complete durable
  seven-day event history and UTC day/month exposure are prerequisites; unavailable accounting requires review.

Proposed finite limits (not approved product thresholds or measured capacity): one event per rolling 24 hours,
two per rolling seven days, 120-minute event expiry; shared total exposure ceilings $0.25/event, $1/UTC day,
$5/UTC month. Future polling: at most once per 15 minutes, ten feed items inspected, two fetches (one feed plus one
new document) per invocation, finite timeouts/bytes and exponential backoff. Disable polling entirely when the macro
flag/approvals are absent. The pure module does not implement any polling, reservations, provider work or enforcement
across concurrent processes. Approve and measure these values before deployment.

## Durable integration still required

Proposed additive tables, names subject to schema review:

| Object | Required behavior |
|---|---|
| `bobby_macro_source_documents` | Immutable source revisions keyed by official publication id + hash; verified release time, extraction provenance and raw-evidence retention. |
| `bobby_macro_rate_baselines` | Verified sequence of prior target ranges; compare-and-swap source advancement to prevent missed/out-of-order decisions. |
| `bobby_macro_events` | Unique semantic `event_key`, criteria version, before/after ranges, evidence references, review/eligible/withdrawn state, expiry and fenced preparation lease. |
| `bobby_macro_shared_reports` | One shared report per `(event_key, language)`; no LLM call per user, no names/account memory in provider prompts; immutable versioned evidence. |
| Account event reports | Owner + event key uniqueness; current Pro, explicit macro opt-in and consent checked before preparing and exposing content. Cascade private rows on account deletion. |
| Macro delivery outbox | Unique `(event_key, installation_id)`, owner + device binding revision, source/report version, generic payload, expiry, bounded retries and fenced claim/commit. |

Reserve event frequency, all shared monetary exposure and provider slots **atomically** before paid work. Do not rely
on the planner's snapshot to enforce concurrent caps. Coordinate global product budgets with weekly/Desk spending;
do not describe a best-effort ledger as a hard total ceiling. Resolve unknown provider charges without unapproved
blind retries. Retain event identity/dedupe tombstones independently of report/audio retention.

Reuse verified Supabase session → server-derived identity and feature-specific `bobby_brief_is_paid_pro` authorization.
This requires an active known-expiry subscription matched to confirmed positive-paid production/nontrial period
evidence in `bobby_brief_paid_periods`. Referral/admin grants, free/guest accounts, trial/Sandbox and missing evidence
are excluded; no extra charge is added. The billing adapter that writes real verified paid-period evidence remains
pending, so this local gate must not be presented as activated. Existing service-role
queries require explicit owner filtering; exposed tables require RLS and client grants revoked. Use the approved
installation proof/binding revision model, after fixing atomic credential receipt recovery. Do not overload weekly
cadence SQL/period keys or fabricate a new enum without migrating all readers and writers.

Profile needs a distinct **important macro events** opt-in, separate from weekly selection and iOS notification
permission. Default it off until the user chooses it. Weekly alone does not consent to exceptional alerts. Preserve
that preference when permission is denied and show Settings recovery. Generic approved push body remains
**“Bobby tiene tu resumen de mercado listo”**; lock-screen payload carries no name, symbols or rates. Tap resolves an
owned Pro event report; account changes clear any prior account's queued event/audio. Shared report synthesis/audio
must use finite work and private authenticated playback, with revocation and deletion hooks.

## Verification and rollout gates

Run the finite pure suite from this worktree:

```sh
node --import tsx scripts/test-briefings-macro.mts
```

It covers confirmed historical change, unchanged range, rumors, routine prices, absent/tampered provenance,
baseline/action/range errors, source corrections, weekly-independent dedupe, expiry, frequency limits, unavailable
accounting, monetary limits and default-off polling gates. It sends no traffic and does not validate real ingestion,
concurrent SQL reservations, paid synthesis, APNs or iPhone behavior.

Before activating: approve criteria/limits and privacy copy; implement/review the bounded source adapter and durable
schema; prove baseline continuity, ingestion replay/out-of-order/correction handling, transactional dedupe and cost
reservations, owner/Pro/opt-in checks, device rebind and revocation; stage one real primary-source sample with measured
cost; verify event push and tap/audio/account switch on a physical iPhone. Activation, migration, credentials, deploy
and real notifications remain separate authorized actions. The present files establish none of those outcomes.
