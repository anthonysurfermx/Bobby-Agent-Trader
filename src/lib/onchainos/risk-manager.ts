// ============================================================
// Risk Manager — Circuit Breakers para OnchainOS Trade Execution
// Valida ANTES de ejecutar cualquier trade. Sin excepciones.
// ============================================================

import type { TradeParams, Balance, ValidationResult } from './types.js';

// Contador de trades por hora (in-memory, se resetea en cold start)
const tradeLog: number[] = [];
const MAX_TRADES_PER_HOUR = 5;
const ONE_HOUR_MS = 60 * 60 * 1000;

function getMaxPositionUsdc(): number {
  const envMax = process.env.MAX_POSITION_USDC;
  return envMax ? parseFloat(envMax) : 100;
}

function cleanTradeLog(): void {
  const cutoff = Date.now() - ONE_HOUR_MS;
  while (tradeLog.length > 0 && tradeLog[0] < cutoff) {
    tradeLog.shift();
  }
}

export function validateTrade(params: TradeParams, balance: Balance): ValidationResult {
  const availableBalance = parseFloat(balance.availBal);
  const tradeSize = parseFloat(params.size);
  const leverage = parseFloat(params.lever);
  const maxPositionUsdc = getMaxPositionUsdc();

  // 1. Balance mínimo: $50 USDC
  if (availableBalance < 50) {
    return {
      valid: false,
      reason: `Balance insuficiente: $${availableBalance.toFixed(2)} (mínimo $50)`,
    };
  }

  // 2. Max position size: 20% del balance disponible
  const maxByBalance = availableBalance * 0.20;
  if (tradeSize > maxByBalance) {
    return {
      valid: false,
      reason: `Tamaño excede 20% del balance: $${tradeSize} > $${maxByBalance.toFixed(2)}`,
    };
  }

  // 3. Max position desde env var
  if (tradeSize > maxPositionUsdc) {
    return {
      valid: false,
      reason: `Tamaño excede MAX_POSITION_USDC: $${tradeSize} > $${maxPositionUsdc}`,
    };
  }

  // 4. Max leverage: 5x
  if (leverage > 5) {
    return {
      valid: false,
      reason: `Apalancamiento excede máximo: ${leverage}x > 5x`,
    };
  }

  // 5. Margen de liquidación: precio de liquidación debe estar > 15% del entry
  // Para long: liqPrice = entryPrice * (1 - 1/leverage * 0.85)
  // Si el margen entre entry y liquidación es < 15%, rechazar
  if (leverage > 1) {
    const liquidationMargin = (1 / leverage) * 100;
    if (liquidationMargin < 15) {
      return {
        valid: false,
        reason: `Margen de liquidación muy ajustado: ${liquidationMargin.toFixed(1)}% (mínimo 15%)`,
      };
    }
  }

  // 6. Rate limit: max 5 trades por hora
  cleanTradeLog();
  if (tradeLog.length >= MAX_TRADES_PER_HOUR) {
    return {
      valid: false,
      reason: `Rate limit: ${tradeLog.length}/${MAX_TRADES_PER_HOUR} trades en la última hora`,
    };
  }

  return { valid: true };
}

// Registra un trade ejecutado para el rate limiter
export function recordTrade(): void {
  tradeLog.push(Date.now());
}

// Para debugging: estado actual del rate limiter
export function getRateLimitStatus(): { tradesThisHour: number; maxAllowed: number } {
  cleanTradeLog();
  return {
    tradesThisHour: tradeLog.length,
    maxAllowed: MAX_TRADES_PER_HOUR,
  };
}
