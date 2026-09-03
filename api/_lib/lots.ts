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
//     any order — replaying the whole (wallet, symbol) ledger from the
//     current rows and fills always converges to the same result.
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
  /** New fills produced by this replay (the store appends them). */
  newFills: Fill[];
  /** All lots, with units updated. */
  lots: Lot[];
  /** All sells, with unmatched units updated. */
  sells: Sell[];
  /** Lots that closed during this replay. */
  closed: LotClose[];
  /** Realization state of every sell after the replay. */
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
 * Deterministic replay over one (wallet, symbol): walks unmatched sells in
 * chain order and consumes earlier open lots, oldest first. Idempotent:
 * running it again with its own output adds nothing.
 */
export function replayFifo(lotsIn: Lot[], sellsIn: Sell[], priorFills: Fill[]): ReplayResult {
  const lots = lotsIn.map((l) => ({ ...l })).sort(byChain);
  const sells = sellsIn.map((s) => ({ ...s })).sort(byChain);
  const fills = [...priorFills];
  const newFills: Fill[] = [];
  const closed: LotClose[] = [];
  for (const sell of sells) {
    if (sell.unitsRemaining <= EPS) continue;
    for (const lot of lots) {
      if (sell.unitsRemaining <= EPS) break;
      if (lot.unitsRemaining <= EPS || !earlier(lot, sell)) continue;
      const take = Math.min(lot.unitsRemaining, sell.unitsRemaining);
      const fill: Fill = { lotId: lot.id, sellId: sell.id, units: take, buyPrice: lot.entryPrice, sellPrice: sell.sellPrice };
      fills.push(fill);
      newFills.push(fill);
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
  return { newFills, lots, sells, closed, realizations };
}
