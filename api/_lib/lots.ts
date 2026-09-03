// ============================================================
// lots — FIFO lot accounting for spot swaps, shared by the SQL function
// (confirm_swap_receipt) and its in-memory double in the e2e. Pure.
//
// A BUY opens a lot (units, units_remaining). A SELL consumes open lots of
// the same wallet + symbol oldest-first, possibly partially; each consumed
// slice is a fill (buy price, sell price, units). A lot whose units hit
// zero is settled with the fill-weighted exit price. Units sold that no lot
// covers (tokens bought elsewhere) stay "unmatched" on the sell.
// ============================================================

export interface OpenLot {
  id: string;
  unitsRemaining: number;
  entryPrice: number;
}

export interface Fill {
  lotId: string;
  units: number;
  buyPrice: number;
  sellPrice: number;
}

export interface SettledLot {
  lotId: string;
  exitPrice: number;
  pnlPct: number;
  outcome: 'win' | 'loss' | 'break_even';
}

export interface FifoResult {
  fills: Fill[];
  /** Lots after consumption (same order). */
  lots: OpenLot[];
  /** Lots fully consumed by this sell, with their exit computed over ALL their fills. */
  settled: SettledLot[];
  /** Units the sell moved that no open lot covered. */
  unmatchedUnits: number;
  /** Weighted average buy price of the matched units (null when nothing matched). */
  matchedAvgBuy: number | null;
  matchedUnits: number;
}

export function outcomeFor(pnlPct: number): SettledLot['outcome'] {
  return Math.abs(pnlPct) < 1 ? 'break_even' : pnlPct > 0 ? 'win' : 'loss';
}

/**
 * @param lots open lots, oldest first (caller sorts by created_at)
 * @param priorFills earlier fills of those lots (needed for the weighted exit when a lot closes)
 */
export function matchFifo(lots: OpenLot[], sellUnits: number, sellPrice: number, priorFills: Fill[] = []): FifoResult {
  const EPS = 1e-12;
  let left = sellUnits;
  const fills: Fill[] = [];
  const out: OpenLot[] = lots.map((l) => ({ ...l }));
  const settled: SettledLot[] = [];
  for (const lot of out) {
    if (left <= EPS) break;
    if (lot.unitsRemaining <= EPS) continue;
    const take = Math.min(lot.unitsRemaining, left);
    fills.push({ lotId: lot.id, units: take, buyPrice: lot.entryPrice, sellPrice });
    lot.unitsRemaining -= take;
    left -= take;
    if (lot.unitsRemaining <= EPS) {
      lot.unitsRemaining = 0;
      const all = [...priorFills.filter((f) => f.lotId === lot.id), ...fills.filter((f) => f.lotId === lot.id)];
      const units = all.reduce((s, f) => s + f.units, 0);
      const exitPrice = units > 0 ? all.reduce((s, f) => s + f.units * f.sellPrice, 0) / units : sellPrice;
      const pnlPct = ((exitPrice - lot.entryPrice) / lot.entryPrice) * 100;
      settled.push({ lotId: lot.id, exitPrice, pnlPct, outcome: outcomeFor(pnlPct) });
    }
  }
  const matchedUnits = fills.reduce((s, f) => s + f.units, 0);
  const matchedAvgBuy = matchedUnits > 0 ? fills.reduce((s, f) => s + f.units * f.buyPrice, 0) / matchedUnits : null;
  return { fills, lots: out, settled, unmatchedUnits: Math.max(0, left), matchedAvgBuy, matchedUnits };
}
