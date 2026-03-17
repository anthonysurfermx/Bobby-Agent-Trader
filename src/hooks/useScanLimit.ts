// Free tier scan limits with 12-hour cooldown
const FREE_WALLET_SCANS = 10;
const FREE_MARKET_SCANS = 10;
const COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours
const STORAGE_KEY = 'scan_limits';

interface ScanLimits {
  walletScans: number;
  marketScans: number;
  walletLimitHitAt?: number; // timestamp when wallet limit was reached
  marketLimitHitAt?: number; // timestamp when market limit was reached
}

function getLimits(): ScanLimits {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { walletScans: 0, marketScans: 0 };
    const parsed = JSON.parse(raw) as ScanLimits;
    const now = Date.now();

    // Reset wallet scans if cooldown has passed
    if (parsed.walletLimitHitAt && now - parsed.walletLimitHitAt >= COOLDOWN_MS) {
      parsed.walletScans = 0;
      delete parsed.walletLimitHitAt;
    }

    // Reset market scans if cooldown has passed
    if (parsed.marketLimitHitAt && now - parsed.marketLimitHitAt >= COOLDOWN_MS) {
      parsed.marketScans = 0;
      delete parsed.marketLimitHitAt;
    }

    return parsed;
  } catch {
    return { walletScans: 0, marketScans: 0 };
  }
}

function saveLimits(limits: ScanLimits) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(limits));
}

function formatCooldown(limitHitAt: number | undefined): string {
  if (!limitHitAt) return '';
  const remaining = COOLDOWN_MS - (Date.now() - limitHitAt);
  if (remaining <= 0) return '';
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function useScanLimit() {
  const limits = getLimits();

  const canScanWallet = limits.walletScans < FREE_WALLET_SCANS;
  const canScanMarket = limits.marketScans < FREE_MARKET_SCANS;
  const walletScansRemaining = Math.max(0, FREE_WALLET_SCANS - limits.walletScans);
  const marketScansRemaining = Math.max(0, FREE_MARKET_SCANS - limits.marketScans);
  const walletCooldownText = formatCooldown(limits.walletLimitHitAt);
  const marketCooldownText = formatCooldown(limits.marketLimitHitAt);

  const consumeWalletScan = () => {
    const current = getLimits();
    current.walletScans += 1;
    if (current.walletScans >= FREE_WALLET_SCANS && !current.walletLimitHitAt) {
      current.walletLimitHitAt = Date.now();
    }
    saveLimits(current);
  };

  const consumeMarketScan = () => {
    const current = getLimits();
    current.marketScans += 1;
    if (current.marketScans >= FREE_MARKET_SCANS && !current.marketLimitHitAt) {
      current.marketLimitHitAt = Date.now();
    }
    saveLimits(current);
  };

  return {
    canScanWallet,
    canScanMarket,
    walletScansRemaining,
    marketScansRemaining,
    walletScanLimit: FREE_WALLET_SCANS,
    marketScanLimit: FREE_MARKET_SCANS,
    walletCooldownText,
    marketCooldownText,
    consumeWalletScan,
    consumeMarketScan,
  };
}
