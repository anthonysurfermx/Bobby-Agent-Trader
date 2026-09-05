// ============================================================
// Trader Land seasons — a rotating collection earned by REVIEWED theses that
// were EXECUTED on Base (read → plan → swap in the thesis' direction →
// review). Never by counting transactions: one swap executes one thesis,
// one executed review earns one piece, in a fixed order that is visible from
// the first day (SYSTEM-DESIGN v0.2 §6: transparent sequences, no odds).
//
// Season I reuses six catalog pieces that are not on the Discovery Route, so
// it ships without new art; a dedicated on-chain district needs its own lots
// first. Moving this table into tl_items (season, season_index) is the step
// that lets a season change without a deploy.
// ============================================================

export interface Season {
  id: string;
  name: { en: string; es: string };
  rule: { en: string; es: string };
  /** catalog ids in the order they are earned */
  pieces: readonly string[];
}

export const SEASON: Season = {
  id: 'onchain_s1',
  name: { en: 'On-chain Season I', es: 'Temporada On-chain I' },
  rule: {
    en: 'A thesis you executed on Base and came back to review earns the next piece. Swaps without a thesis earn nothing.',
    es: 'Cada tesis que ejecutas en Base y vuelves a revisar gana la siguiente pieza. Los swaps sin tesis no cuentan.',
  },
  pieces: [
    'crypto_bay_candle_tower',
    'evidence_mines_evidence_workshop',
    'risk_reef_red_team_observatory',
    'axiom_archive_lit_archive',
    'thesis_citadel_three_gate_citadel',
    'axiom_archive_base_ring_seal',
  ],
};

export interface SeasonProgress {
  id: string;
  name: Season['name'];
  rule: Season['rule'];
  total: number;
  earned: number;
  /** pieces already earned, in season order */
  owned: string[];
  /** the piece the next executed review earns, null when the season is complete */
  next: string | null;
  complete: boolean;
}

/** Where an identity stands in the season, from its inventory alone (pieces earned by the season carry source 'season'). */
export function seasonProgress(inventory: Array<{ item_id: string; source: string }>, season: Season = SEASON): SeasonProgress {
  const held = new Set(inventory.filter((row) => row.source === 'season').map((row) => row.item_id));
  const owned = season.pieces.filter((id) => held.has(id));
  const next = season.pieces.find((id) => !held.has(id)) ?? null;
  return { id: season.id, name: season.name, rule: season.rule, total: season.pieces.length, earned: owned.length, owned, next, complete: next === null };
}
