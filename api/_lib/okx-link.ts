// ============================================================
// api/_lib/okx-link.ts — One-tap OKX trade deep links
// ------------------------------------------------------------
// Turns a resolved asset into a trade link on OKX, attributed
// to the affiliate/referral configured in env. This is the
// funnel: analysis → intent → a trade on OKX (credited to you).
//
// Configure OKX_REF_URL:
//   - contains {INST} → replaced with lowercased instId (e.g. btc-usdt)
//   - contains {BASE} → replaced with lowercased base (e.g. btc)
//   - otherwise used as-is (a generic referral/affiliate link)
// If unset, falls back to the public OKX trade page (no referral).
// ============================================================

export function buildOkxTradeUrl(asset: { instId: string; base: string; instType: string }): string {
  const inst = asset.instId.toLowerCase();
  const tpl = process.env.OKX_REF_URL;
  if (tpl) {
    if (tpl.includes('{INST}')) return tpl.replace('{INST}', inst);
    if (tpl.includes('{BASE}')) return tpl.replace('{BASE}', asset.base.toLowerCase());
    return tpl;
  }
  const path = asset.instType === 'SWAP' ? 'trade-swap' : 'trade-spot';
  return `https://www.okx.com/${path}/${inst}`;
}

export function okxButtonText(symbol: string, lang: string): string {
  return lang === 'es' ? `⚡ Operar ${symbol} en OKX` : `⚡ Trade ${symbol} on OKX`;
}
