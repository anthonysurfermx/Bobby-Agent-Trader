// ============================================================
// lots — FIFO lot accounting for spot swaps, in CHAIN order.
//
// This is the specification the SQL function bobby_match_fifo follows and
// the model the e2e's store double runs. Pure: no I/O.
//
// Rules:
//   · A BUY opens a lot (units, unitsRemaining) at its chain position
//     (block number, transaction index).
//   · A SELL realizes: it may only consume lots that sit EARLIER on-chain
//     than itself, oldest first, possibly partially. Receipts can arrive in
//     any order — the ledger of a (wallet, symbol) pair is REBUILT from the
//     raw rows after every receipt, never patched, so it always converges.
//   · Each consumed slice is a fill (lot, sell, units, buy price, sell
//     price). A lot whose units hit zero closes with the fill-weighted
//     exit (scoring only — money metrics read SELL rows and fills).
//   · A SELL's realization is derived from ITS fills: matched units, the
//     weighted buy cost as entry, its own price as exit. Units no earlier
//     lot covers stay unmatched (unitsRemaining on the sell).
// ============================================================

export interface ChainPos { blockNumber: number; txIndex: number }

export interface Lot extends ChainPos {
  id: string;
  units: number;
  unitsRemaining: number;
  entryPrice: number;
}

export interface Sell extends ChainPos {
  id: string;
  /** Total units sold on-chain. */
  units: number;
  /** Units not yet covered by an earlier lot. */
  unitsRemaining: number;
  /** USD per unit received. */
  sellPrice: number;
}

export interface Fill {
  lotId: string;
  sellId: string;
  units: number;
  buyPrice: number;
  sellPrice: number;
}

export interface LotClose { lotId: string; exitPrice: number; pnlPct: number; outcome: 'win' | 'loss' | 'break_even' }

export interface SellRealization {
  sellId: string;
  matchedUnits: number;
  unmatchedUnits: number;
  /** Weighted buy cost of the matched units; null when nothing matched. */
  entryPrice: number | null;
  pnlPct: number | null;
  outcome: LotClose['outcome'] | null;
}

export interface ReplayResult {
  /** EVERY fill of the pair after the rebuild (the store replaces, never appends). */
  fills: Fill[];
  /** All lots, units recomputed from scratch. */
  lots: Lot[];
  /** All sells, unmatched units recomputed from scratch. */
  sells: Sell[];
  /** Lots fully consumed after the rebuild. */
  closed: LotClose[];
  /** Realization state of every sell after the rebuild. */
  realizations: SellRealization[];
}

const EPS = 1e-12;

export function outcomeFor(pnlPct: number): LotClose['outcome'] {
  return Math.abs(pnlPct) < 1 ? 'break_even' : pnlPct > 0 ? 'win' : 'loss';
}

export function byChain<T extends ChainPos>(a: T, b: T): number {
  return a.blockNumber - b.blockNumber || a.txIndex - b.txIndex;
}

export function earlier(a: ChainPos, b: ChainPos): boolean {
  return a.blockNumber < b.blockNumber || (a.blockNumber === b.blockNumber && a.txIndex < b.txIndex);
}

/**
 * Deterministic REBUILD over one (wallet, symbol): forgets every previous
 * fill, restores every lot and sell to its on-chain units, then walks the
 * sells in chain order and lets each consume the lots that sit earlier
 * on-chain, oldest first. Same input rows → same fills, whatever order the
 * receipts were recorded in. (bobby_match_fifo in the migration does this.)
 */
export function replayFifo(lotsIn: Lot[], sellsIn: Sell[]): ReplayResult {
  const lots = lotsIn.map((l) => ({ ...l, unitsRemaining: l.units })).sort(byChain);
  const sells = sellsIn.map((s) => ({ ...s, unitsRemaining: s.units })).sort(byChain);
  const fills: Fill[] = [];
  const closed: LotClose[] = [];
  for (const sell of sells) {
    for (const lot of lots) {
      if (sell.unitsRemaining <= EPS) break;
      if (lot.unitsRemaining <= EPS || !earlier(lot, sell)) continue;
      const take = Math.min(lot.unitsRemaining, sell.unitsRemaining);
      fills.push({ lotId: lot.id, sellId: sell.id, units: take, buyPrice: lot.entryPrice, sellPrice: sell.sellPrice });
      lot.unitsRemaining -= take;
      sell.unitsRemaining -= take;
      if (lot.unitsRemaining <= EPS) {
        lot.unitsRemaining = 0;
        const own = fills.filter((f) => f.lotId === lot.id);
        const units = own.reduce((s, f) => s + f.units, 0);
        const exitPrice = units > 0 ? own.reduce((s, f) => s + f.units * f.sellPrice, 0) / units : sell.sellPrice;
        const pnlPct = ((exitPrice - lot.entryPrice) / lot.entryPrice) * 100;
        closed.push({ lotId: lot.id, exitPrice, pnlPct, outcome: outcomeFor(pnlPct) });
      }
    }
    if (sell.unitsRemaining <= EPS) sell.unitsRemaining = 0;
  }
  const realizations: SellRealization[] = sells.map((sell) => {
    const own = fills.filter((f) => f.sellId === sell.id);
    const matchedUnits = own.reduce((s, f) => s + f.units, 0);
    const entryPrice = matchedUnits > 0 ? own.reduce((s, f) => s + f.units * f.buyPrice, 0) / matchedUnits : null;
    const pnlPct = entryPrice ? ((sell.sellPrice - entryPrice) / entryPrice) * 100 : null;
    return { sellId: sell.id, matchedUnits, unmatchedUnits: Math.max(0, sell.units - matchedUnits), entryPrice, pnlPct, outcome: pnlPct === null ? null : outcomeFor(pnlPct) };
  });
  return { fills, lots, sells, closed, realizations };
}
