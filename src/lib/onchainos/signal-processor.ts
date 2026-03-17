// ============================================================
// Signal Processor — Cerebro de la integración OpenClaw × OnchainOS
// Recibe señal de agente detectado → calcula divergencia → decide ejecución
// ============================================================

import { getSpotPrice, getWalletBalance } from './client.js';
import { validateTrade, recordTrade } from './risk-manager.js';
import type { SignalDecision, TradeParams } from './types.js';

// Mapa de slugs de Polymarket a instrumentos OKX
const SLUG_TO_INSTRUMENT: Record<string, string> = {
  btc: 'BTC-USDT',
  bitcoin: 'BTC-USDT',
  eth: 'ETH-USDT',
  ethereum: 'ETH-USDT',
  sol: 'SOL-USDT',
  solana: 'SOL-USDT',
  xrp: 'XRP-USDT',
  ripple: 'XRP-USDT',
  doge: 'DOGE-USDT',
  dogecoin: 'DOGE-USDT',
  ada: 'ADA-USDT',
  cardano: 'ADA-USDT',
  avax: 'AVAX-USDT',
  avalanche: 'AVAX-USDT',
  link: 'LINK-USDT',
  chainlink: 'LINK-USDT',
  matic: 'MATIC-USDT',
  polygon: 'MATIC-USDT',
  dot: 'DOT-USDT',
  polkadot: 'DOT-USDT',
  bnb: 'BNB-USDT',
  sui: 'SUI-USDT',
  pepe: 'PEPE-USDT',
  arb: 'ARB-USDT',
  arbitrum: 'ARB-USDT',
  op: 'OP-USDT',
  optimism: 'OP-USDT',
};

// Extrae el activo subyacente del slug de Polymarket
// e.g. "will-btc-reach-95000-march-2026" → "BTC-USDT"
export function extractInstrument(marketSlug: string): string | null {
  const slugLower = marketSlug.toLowerCase();

  for (const [keyword, instrument] of Object.entries(SLUG_TO_INSTRUMENT)) {
    // Busca el keyword como palabra completa en el slug (separada por -)
    const pattern = new RegExp(`(^|-)${keyword}(-|$)`);
    if (pattern.test(slugLower)) {
      return instrument;
    }
  }

  return null;
}

// Extrae el precio target del slug cuando es un mercado tipo "will-X-reach-PRICE"
function extractTargetPrice(marketSlug: string): number | null {
  // Patrones comunes: "reach-95000", "hit-100000", "above-90000", "below-80000"
  const priceMatch = marketSlug.match(
    /(?:reach|hit|above|below|over|under|surpass|exceed)-(\d+(?:\.\d+)?)/i
  );
  if (priceMatch) {
    return parseFloat(priceMatch[1]);
  }
  return null;
}

// Calcula precio implícito del activo basado en el outcome price de Polymarket
function calculateImpliedPrice(
  outcomePrice: number,
  direction: 'YES' | 'NO',
  targetPrice: number | null,
  spotPrice: number
): number {
  if (targetPrice) {
    // Si el mercado es "will BTC reach $95k" y YES está a 0.72,
    // el mercado implica 72% probabilidad de que BTC llegue a $95k
    // Precio implícito = spotPrice + (targetPrice - spotPrice) * probability
    const probability = direction === 'YES' ? outcomePrice : 1 - outcomePrice;
    return spotPrice + (targetPrice - spotPrice) * probability;
  }

  // Sin precio target, usamos el outcome price como señal direccional
  // Si YES > 0.5, el mercado cree que el evento es probable
  return spotPrice;
}

// Determina fuerza del consenso basado en el delta de posición y score
function assessConsensus(
  score: number,
  positionDelta: number
): 'WEAK' | 'MEDIUM' | 'STRONG' {
  // Score alto + posición grande = señal fuerte
  if (score >= 90 && positionDelta >= 5000) return 'STRONG';
  if (score >= 85 && positionDelta >= 2000) return 'MEDIUM';
  return 'WEAK';
}

// Calcula el tamaño de posición en USDC basado en el edge y consenso
function calculatePositionSize(
  divergence: number,
  consensus: 'WEAK' | 'MEDIUM' | 'STRONG',
  availableBalance: number
): number {
  const maxPosition = parseFloat(process.env.MAX_POSITION_USDC || '100');

  // Base: 2% del balance
  let size = availableBalance * 0.02;

  // Ajuste por divergencia (más divergencia = más confianza)
  if (divergence > 10) size *= 2;
  else if (divergence > 5) size *= 1.5;

  // Ajuste por consenso
  if (consensus === 'STRONG') size *= 1.5;
  else if (consensus === 'MEDIUM') size *= 1.2;

  // Nunca exceder el máximo configurado
  return Math.min(size, maxPosition);
}

// ---- Función Principal ----

export async function processAgentSignal(
  walletAddress: string,
  marketSlug: string,
  openclawScore: number,
  direction: 'YES' | 'NO',
  outcomePrice: number,
  positionSizeDelta: number
): Promise<SignalDecision> {
  const timestamp = new Date().toISOString();

  // 1. Filtrar por score mínimo
  if (openclawScore < 80) {
    console.log('[OnchainOS] SKIP — score below threshold', {
      wallet: walletAddress,
      score: openclawScore,
      timestamp,
    });
    return { action: 'SKIP', reason: 'score_below_threshold' };
  }

  // 2. Extraer instrumento OKX del slug
  const instrument = extractInstrument(marketSlug);
  if (!instrument) {
    console.log('[OnchainOS] SKIP — no matching instrument', {
      slug: marketSlug,
      timestamp,
    });
    return { action: 'SKIP', reason: 'no_matching_instrument' };
  }

  // 3. Obtener precio spot de OKX
  let spotPrice: number;
  try {
    spotPrice = await getSpotPrice(instrument);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OnchainOS] PRICE FETCH FAILED', msg);
    return { action: 'SKIP', reason: `price_fetch_failed: ${msg}` };
  }

  // 4. Calcular precio implícito desde Polymarket
  const targetPrice = extractTargetPrice(marketSlug);
  const impliedPrice = calculateImpliedPrice(outcomePrice, direction, targetPrice, spotPrice);

  // 5. Calcular divergencia
  const divergence = Math.abs((impliedPrice - spotPrice) / spotPrice * 100);
  const minDivergence = parseFloat(process.env.MIN_DIVERGENCE_THRESHOLD || '3');

  console.log('[OnchainOS] DIVERGENCE ANALYSIS', {
    instrument,
    spotPrice,
    impliedPrice,
    divergence: `${divergence.toFixed(2)}%`,
    threshold: `${minDivergence}%`,
    timestamp,
  });

  // 6. Divergencia demasiado pequeña
  if (divergence < minDivergence) {
    return {
      action: 'SKIP',
      reason: 'divergence_too_small',
      divergence,
      spotPrice,
      impliedPrice,
      consensusStrength: assessConsensus(openclawScore, positionSizeDelta),
    };
  }

  // 7. Evaluar consenso
  const consensus = assessConsensus(openclawScore, positionSizeDelta);

  // 8. Obtener balance para calcular tamaño de posición
  let availableBalance: number;
  try {
    const balance = await getWalletBalance('USDT');
    availableBalance = parseFloat(balance.availBal);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OnchainOS] BALANCE FETCH FAILED', msg);
    return {
      action: 'SKIP',
      reason: `balance_fetch_failed: ${msg}`,
      divergence,
      spotPrice,
      impliedPrice,
      consensusStrength: consensus,
    };
  }

  // 9. Calcular tamaño de posición
  const positionSize = calculatePositionSize(divergence, consensus, availableBalance);

  // 10. Determinar dirección del trade
  // Si Polymarket implica precio más alto que spot → BUY (long)
  // Si Polymarket implica precio más bajo que spot → SELL (short)
  const tradeSide: 'buy' | 'sell' = impliedPrice > spotPrice ? 'buy' : 'sell';

  // 11. Construir parámetros del trade
  const trade: TradeParams = {
    instId: `${instrument}-SWAP`,
    side: tradeSide,
    size: positionSize.toFixed(2),
    lever: '3',
    ordType: 'market',
  };

  // 12. Validar con risk manager
  try {
    const balance = await getWalletBalance('USDT');
    const validation = validateTrade(trade, balance);

    if (!validation.valid) {
      console.log('[OnchainOS] REJECTED BY RISK MANAGER', validation.reason);
      return {
        action: 'SKIP',
        reason: `risk_rejected: ${validation.reason}`,
        trade,
        divergence,
        expectedEdge: divergence,
        spotPrice,
        impliedPrice,
        consensusStrength: consensus,
      };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OnchainOS] RISK VALIDATION FAILED', msg);
    return {
      action: 'SKIP',
      reason: `risk_validation_failed: ${msg}`,
      divergence,
      spotPrice,
      impliedPrice,
      consensusStrength: consensus,
    };
  }

  // 13. Registrar trade en rate limiter
  recordTrade();

  console.log('[OnchainOS] SIGNAL PROCESSED', {
    action: 'EXECUTE',
    wallet: walletAddress,
    instrument,
    side: tradeSide,
    size: positionSize,
    divergence: `${divergence.toFixed(2)}%`,
    consensus,
    timestamp,
  });

  return {
    action: 'EXECUTE',
    trade,
    expectedEdge: divergence,
    divergence,
    spotPrice,
    impliedPrice,
    consensusStrength: consensus,
  };
}
