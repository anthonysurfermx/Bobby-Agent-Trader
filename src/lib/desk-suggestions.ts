// Which suggestions stand under the desk's answer, and which of the desk's transaction surfaces are on screen.
// Pure, with every input explicit: the desk (NucleoDesk) renders its swap card, its wallet pill and its chips
// from the values computed here, and scripts/test-desk-suggestions.mts reads the same functions, so the test
// and the screen cannot disagree.
//
// The rule: a question Bobby wrote never sits beside a transaction surface. The CIO's next question
// (synthesis.followUp, or the fixed question the server serves in its place) is Bobby's wording and one tap
// from being asked. The swap card under a LONG, the wallet pill, the swap sheet and the profile drawer (its
// swap row and balance) are where a reader acts with their own wallet. While any of them is on screen the next
// question is not offered. The other chips are the reader's own: a blank question about the same asset and
// "How does X look?" for the assets they asked about before. They stay as they were.
//
// A second rule: nothing Bobby does leads into a paywall. A tap on the next question asks it, and with no read
// left that tap opens the sign-in or the Bobby Pro dialog instead. So the next question is offered only while a
// read is open (readOpen), by the allowances the level control itself shows.
import { findBaseToken, isStockToken, type BaseSwapToken } from './base-swap/tokens';
import { pickIn, type Lang } from './companions/i18n';

/**
 * The token the desk's swap card offers for a read of `symbol`, or null when it has nothing to offer: the
 * asset is not on Bobby's Base allow-list (BTC is there as cbBTC, NVDA as NVDAc), it is a stablecoin, or it is
 * a tokenized stock while that class is hidden (`stocksVisible` is STOCK_SWAPS_VISIBLE).
 */
export function deskSwapOffer(symbol: string | null | undefined, stocksVisible: boolean): BaseSwapToken | null {
  const token = findBaseToken(symbol);
  return !token || token.stable || (!stocksVisible && isStockToken(token)) ? null : token;
}

/** What the desk knows when it decides what to render. Each field is the value the JSX itself reads. */
export interface DeskScreen {
  /** A finished read is on screen, with its debate, its answer and its asset. */
  done: boolean;
  /** That read's direction. */
  direction: 'long' | 'short' | 'none' | null;
  /** That read's asset. */
  symbol: string | null;
  /** Whether tokenized stocks are offered at all (STOCK_SWAPS_VISIBLE). */
  stocksVisible: boolean;
  /** The wide layout: the header's wallet pill exists only there. */
  desktop: boolean;
  /** The risk notice is accepted: nothing of the wallet renders before it. */
  consented: boolean;
  /** A wallet is connected: the pill renders nothing without one. */
  walletConnected: boolean;
  /** The sheet that is open, as shown ('none' before consent). */
  sheet: string;
}

/** The desk's transaction surfaces: where a reader acts with their own wallet, or sees its balance. */
export interface DeskSurfaces {
  /** The swap card under a LONG verdict on an asset the desk can offer. */
  swapCard: boolean;
  /** The balance pill in the header. */
  walletPill: boolean;
  /** The swap sheet, over the desk. */
  swapSheet: boolean;
  /** The profile drawer, beside the desk: it holds the swap row and the balance. */
  profile: boolean;
}

export function deskSurfaces(screen: DeskScreen): DeskSurfaces {
  return {
    swapCard: screen.done && screen.direction === 'long' && deskSwapOffer(screen.symbol, screen.stocksVisible) !== null,
    walletPill: screen.desktop && screen.consented && screen.walletConnected,
    swapSheet: screen.sheet === 'swap',
    profile: screen.sheet === 'profile',
  };
}

/** Whether any transaction surface is on screen. */
export const besideTransaction = (surfaces: DeskSurfaces): boolean => surfaces.swapCard || surfaces.walletPill || surfaces.swapSheet || surfaces.profile;

/** What a meter has left, as the level control states it (allowanceFor); null when the desk does not know. */
export type AllowanceState = 'open' | 'locked' | 'empty' | null;
/** The two meters a question spends. */
export interface DeskAllowances {
  /** The read meter every question spends, whatever its level (allowanceFor('rapido', …)). */
  read: AllowanceState;
  /** The selected level's own meter; null on Rápido, which has none. */
  level: AllowanceState;
}
/**
 * Whether a tap that asks a question would start a read, rather than open the sign-in or the Bobby Pro dialog.
 * A meter the desk does not know counts as open: it hides nothing on a guess, and the server's answer to the
 * read just finished is what fills the read meter.
 */
export const readOpen = (allowances: DeskAllowances): boolean => (allowances.read ?? 'open') === 'open' && (allowances.level ?? 'open') === 'open';

/** "How does NVDA look?", the question a chip of the reader's own asset asks, in an explicit language. */
export const howLooksIn = (symbol: string, language: Lang, locale: string): string =>
  pickIn({ en: `How does ${symbol} look?`, es: `¿Cómo se ve ${symbol}?`, pt: `Como está ${symbol}?` }, language, locale);

export type DeskSuggestion =
  /** Bobby's wording: the CIO's next question. `question` is what a tap asks. */
  | { kind: 'followUp'; label: string; question: string }
  /** The reader's own next question about the same asset: a tap only fills the ask field with the symbol. */
  | { kind: 'another'; label: string; symbol: string }
  /** One of the reader's other assets. `question` is what a tap asks; `ariaLabel` is set when the label is only a name. */
  | { kind: 'asset'; label: string; ariaLabel?: string; symbol: string; question: string };

export interface DeskSuggestionInput {
  /** A finished read is on screen. */
  done: boolean;
  /** That read's asset. */
  symbol: string | null;
  /** The CIO's next question for that read; null when there is none (no read yet, or the agents did not finish). */
  followUp: string | null;
  /** The transaction surfaces on screen (deskSurfaces). */
  surfaces: DeskSurfaces;
  /** What the reader has left to ask with (the read meter and the selected level's). */
  allowances: DeskAllowances;
  /** The reader's quick-access row, in order, each symbol with the name its chip shows; the first four are read. */
  quickAccess: ReadonlyArray<{ symbol: string; name: string }>;
  language: Lang;
  locale: string;
}

/**
 * The chips under the stage, in order.
 * Before a read: the reader's first three quick-access assets, by name.
 * After a read: the CIO's next question first (unless a transaction surface is on screen, or no read is left
 * to ask it with), then another question of the reader's own about that asset, then their other assets: one
 * when the next question is shown, two when it is not.
 */
export function deskSuggestions(input: DeskSuggestionInput): DeskSuggestion[] {
  const { symbol, language, locale } = input;
  const look = (asset: string) => howLooksIn(asset, language, locale);
  // The chip shows the company (LVMH); the question it sends keeps the symbol the server resolves (MC.PA).
  if (!input.done || !symbol) return input.quickAccess.slice(0, 3).map((asset) => ({ kind: 'asset', label: asset.name, ariaLabel: look(asset.symbol), symbol: asset.symbol, question: look(asset.symbol) }));
  const next = input.followUp && !besideTransaction(input.surfaces) && readOpen(input.allowances) ? input.followUp : null;
  return [
    // The next question carries the asset only when it writes the ticker itself, in capitals and as a whole word: "near
    // resistance" is not NEAR, and "consolidación" does not name SOL. Otherwise the symbol leads the question.
    ...(next ? [{ kind: 'followUp' as const, label: next, question: next.split(/[^\p{L}\p{N}.]+/u).includes(symbol) ? next : `${symbol} · ${next}` }] : []),
    { kind: 'another' as const, label: pickIn({ en: `Another question about ${symbol}`, es: `Otra pregunta sobre ${symbol}`, pt: `Outra pergunta sobre ${symbol}` }, language, locale), symbol },
    ...input.quickAccess.slice(0, 4).filter((asset) => asset.symbol !== symbol).slice(0, next ? 1 : 2).map((asset) => ({ kind: 'asset' as const, label: look(asset.symbol), symbol: asset.symbol, question: look(asset.symbol) })),
  ];
}
