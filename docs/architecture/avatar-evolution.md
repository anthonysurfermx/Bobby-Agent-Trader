# Bobby Avatar Evolution Architecture

Status: proposed architecture  
Owners: Bobby product + backend + iOS  
Reviewed with: Codex and Kimi K3 CLI  
Last updated: 2026-08-23

## 1. Product decision

Bobby's avatar evolves when the user demonstrates better financial behavior.
It must never evolve because the user deposits more, trades more, uses more
leverage, generates more volume, or makes more profit.

The system borrows Opal's useful pattern: a persistent visual object becomes a
record of healthy behavior. For Bobby, the healthy behavior is financial
clarity, skepticism, restraint, and accountability.

The selected companion and its evolution are separate concepts:

- `companion_id`: the character the user selected (`bobby`, `byte`, `flux`,
  `glitch`, `halo`, `momo`, `rook`, `zip`, `kora`, or `axiom`).
- `evolution_tier`: how that same character has changed through useful use.
- `specialist_unlocks`: access to pipeline characters and their product
  moments. Glitch, Halo, and Axiom retain their canonical roles and are not
  generic levels.
- `skin_id`: a cosmetic treatment such as `default`, `cdmx`, `nyc`, or
  `seoul`.

Canonical role labels:

- `GLITCH · RED TEAM`
- `HALO · RISK GATE`
- `AXIOM · TRACK RECORD`
- `BOBBY ORB`

All companions see the same data. Companion selection changes tone,
presentation, and motion language, never analysis quality.

## 2. Verified current state

### Web

- `src/lib/mascot.ts` contains a registry for all ten companions.
- `src/components/kinetic/mascot3d/MascotScene.ts` already provides the charm
  layer: hover, pointer tracking, squash-and-stretch, blinking, and
  voice-reactive movement.
- The registry references `/public/mascots/*.glb`, but no GLB files currently
  exist.
- PNG thumbnails exist for all ten companions in `public/mascots/`.
- `agent_profiles.mascot` is already accepted by `api/agent-setup.ts` and is
  sanitized server-side.

### iOS

- The SwiftUI app lives in `.claude/worktrees/bobby-ios/ios/Bobby`.
- `BobbyOrb.swift` is a performant 2D procedural renderer using gradients,
  particles, orbital paths, and audio level.
- `AgentProfile` and `DeskMemory` persist locally with `UserDefaults`.
- There is no Supabase identity, remote progression state, RealityKit scene,
  GLB/USDZ renderer, or progression domain yet.

### Backend

- Vercel serverless endpoints and Supabase are the established backend shape.
- `agent_events` is an operational/audit ledger for the finance harness. It
  should be referenced by progression events but not overloaded as the
  progression ledger.
- Existing migrations demonstrate partial unique idempotency indexes and
  state-version patterns.
- There is no avatar XP, evolution, achievement, or unlock schema yet.

## 3. Experience model

### Evolution tiers

The tier names are user-facing. Numeric levels may exist internally but should
not dominate the UI.

| Tier | Name | Visual change | Behavioral meaning |
| --- | --- | --- | --- |
| 0 | Core | Clean base silhouette | Bobby has just met the user |
| 1 | Pulse | Eyes, core light, and idle motion intensify | User is exploring consistently |
| 2 | Spectrum | Aura, particles, and one signature accessory appear | User reads opposing views |
| 3 | Synced | Character gains richer state reactions and role effects | User practices risk discipline |
| 4 | Proven | Ledger marks, advanced aura, and regional skin slot unlock | User reviews outcomes honestly |

Progress never decays and characters are never demoted. A missed day can reset
a streak, but it cannot remove an earned visual form.

### Four mastery dimensions

Evolution cannot be unlocked with one repeated action. Each tier requires a
minimum total score and minimum progress across multiple dimensions.

1. `curiosity`: asks, research, and financial learning.
2. `skepticism`: reading the Red Team and challenging a thesis.
3. `discipline`: reviewing the risk gate, accepting limits, and respecting a
   no-trade verdict.
4. `accountability`: revisiting previous calls and reviewing outcomes.

Example tier gate:

```ts
interface TierGate {
  tier: 0 | 1 | 2 | 3 | 4;
  minEnergy: number;
  minMastery: Partial<Record<MasteryDimension, number>>;
  requiredAchievements?: string[];
}

const TIER_GATES_V1: TierGate[] = [
  { tier: 0, minEnergy: 0, minMastery: {} },
  { tier: 1, minEnergy: 100, minMastery: { curiosity: 30 } },
  { tier: 2, minEnergy: 350, minMastery: { curiosity: 80, skepticism: 60 } },
  { tier: 3, minEnergy: 900, minMastery: { skepticism: 140, discipline: 160 } },
  {
    tier: 4,
    minEnergy: 1800,
    minMastery: { curiosity: 180, skepticism: 220, discipline: 260, accountability: 200 },
    requiredAchievements: ['first_full_review'],
  },
];
```

Numbers are placeholders until telemetry validates the expected time to each
tier. Shipped policies are immutable; tuning creates a new policy version.

## 4. Event model

### Closed event taxonomy

The server accepts a closed, versioned set of events. Each event declares its
source of truth, award, cooldown, cap, dedupe strategy, and mastery dimension.

```ts
type AvatarEventType =
  | 'intel_opened'
  | 'explainer_completed'
  | 'debate_completed'
  | 'red_team_reviewed'
  | 'risk_gate_reviewed'
  | 'no_trade_respected'
  | 'cooldown_respected'
  | 'thesis_saved'
  | 'thesis_revisited'
  | 'outcome_reviewed'
  | 'weekly_review_completed';

type EventAuthority = 'client_proposed' | 'server_verified';

interface AvatarBehaviorEvent {
  clientEventId: string;
  type: AvatarEventType;
  occurredAt: string;
  source: 'ios' | 'web' | 'telegram' | 'server';
  sessionId?: string;
  subjectRef?: string;
  payload: Record<string, unknown>;
}
```

### V1 awards

| Event | Authority | Dimension | Guardrail |
| --- | --- | --- | --- |
| `intel_opened` | Client proposed | Curiosity | Once per distinct snapshot; low value |
| `explainer_completed` | Client proposed | Curiosity | Minimum dwell; daily cap |
| `debate_completed` | Server verified where possible | Curiosity | Once per debate |
| `red_team_reviewed` | Client proposed + debate reference | Skepticism | Once per debate; minimum dwell |
| `risk_gate_reviewed` | Server verified where possible | Discipline | Once per verdict |
| `no_trade_respected` | Server verified | Discipline | Requires a `NO_TRADE` verdict and no execution attempt during its horizon |
| `cooldown_respected` | Server verified | Discipline | Awarded after the cooldown completes |
| `thesis_saved` | Client proposed | Accountability | Daily cap; no financial amount stored |
| `thesis_revisited` | Server verified | Accountability | Requires elapsed review horizon |
| `outcome_reviewed` | Server verified | Accountability | References an existing commitment/outcome |
| `weekly_review_completed` | Server verified | Accountability | Once per ISO week |

### Forbidden incentives

The progression policy must reject any proposed award based on:

- deposit size;
- account balance;
- trade notional or volume;
- trade frequency;
- leverage;
- realized or unrealized PnL;
- win rate;
- referrals tied to financial activity.

The payload validator rejects financial-value fields in progression events.
The raw finance pipeline remains in its existing authorized tables; the
progression ledger stores only references and behavior metadata.

```ts
const FORBIDDEN_PROGRESSION_KEYS = new Set([
  'amount',
  'amount_usd',
  'balance',
  'deposit',
  'leverage',
  'notional',
  'pnl',
  'profit',
  'volume',
  'win_rate',
]);
```

### Anti-gaming rules

- The server is the only authority that awards energy or mastery.
- High-value events are emitted by the backend, not claimed by the client.
- Every client event has an idempotency key.
- Event types have cooldowns, daily/weekly caps, and distinct-subject dedupe.
- Client timestamps must be within the accepted offline window.
- Replayed, capped, and rejected events remain auditable with zero award.
- Tier gates require multiple mastery dimensions.
- New accounts use the same rules; farming is made economically pointless by
  caps rather than invasive device fingerprinting.
- Journal content stays on-device. Only completion metadata may be submitted.

## 5. Identity decision

Progression requires one stable subject across iOS, web, and a later wallet
link.

Recommended flow:

1. Start iOS with a Supabase anonymous user so progress has a real
   `auth.users.id` immediately.
2. Upgrade the same account with Sign in with Apple.
3. Link wallet addresses through a separate verified `user_wallets` relation.
4. Never create progression rows keyed directly by wallet address.

This avoids three parallel identities: anonymous device, Apple account, and
wallet. The local device identifier is not the source of truth.

## 6. Data architecture

### `avatar_events`

Append-only source of truth. Rejected and capped attempts remain recorded so
support and abuse decisions are explainable.

```sql
create table avatar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_event_id text,
  event_type text not null,
  source text not null check (source in ('ios', 'web', 'telegram', 'server')),
  authority text not null check (authority in ('client_proposed', 'server_verified')),
  subject_ref text,
  dedupe_key text,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}',
  decision text not null check (decision in ('awarded', 'capped', 'rejected')),
  reason text,
  energy_awarded integer not null default 0 check (energy_awarded >= 0),
  mastery_awarded jsonb not null default '{}',
  policy_version text not null,
  created_at timestamptz not null default now()
);

create unique index avatar_events_client_id_uidx
  on avatar_events(user_id, client_event_id)
  where client_event_id is not null;

create unique index avatar_events_dedupe_uidx
  on avatar_events(user_id, event_type, dedupe_key)
  where dedupe_key is not null and decision = 'awarded';

create index avatar_events_user_created_idx
  on avatar_events(user_id, created_at desc);
```

### `avatar_progression`

Hot snapshot derived from the ledger.

```sql
create table avatar_progression (
  user_id uuid primary key references auth.users(id) on delete cascade,
  companion_id text not null default 'bobby',
  evolution_tier smallint not null default 0 check (evolution_tier between 0 and 4),
  energy_total integer not null default 0 check (energy_total >= 0),
  mastery jsonb not null default '{
    "curiosity": 0,
    "skepticism": 0,
    "discipline": 0,
    "accountability": 0
  }',
  active_skin text not null default 'default',
  policy_version text not null default 'avatar-xp-v1',
  state_version bigint not null default 1,
  updated_at timestamptz not null default now()
);
```

### `avatar_unlocks`

```sql
create table avatar_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  unlock_id text not null,
  unlock_type text not null check (unlock_type in ('companion', 'skin', 'effect', 'accessory', 'achievement')),
  source_event_id uuid references avatar_events(id),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, unlock_id)
);
```

### Security and transaction boundary

- RLS permits users to read only their own progression, events, and unlocks.
- Clients do not insert directly into these tables.
- A service-role Postgres RPC evaluates a batch, enforces caps, writes ledger
  rows, folds awards into the snapshot, evaluates tier gates, and creates
  unlocks in one transaction.
- The event ledger is append-only to application roles.
- A policy recompute job can rebuild snapshots without changing event history.

## 7. Backend structure

```text
api/
  avatar-events.ts          POST batched offline events
  avatar-state.ts           GET progression + unlocks + manifest version
  avatar-select.ts          POST selected unlocked companion/skin
  _lib/avatar/
    types.ts                shared domain types and closed enums
    policy-v1.ts            immutable award and tier policy
    validate-event.ts       per-event payload validation
    forbidden-signals.ts    finance incentive guardrail
    manifest.ts             canonical visual manifest
    award.ts                RPC adapter and response mapping
```

### Endpoints

`POST /api/avatar-events`

- Supabase JWT required.
- Accepts at most 20 events.
- Validates shape, timestamp, payload, and event authority.
- Calls one transactional RPC.
- Returns per-event decisions plus the fresh authoritative state.

`GET /api/avatar-state`

- Supabase JWT required.
- Returns progression, mastery, unlocks, current policy version, and visual
  manifest version.
- The client may use cached state while offline.

`POST /api/avatar-select`

- Supabase JWT required.
- Allows selection only from unlocked companions/skins.
- Changes presentation only; it cannot change model output or risk rules.

### Server-verified integration

Existing finance endpoints emit trusted behavior events after their own
transaction succeeds. They never trust a duplicate client claim.

- Debate completion can emit `debate_completed`.
- Red Team replay can emit `red_team_reviewed` after the viewing condition.
- A risk-gate response can emit `risk_gate_reviewed`.
- A completed no-trade horizon can emit `no_trade_respected`.
- Track-record resolution can emit `outcome_reviewed`.

Each event may reference an `agent_events`, cycle, commitment, or verdict ID;
it does not duplicate the underlying finance payload.

## 8. Versioned visual manifest

Progression state must not depend on whether final 3D assets are ready. The
backend returns semantic visual state; each platform resolves the best asset it
can render.

```ts
interface AvatarManifest {
  manifestVersion: number;
  companions: Record<string, {
    label: string;
    roleLabel?: string;
    tiers: Record<number, {
      procedural: {
        palette: string;
        particleDensity: number;
        pulseRate: number;
        effects: string[];
      };
      assets?: {
        webGlb?: string;
        iosUsdz?: string;
        thumbnail?: string;
        integrity?: string;
      };
    }>;
  }>;
  skins: Record<string, {
    palette: string[];
    effect?: string;
    unlockId?: string;
  }>;
}
```

Important platform correction: web can consume GLB directly through the
existing Three.js loader. Native iOS should receive USDZ for RealityKit, not
assume GLB support. Both platforms use procedural fallback when an asset is
missing, incompatible, or fails integrity validation.

Animation semantics are platform-neutral:

```ts
type AvatarMotion =
  | 'idle'
  | 'listen'
  | 'analyze'
  | 'challenge'
  | 'no_trade'
  | 'record'
  | 'level_up';
```

Web maps them to `MascotScene` motion/effects. iOS maps them first to
`BobbyOrb` parameters and later to RealityKit animation resources. The backend
never sends frame-level animation instructions.

## 9. iOS architecture

```text
Sources/
  Avatar/
    AvatarStore.swift            authoritative UI state
    AvatarModels.swift           Codable API contracts
    AvatarManifest.swift         bundled fallback + remote merge
    AvatarOutbox.swift           retry-safe local event queue
    AvatarRenderer.swift         procedural/RealityKit selection
    ProceduralAvatarView.swift   evolution of BobbyOrb
    RealityAvatarView.swift      phase 3 USDZ renderer
  Auth/
    SessionStore.swift           anonymous -> Apple account upgrade
```

`AvatarStore` rules:

- Server state always wins.
- Client actions are queued with ULIDs and survive restarts.
- Offline UI says an action was recorded, not that energy was awarded.
- Flush occurs after an action, on foreground, and on network reconnect.
- Successful responses acknowledge individual event IDs.
- Invalid events are removed; retriable failures remain with exponential
  backoff.
- No level or tier calculation lives in Swift.

The current `BobbyOrb` is the correct phase-one renderer. Its tint, particle
count, ring count, pulse, and effects become manifest-driven. RealityKit and
USDZ arrive only after the progression loop is validated.

## 10. Regional skins

CDMX, NYC, and Seoul are cosmetic packs, not separate progression systems.

- `cdmx`: jade, warm gold, jacaranda-violet accent.
- `nyc`: electric blue, chrome, wet-neon reflection.
- `seoul`: ultraviolet, ice blue, holographic edge.

Skins may be unlocked by product milestones, launches, or non-financial
achievements. They never multiply awards or change finance behavior.

## 11. Observability

Minimum operational metrics:

- daily active progression users;
- award/cap/reject ratio by event type and app version;
- time to each evolution tier;
- mastery distribution at each tier;
- percentage of users who review Red Team and Risk Gate content;
- `NO_TRADE` respect rate;
- offline outbox age and batch size;
- manifest/asset fallback rate;
- progression RPC latency and conflict/error rate.

Every event decision has a machine reason such as `daily_cap`,
`duplicate_subject`, `invalid_timestamp`, `forbidden_signal`, or
`server_verification_required`.

## 12. Test gates

### Policy

- Awards and caps are deterministic.
- Forbidden financial fields always reject the award.
- One repeated behavior cannot satisfy multi-dimension tier gates.
- Shipped policy versions remain immutable.
- Recomputing a snapshot from the ledger produces the same state.

### Database/API

- Duplicate client IDs award once.
- Concurrent batches cannot exceed a cap.
- RLS prevents cross-user reads.
- Client attempts to claim server-verified events are rejected.
- Partial RPC failures roll back the whole batch.

### iOS

- Anonymous state upgrades to Apple identity without losing progression.
- Offline events survive process death and sync once.
- Server state reconciles optimistic UI safely.
- Missing or invalid USDZ falls back to procedural rendering.
- Reduced Motion disables parallax, squash, and intense particle effects.

### Web

- Missing GLB falls back to the existing procedural mascot.
- The same manifest state produces equivalent companion/tier/skin semantics.
- Asset disposal remains leak-free across companion changes.

## 13. Rollout

### Phase 0 — contract and identity

- Freeze event taxonomy and policy v1.
- Add anonymous Supabase auth and Apple upgrade path to iOS.
- Add schema, transactional RPC, API endpoints, and feature flags.
- Make `BobbyOrb` manifest-driven.

### Phase 1 — behavior loop

- Launch Bobby Orb with Core, Pulse, and Spectrum tiers.
- Activate Glitch, Halo, and Axiom as pipeline specialists.
- Ship the signature `NO_TRADE` Halo moment.
- Add the Axiom outcome-review card.

### Phase 2 — complete evolution

- Enable Synced and Proven tiers.
- Add server-verified restraint and track-record events.
- Add the companion gallery and useful-behavior unlocks.

### Phase 3 — 3D and regional identity

- Add validated GLB assets to web and USDZ counterparts to iOS.
- Ship CDMX first, then NYC and Seoul skins.
- Add richer semantic emotes without changing the progression schema.

## 14. Non-negotiable decisions

1. The avatar rewards better process, never financial activity or outcomes.
2. Companion identity, evolution tier, specialist role, and skin remain
   separate domain concepts.
3. The server awards all progression through an append-only ledger.
4. Progression survives retries, offline use, and policy recomputation.
5. Art assets are replaceable data; missing 3D never blocks the product.
6. All platforms consume the same semantic manifest.
7. Users can inspect why an event was awarded, capped, or rejected.
8. The system launches behind feature flags and can be disabled without
   affecting the finance pipeline.

## References

- Opal milestones: https://www.opal.so/
- Opal product design evolution: https://www.opal.so/blog/designing-for-wellbeing
- Current Bobby character bible: `docs/brand/bobby-character-bible.md`
