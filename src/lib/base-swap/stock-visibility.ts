// Whether the client offers Coinbase B20 tokenized equities (AAPLc, NVDAc, TSLAc…)
// anywhere in the UI.
//
// The server already refuses to build tokenized-stock calldata unless
// BASE_STOCK_SWAPS_ENABLED === 'true' (api/_lib/base-swap.ts) and the viewer's country
// passes the gate. This is the matching switch for the browser, and it is off unless
// explicitly turned on — the two are set together or not at all.
//
// Why it exists: Android ships this same web app as a Trusted Web Activity, and a swap
// picker listing eight US equities is the one part of Bobby that a Play reviewer can read
// as securities trading rather than a non-custodial DeFi tool. Play exempts non-custodial
// wallets from its crypto licensing policy; it does not exempt tokenized securities.
// Hiding the class costs nothing — the debate, the verdict, the record and the crypto
// pairs carry the product — and because the TWA serves the live web, flipping this back on
// needs a deploy, not a new release on the store.
//
// See docs/play-store/2026-09-17-play-readiness.md.
export const STOCK_SWAPS_VISIBLE = import.meta.env.VITE_BASE_STOCK_SWAPS_ENABLED === 'true';
