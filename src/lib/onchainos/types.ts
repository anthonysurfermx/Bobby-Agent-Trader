// ============================================================
// OnchainOS × OpenClaw — Shared Types
// ============================================================

export interface TradeParams {
  instId: string;        // e.g. "BTC-USDT-SWAP"
  side: 'buy' | 'sell';
  size: string;          // cantidad en contratos
  lever: string;         // apalancamiento e.g. "3"
  ordType: 'market' | 'limit';
  px?: string;           // precio para limit orders
}

export interface TradeResult {
  ordId: string;
  clOrdId: string;
  sCode: string;
  sMsg: string;
}

export interface Balance {
  ccy: string;
  availBal: string;
  frozenBal: string;
  totalEq: string;
}

export interface TickerData {
  instId: string;
  last: string;
  askPx: string;
  bidPx: string;
  high24h: string;
  low24h: string;
  vol24h: string;
  ts: string;
}

export interface BondOpportunity {
  conditionId: string;
  question: string;
  safeSide: 'YES' | 'NO';
  safePrice: number;
  returnPct: number;
  apy: number;
  daysToEnd: number;
}

export interface SignalDecision {
  action: 'EXECUTE' | 'SKIP' | 'BOND_MODE';
  reason?: string;
  trade?: TradeParams;
  bondOpportunity?: BondOpportunity;
  expectedEdge?: number;
  divergence?: number;
  consensusStrength?: 'WEAK' | 'MEDIUM' | 'STRONG';
  spotPrice?: number;
  impliedPrice?: number;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface SignalRequest {
  walletAddress: string;
  marketSlug: string;
  score: number;
  direction: 'YES' | 'NO';
  outcomePrice: number;
  positionDelta: number;
}

export interface SignalResponse {
  decision: 'EXECUTE' | 'SKIP' | 'BOND_MODE';
  reason: string;
  trade: TradeParams | null;
  divergence: number;
  expectedEdge: number;
  txHash: string | null;
  spotPrice?: number;
  impliedPrice?: number;
  consensusStrength?: 'WEAK' | 'MEDIUM' | 'STRONG';
}
