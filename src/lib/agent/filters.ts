// ============================================================
// Signal Filters — Deterministic hard filters before LLM
// No AI needed here — pure logic to reduce noise
// ============================================================

import type { RawSignal, FilteredSignal } from './types';

// Tokens we've seen recently — avoid re-trading
const recentlyTraded = new Map<string, number>(); // tokenAddress -> timestamp

const COOLDOWN_MS = 8 * 60 * 60 * 1000; // 8 hours — match cron interval

export function filterSignals(signals: RawSignal[]): FilteredSignal[] {
  const now = Date.now();
  const filtered: FilteredSignal[] = [];

  for (const signal of signals) {
    const reasons: string[] = [];
    let score = 0;

    // --- Source-specific scoring ---

    if (signal.source === 'okx_dex_signal') {
      // Must have meaningful USD amount
      if (signal.amountUsd < 5000) continue;

      // Multiple wallets = stronger signal
      const walletCount = signal.triggerWalletCount || 0;
      if (walletCount >= 3) {
        score += 30;
        reasons.push(`${walletCount} wallets triggered`);
      } else if (walletCount >= 2) {
        score += 15;
        reasons.push(`${walletCount} wallets`);
      } else {
        score += 5;
      }

      // Low sold ratio = wallets still holding (bullish)
      const soldRatio = signal.soldRatioPct || 0;
      if (soldRatio < 10) {
        score += 25;
        reasons.push(`Only ${soldRatio}% sold (strong conviction)`);
      } else if (soldRatio < 30) {
        score += 15;
        reasons.push(`${soldRatio}% sold`);
      } else if (soldRatio > 70) {
        continue; // Most wallets already sold — skip
      }

      // Amount-based scoring
      if (signal.amountUsd > 100000) {
        score += 20;
        reasons.push(`$${(signal.amountUsd / 1000).toFixed(0)}K deployed`);
      } else if (signal.amountUsd > 25000) {
        score += 10;
        reasons.push(`$${(signal.amountUsd / 1000).toFixed(0)}K deployed`);
      }

      // Signal type bonus
      if (signal.signalType === 'SMART_MONEY' || signal.signalType === '1') {
        score += 10;
        reasons.push('Smart Money signal');
      } else if (signal.signalType === 'WHALE' || signal.signalType === '3') {
        score += 8;
        reasons.push('Whale signal');
      } else if (signal.signalType === 'INFLUENCER' || signal.signalType === '2') {
        score += 5;
        reasons.push('KOL signal');
      }

      // Market cap check — avoid micro-caps
      if (signal.marketCapUsd && signal.marketCapUsd < 100000) {
        continue; // Too small, likely scam
      }
      if (signal.marketCapUsd && signal.marketCapUsd > 1000000) {
        score += 5;
        reasons.push('Established market cap');
      }
    }

    if (signal.source === 'polymarket') {
      score += 20;
      reasons.push('Polymarket smart money consensus');
      if (signal.confidence && signal.confidence > 0.7) {
        score += 15;
        reasons.push(`High consensus (${(signal.confidence * 100).toFixed(0)}%)`);
      }
    }

    if (signal.source === 'okx_cex') {
      if (signal.signalType?.includes('funding')) {
        score += 15;
        reasons.push(`Funding rate anomaly: ${signal.signalType}`);
      }
      if (signal.signalType?.includes('momentum')) {
        score += 20;
        reasons.push(`CEX momentum: ${signal.signalType}`);
      }
      if (signal.confidence) {
        score += Math.round(signal.confidence * 15);
      }
    }

    // --- Global filters ---

    // Cooldown: skip if we traded this token recently
    const key = `${signal.chain}:${signal.tokenAddress || signal.tokenSymbol}`;
    const lastTraded = recentlyTraded.get(key);
    if (lastTraded && (now - lastTraded) < COOLDOWN_MS) {
      continue;
    }

    // Minimum score threshold
    if (score < 20) continue;

    filtered.push({
      ...signal,
      filterScore: Math.min(100, score),
      reasons,
    });
  }

  // Sort by score descending
  filtered.sort((a, b) => b.filterScore - a.filterScore);

  // Max 10 signals to LLM to control token cost
  return filtered.slice(0, 10);
}

// Mark a token as recently traded
export function markTraded(chain: string, tokenAddress: string) {
  const key = `${chain}:${tokenAddress}`;
  recentlyTraded.set(key, Date.now());
}
