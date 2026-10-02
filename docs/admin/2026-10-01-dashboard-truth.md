# /admin — what every number means and how to check it (2026-10-01)

Response to the funnel audit of 2026-10-01 (Codex): the dashboard now separates what was **observed** from what
was **rebuilt**, leaves the **team's own traffic out** by default, records **desk outcomes on the server** for
every client, and adds a deterministic **diagnosis** ("Dónde mejorar"). Everything below can be reproduced with
the SQL functions named in each row (Supabase project `qbvdqkknnuweatptjohi`, service role).

## Populations

| Term | Definition | Source |
|---|---|---|
| Install (instalación) | A salted hash of the browser/app install id (`x-bobby-device`). Not a human. | `bobby_devices` |
| Observed install | Seen arriving: an event at its first sighting, or first seen after 2026-10-01 20:45 UTC (desk/app touch on open). Only these form cohorts. | `bobby_devices.source = 'observed'` |
| Rebuilt install | Created from its reads before measurement existed; its "first seen" is its first read. Shown apart as history, never in a cohort. | `source = 'backfill'` |
| Person | An Apple/Google account (with the installs paired to it) or an install never paired with an account. Wallet-only identities are not people. | `bobby_admin_people_facts()` |
| Internal (equipo) | Admins (`bobby_admins`), accounts marked by hand (`bobby_internal_marks`), accounts whose email is in the setting `internal_emails`, installs that opened `/admin`, installs paired with any of those accounts, installs seen from a network an admin used (`bobby_internal_networks`, salted /24 or /48 hash — no IP stored). | `bobby_identity_internal()`, `bobby_device_internal()` |

The header switch **Sin equipo / Con equipo** passes `p_internal` to every function. Default: out.

## Funnel (cohort of the selected period)

`bobby_admin_growth(days, internal) -> cohorts.web / cohorts.ios`, nested (each step ⊆ the previous):

- **Llegaron / Abrieron la app**: observed installs first seen in the period.
- **Abrieron el desk**: a `/desk` visit or a read (web).
- **1.ª lectura**: the install's first read at or after its first sighting (`bobby_devices.first_read_at`).
- **Cuenta después de leer**: paired with an Apple/Google account (`bobby_device_accounts.first_at`) after arriving, and read.
- **Pro**: that account has Pro today (paid, trial or gift).
- Side steps: 2+/3 reads, **muro de registro** (`wall_signin`: a guest asked for a 4th read), account after the wall, sign-in started.
- **Retention** (exact UTC day after the first sighting): D1, D7, week 1 (days 1–7); *eligible* only when that day has ended; *volvió a abrir* = any activity day, *volvió a leer* = a read that day (`bobby_activity_days`).

## Desk outcomes (server-side, all clients)

`bobby_events` with `surface = 'desk'`: `read_done` (answer delivered; `detail` = level), `read_failed`
(`detail` = provider_http / output_rejected / analysis_error / left), `wall_signin`, `wall_paywall`,
`wall_level` (`detail` = level-code), `desk_blocked` (budget_paused / premium_paused / daily_limit / unavailable).
Recorded from the deploy of this change on; before that the dashboard says "se registra desde el próximo deploy".

## Diagnosis

`api/_lib/admin-insights.ts` — deterministic rules over the same JSON the dashboard shows; each finding carries its
evidence and sample (`n`), and a percentage is never stated on a base under 5. The daily email
(`/api/admin?cron=digest`, 13:00 UTC) sends only findings not sent in 7 days, plus a Monday summary. "Plan de la
semana" asks Claude Sonnet 5.5 to order the findings; a priority that cites no existing finding is dropped.

## Reproduce the headline numbers

```sql
select bobby_admin_growth(30, false) -> 'people';             -- personas, etapas, excluidos
select bobby_admin_growth(30, false) -> 'cohorts' -> 'web';   -- embudo web observado
select bobby_admin_growth(30, false) -> 'history';            -- instalaciones reconstruidas
select bobby_admin_overview(30, false) -> 'activity';         -- lecturas sin el equipo, activación medida
select count(*) from bobby_reads where created_at >= date_trunc('day', now()) - interval '29 days'
  and not bobby_traffic_internal(identity_id, device_hash);   -- = activity.reads
select * from bobby_admin_device_facts() order by first_seen desc;  -- every install, step by step
```

## Known limits (stated in the UI)

- iOS builds before 1.5 (43) send no install id: App Store downloads > installs seen.
- iOS reports no page visits or paywall views (server outcomes cover reads and walls).
- The LLM ledger covers the desk (and surfaces that call `logLlmUsage`); TTS/Realtime spend is not in it yet.
- No purchase event has ever arrived: revenue $0 cannot tell "no sales" from "webhook not delivering".
- Network exclusion on mobile carriers can catch other people on the same /24: remove a network in Usuarios → Tráfico interno.

## Amplitude (server-side export, 2026-10-02)

- `/api/admin?cron=amplitude` runs every 15 minutes and does nothing until `AMPLITUDE_API_KEY` is set in Vercel (`AMPLITUDE_REGION=eu` for an EU project).
- It sends `bobby_events` after the cursor `bobby_admin_settings.amplitude_cursor` through `bobby_amplitude_batch`. The team's traffic is left out with the same sets the dashboard uses, and events younger than 10 minutes wait.
- Each event carries the salted install hash as `device_id`, the account uuid as `user_id`, the event, surface, referring host, utm_source, country/region and detail.
- It never sends an IP, email, user agent or question. `insert_id = bobby-<id>`, so a retried batch does not duplicate.
- `/api/track` drops crawlers and headless browsers (`isBotUserAgent`) before storing anything, so bots never reach the dashboard or Amplitude.
