// ============================================================
// Risk Manager — Hard Rules para "Bobby's $100 Challenge"
// ============================================================

import type { TradeParams, Balance, ValidationResult } from './types.js';

export const CHALLENGE_RULES = {
  INITIAL_BALANCE: 100, // $100 USDT
  MAX_DRAWDOWN_PCT: 0.20,
  MAX_LEVERAGE: 5,
  MAX_CONCURRENT_POSITIONS: 2,
  MIN_CONVICTION: 0.60, // 6/10
  MAX_POSITION_PCT: 0.20,
  MAX_LOSS_PER_TRADE_PCT: 0.10,
  ALLOWED_ASSETS: ['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP']
};

const tradeLog: number[] = [];
const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_TRADES_PER_HOUR = 6;

function cleanTradeLog(): void {
  const cutoff = Date.now() - ONE_HOUR_MS;
  while (tradeLog.length > 0 && tradeLog[0] < cutoff) {
    tradeLog.shift();
  }
}

// 1. Circuit breaker
export function checkCircuitBreaker(currentEq: number, initialEq: number = CHALLENGE_RULES.INITIAL_BALANCE): ValidationResult {
  const drawdown = (initialEq - currentEq) / initialEq;
  if (drawdown > CHALLENGE_RULES.MAX_DRAWDOWN_PCT) {
    return {
      valid: false,
      reason: `CIRCUIT BREAKER: Drawdown actual ${(drawdown * 100).toFixed(1)}% superó el límite de ${CHALLENGE_RULES.MAX_DRAWDOWN_PCT * 100}%`
    };
  }
  return { valid: true };
}

// 2. Position Sizing (Kelly simplified)
export function getPositionSize(balance: number, conviction: number, _isSafeMode?: boolean): number {
  if (conviction < CHALLENGE_RULES.MIN_CONVICTION) return 0;
  
  // Tamaño máximo permitido por trade (20% del balance)
  const maxAllowedUsd = balance * CHALLENGE_RULES.MAX_POSITION_PCT;
  
  // Kelly base size (linear scaled: si es 10/10 usa el 100% de su límite permitido)
  let targetSizeUsd = maxAllowedUsd * conviction;
  
  // Hard cap 20%
  if (targetSizeUsd > maxAllowedUsd) {
    targetSizeUsd = maxAllowedUsd;
  }
  
  return targetSizeUsd;
}

// 3. Max concurrent positions
export function hasCapacityForNewPosition(currentPositionsCount: number): boolean {
  return currentPositionsCount < CHALLENGE_RULES.MAX_CONCURRENT_POSITIONS;
}

// Verifica si el activo es líquido/permitido
function isAllowedAsset(instId: string): boolean {
  // Para flexibilizar en el futuro, pero limitamos en el Challenge
  return CHALLENGE_RULES.ALLOWED_ASSETS.includes(instId);
}

// Main validation: canOpenPosition (validación estricta para challenge mode)
export function canOpenPosition(
  params: TradeParams, 
  balance: Balance, 
  conviction: number, 
  currentPositionsCount: number = 0,
  currentPrice?: number
): ValidationResult {

  const totalEq = parseFloat(balance.totalEq || '0');
  const tradeSizeUsd = parseFloat(params.size);
  const leverage = parseFloat(params.lever);

  // GATE 0: Reject non-finite inputs — prevents NaN from bypassing all checks
  if (!Number.isFinite(totalEq) || totalEq <= 0) {
    return { valid: false, reason: `Invalid balance: ${balance.totalEq}` };
  }
  if (!Number.isFinite(tradeSizeUsd) || tradeSizeUsd <= 0) {
    return { valid: false, reason: `Invalid trade size: ${params.size}` };
  }
  if (!Number.isFinite(leverage) || leverage <= 0) {
    return { valid: false, reason: `Invalid leverage: ${params.lever}` };
  }
  if (!Number.isFinite(conviction) || conviction < 0) {
    return { valid: false, reason: `Invalid conviction: ${conviction}` };
  }
  if (currentPrice !== undefined && (!Number.isFinite(currentPrice) || currentPrice <= 0)) {
    return { valid: false, reason: `Invalid currentPrice: ${currentPrice}` };
  }

  // 1. Min Conviction
  if (conviction < CHALLENGE_RULES.MIN_CONVICTION) {
    return { valid: false, reason: `Convicción insuficiente: ${(conviction*10)}/10 < 6/10` };
  }

  // 2. Circuit Breaker Verify
  const cb = checkCircuitBreaker(totalEq);
  if (!cb.valid) return cb;

  // 3. Max Concurrent Positions
  if (!hasCapacityForNewPosition(currentPositionsCount)) {
    return { valid: false, reason: `Max concurrent positions alcanzadas (${CHALLENGE_RULES.MAX_CONCURRENT_POSITIONS})` };
  }

  // 4. Activos Permitidos
  if (!isAllowedAsset(params.instId)) {
    return { valid: false, reason: `Activo no permitido para el $100 Challenge: ${params.instId}` };
  }

  // 5. Stop Loss Obligatorio
  if (!params.slTriggerPx) {
    return { valid: false, reason: `Stop loss obligatorio: no se especificó slTriggerPx` };
  }

  // Max Loss per Trade
  if (params.slTriggerPx && currentPrice) {
    const entry = currentPrice;
    const sl = parseFloat(params.slTriggerPx);
    // % price drop
    const dropPct = params.side === 'buy' ? (entry - sl) / entry : (sl - entry) / entry;
    // Si slTriggerPx está al revés (sl > entry en buy), return valid:false
    if (dropPct < 0) {
      return { valid: false, reason: `Stop loss inválido para dirección ${params.side}` };
    }
    const levDropPct = dropPct * leverage;
    
    // Loss in USD = PositionSize * levDropPct
    const maxLossUsd = tradeSizeUsd * levDropPct;
    const maxAllowedLossUsd = totalEq * CHALLENGE_RULES.MAX_LOSS_PER_TRADE_PCT;
    
    if (maxLossUsd > maxAllowedLossUsd) {
       return { valid: false, reason: `Stop loss muy amplio: Pérdida potencial $${maxLossUsd.toFixed(2)} excede 10% del balance ($${maxAllowedLossUsd.toFixed(2)})` };
    }
  }

  // 6. Max Leverage
  if (leverage > CHALLENGE_RULES.MAX_LEVERAGE) {
    return { valid: false, reason: `Apalancamiento excede máximo: ${leverage}x > ${CHALLENGE_RULES.MAX_LEVERAGE}x` };
  }

  // 7. Rate limit
  cleanTradeLog();
  if (tradeLog.length >= MAX_TRADES_PER_HOUR) {
    return { valid: false, reason: `Rate limit: demasiados trades en la última hora` };
  }

  return { valid: true };
}

// Legacy compat for general / non-challenge loops
export function validateTrade(params: TradeParams, balance: Balance): ValidationResult {
  const availableBalance = parseFloat(balance.availBal);
  if (availableBalance < 50) {
    return { valid: false, reason: `Balance insuficiente: $${availableBalance.toFixed(2)} (mínimo $50)` };
  }
  return { valid: true };
}

export function recordTrade(): void {
  tradeLog.push(Date.now());
}

export function getRateLimitStatus(): { tradesThisHour: number; maxAllowed: number } {
  cleanTradeLog();
  return { tradesThisHour: tradeLog.length, maxAllowed: MAX_TRADES_PER_HOUR };
}
