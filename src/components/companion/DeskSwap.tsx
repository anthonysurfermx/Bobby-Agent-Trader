// Swaps inside the Live Desk — Base only, Uniswap V3, through the same
// audited SwapConfirm card the chat uses (quote → attest → build → approve →
// swap → on-chain receipt). Bobby never signs: the human's wallet does, and
// the server keeps every guard (allow-list, ticket cap, price impact, stock
// eligibility, country gate). Buy = USDC → asset; sell = asset → USDC, sized
// from the wallet's own balance. Two entry points share one panel:
//   DeskSwapCard — under a LONG verdict, offering the asset that was analyzed
//   SwapSheet    — from the menu, with a token picker, for any allow-listed pair
import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { formatUnits } from 'viem';
import { deskJson } from '@/lib/desk-request';
import { canPrepareDeskSwap, tokenAmount } from '@/lib/desk-swap-validation';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { ArrowLeftRight, Wallet, X } from 'lucide-react';
import { SwapConfirm, type TradeExecution } from '@/components/adams/SwapConfirm';
import { BASE_SWAP_LIMITS, BASE_SWAP_TOKENS, findBaseToken, isStockToken, type BaseSwapToken } from '@/lib/base-swap/tokens';
import { t } from '@/lib/companions/i18n';
import { useBaseBalances } from './DeskWallet';

const DEFAULT_TICKET_USD = 25;
type Side = 'buy' | 'sell';
/** What the desk trades: every allow-listed token except the stables you pay with and WETH (ETH covers it). */
const BUYABLE: readonly BaseSwapToken[] = BASE_SWAP_TOKENS.filter((token) => !token.stable && token.symbol !== 'WETH');

interface QuotePreview {
  amountOut: string;
  priceImpactPct: number | null;
  withheld: string[];
  /** The cap the server is enforcing right now (env can lower the code cap, e.g. the canary's $1). */
  maxTicketUsd: number | null;
  /** Ticket value in USD as the server sees it — for a sell, what the USDC leg is worth. */
  usdValue: number | null;
}

/** A public, wallet-free quote so the human sees the size of the trade before touching a wallet. */
function useQuotePreview(tokenIn: string, tokenOut: string, amount: string | null) {
  const [preview, setPreview] = useState<QuotePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!amount) { setPreview(null); setError(null); return; }
    let active = true;
    const controller = new AbortController();
    setPreview(null);
    setError(null);
    const id = window.setTimeout(async () => {
      try {
        const { ok, data } = await deskJson<{ ok?: boolean; error?: string; quote?: { amountOut?: unknown; priceImpactPct?: unknown; txWithheld?: unknown; usdValue?: unknown; limits?: { maxTicketUsd?: unknown } } }>(`/api/base-swap?tokenIn=${encodeURIComponent(tokenIn)}&tokenOut=${encodeURIComponent(tokenOut)}&amount=${encodeURIComponent(amount)}`, { signal: controller.signal });
        if (!active) return;
        if (!ok || !data.ok || !data.quote) { setError(data.error || t('Quote unavailable right now.', 'Cotización no disponible ahora.')); return; }
        setPreview({
          amountOut: String(data.quote.amountOut ?? '—'),
          priceImpactPct: typeof data.quote.priceImpactPct === 'number' ? data.quote.priceImpactPct : null,
          withheld: Array.isArray(data.quote.txWithheld) ? data.quote.txWithheld.map(String) : [],
          maxTicketUsd: typeof data.quote.limits?.maxTicketUsd === 'number' ? data.quote.limits.maxTicketUsd : null,
          usdValue: typeof data.quote.usdValue === 'number' ? data.quote.usdValue : null,
        });
      } catch {
        if (active) setError(t('Quote unavailable right now.', 'Cotización no disponible ahora.'));
      }
    }, 350);
    return () => { active = false; controller.abort(); window.clearTimeout(id); };
  }, [tokenIn, tokenOut, amount]);
  return { preview, error };
}

function SwapPanel({ initial, conviction, pickable }: { initial: BaseSwapToken; conviction: number | null; pickable: boolean }) {
  const [token, setToken] = useState<BaseSwapToken>(initial);
  const [side, setSide] = useState<Side>('buy');
  const [usd, setUsd] = useState<number>(DEFAULT_TICKET_USD);
  /** Sell size in token units, kept as typed so "Max" can carry the full balance precision. */
  const [qty, setQty] = useState<string>('');
  const [armed, setArmed] = useState(false);
  const [touched, setTouched] = useState(false);
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const symbols = useMemo(() => ['USDC', token.symbol], [token.symbol]);
  const { balances } = useBaseBalances(symbols);
  const usdcBalance = balances.USDC ?? null;
  const assetBalance = balances[token.symbol] ?? null;
  useEffect(() => { setToken(initial); }, [initial]);
  // A new pair, side or size means a new card: SwapConfirm validates what it signs against what it asked for.
  useEffect(() => { setArmed(false); }, [token, side, usd, qty, address]);

  const codeCap = Math.min(BASE_SWAP_LIMITS.maxTicketUsd, token.maxTicketUsd ?? BASE_SWAP_LIMITS.maxTicketUsd);
  const buyValid = Number.isFinite(usd) && usd >= BASE_SWAP_LIMITS.minTicketUsd && usd <= codeCap;
  const normalizedQty = tokenAmount(qty, token.decimals);
  const qtyUnits = Number(normalizedQty);
  const sellValid = normalizedQty !== null && Number.isFinite(qtyUnits) && qtyUnits > 0 && (assetBalance === null || qtyUnits <= assetBalance.units * (1 + 1e-9));
  const tokenIn = side === 'buy' ? 'USDC' : token.symbol;
  const tokenOut = side === 'buy' ? token.symbol : 'USDC';
  const amountForQuote = side === 'buy' ? (buyValid ? usd.toFixed(2) : null) : (sellValid ? normalizedQty! : null);
  const { preview, error } = useQuotePreview(tokenIn, tokenOut, amountForQuote);
  // The server may be running a lower cap than the code (canary rollout). The
  // first quote reveals it; an untouched default follows it, a typed amount never does.
  const cap = preview?.maxTicketUsd !== null && preview?.maxTicketUsd !== undefined ? Math.min(codeCap, preview.maxTicketUsd) : codeCap;
  useEffect(() => {
    if (side === 'buy' && !touched && preview?.maxTicketUsd !== null && preview?.maxTicketUsd !== undefined && usd > preview.maxTicketUsd) setUsd(Math.max(BASE_SWAP_LIMITS.minTicketUsd, Math.floor(preview.maxTicketUsd)));
  }, [side, touched, preview, usd]);
  const stock = isStockToken(token);
  const valid = side === 'buy' ? buyValid : sellValid;
  const trade = useMemo<TradeExecution>(() => (side === 'buy'
    ? { tokenSymbol: token.symbol, amountUsd: usd, confidence: conviction !== null ? Math.round(conviction) : 0, sizingMethod: 'manual', chain: 'base' }
    : { tokenSymbol: token.symbol, side: 'sell', amountIn: normalizedQty!, amountUsd: preview?.usdValue ?? 0, confidence: conviction !== null ? Math.round(conviction) : 0, sizingMethod: 'manual', chain: 'base' }
  ), [side, token.symbol, token.decimals, usd, qtyUnits, preview?.usdValue, conviction, normalizedQty]);

  const spendBalance = side === 'buy' ? usdcBalance : assetBalance;
  const readyToPrepare = canPrepareDeskSwap({
    amount: amountForQuote, decimals: side === 'buy' ? 6 : token.decimals,
    balance: spendBalance?.raw ?? null, usdValue: side === 'buy' ? usd : preview?.usdValue ?? null,
    cap, hasQuote: Boolean(preview) && !error,
  });
  const insufficient = isConnected && spendBalance !== null && (side === 'buy' ? usd : qtyUnits) > spendBalance.units;
  const overCap = (side === 'buy' ? usd : preview?.usdValue ?? 0) > cap;

  const crypto = BUYABLE.filter((item) => !isStockToken(item));
  const stocks = BUYABLE.filter((item) => isStockToken(item));
  const shortAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
  const sideButton = (value: Side, label: string) => (
    <button type="button" onClick={() => setSide(value)} aria-pressed={side === value} className={`rounded-md px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.14em] transition ${side === value ? 'bg-sky-400 text-black' : 'text-white/50 hover:text-white'}`}>{label}</button>
  );

  return (
    <div className="rounded-xl border border-sky-400/25 bg-sky-400/[0.04] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 text-[10px] font-mono tracking-[0.2em]">
        <span className="flex items-center gap-2 whitespace-nowrap text-sky-300"><ArrowLeftRight size={12} />{t('SWAP ON BASE', 'SWAP EN BASE')}</span>
        <span className="whitespace-nowrap text-white/40">{t('YOU SIGN', 'TÚ FIRMAS')}<span className="hidden sm:inline">{t(' · BOBBY NEVER DOES', ' · BOBBY NUNCA')}</span></span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-white/[0.08] bg-black/30 p-0.5">{sideButton('buy', t('BUY', 'COMPRAR'))}{sideButton('sell', t('SELL', 'VENDER'))}</div>
        {isConnected && (
          <span className="font-mono text-[10px] text-white/45">
            {t('Balance', 'Saldo')}: {side === 'buy'
              ? `${usdcBalance ? usdcBalance.text : '…'} USDC`
              : `${assetBalance ? assetBalance.text : '…'} ${token.symbol}`}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {pickable ? (
          <label className="min-w-[160px] flex-1">
            <span className="block text-[9px] font-mono tracking-[0.2em] text-white/40">{side === 'buy' ? t('BUY', 'COMPRAR') : t('SELL', 'VENDER')}</span>
            <select value={token.symbol} onChange={(e) => { const next = findBaseToken(e.target.value); if (next) { setToken(next); setQty(''); } }} aria-label={t('Token', 'Token')} className="mt-1 w-full rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50">
              <optgroup label={t('Crypto', 'Cripto')}>{crypto.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} · {item.name}</option>)}</optgroup>
              <optgroup label={t('Tokenized stocks (Coinbase B20)', 'Acciones tokenizadas (Coinbase B20)')}>{stocks.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} · {item.underlyingSymbol}</option>)}</optgroup>
            </select>
          </label>
        ) : (
          <div className="min-w-[140px] flex-1">
            <div className="text-[9px] font-mono tracking-[0.2em] text-white/40">{side === 'buy' ? t('BUY', 'COMPRAR') : t('SELL', 'VENDER')}</div>
            <div className="mt-1 text-lg font-semibold text-white">{token.symbol}<span className="ml-2 text-xs font-normal text-white/45">{token.name}</span></div>
          </div>
        )}
        {side === 'buy' ? (
          <label className="w-36">
            <span className="block text-[9px] font-mono tracking-[0.2em] text-white/40">{t('WITH USDC', 'CON USDC')}</span>
            <div className="mt-1 flex items-center rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 text-sm text-white focus-within:border-sky-400/50">
              <span className="text-white/45">$</span>
              <input type="number" inputMode="decimal" min={BASE_SWAP_LIMITS.minTicketUsd} max={cap} step="0.01" value={Number.isFinite(usd) ? usd : ''} onChange={(e) => { setTouched(true); setUsd(Number(e.target.value)); }} aria-label={t('Amount in USDC', 'Monto en USDC')} className="w-full min-w-0 bg-transparent pl-1 outline-none" />
              {usdcBalance && usdcBalance.units >= BASE_SWAP_LIMITS.minTicketUsd && (
                <button type="button" onClick={() => { setTouched(true); setUsd(Math.floor(Math.min(usdcBalance.units, cap) * 100) / 100); }} className="ml-1 font-mono text-[9px] tracking-[0.12em] text-sky-300 hover:text-sky-200">MAX</button>
              )}
            </div>
          </label>
        ) : (
          <label className="w-44">
            <span className="block text-[9px] font-mono tracking-[0.2em] text-white/40">{t('AMOUNT', 'CANTIDAD')}</span>
            <div className="mt-1 flex items-center rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 text-sm text-white focus-within:border-sky-400/50">
              <input type="number" inputMode="decimal" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" aria-label={t(`Amount of ${token.symbol} to sell`, `Cantidad de ${token.symbol} a vender`)} className="w-full min-w-0 bg-transparent outline-none" />
              <span className="ml-1 text-[10px] text-white/45">{token.symbol}</span>
              {assetBalance && assetBalance.units > 0 && !token.native && (
                <button type="button" onClick={() => setQty(formatUnits(assetBalance.raw, token.decimals))} className="ml-2 font-mono text-[9px] tracking-[0.12em] text-sky-300 hover:text-sky-200">MAX</button>
              )}
            </div>
          </label>
        )}
      </div>

      <div className="text-[11px] font-mono text-white/55 min-h-[16px]">
        {!valid
          ? side === 'buy'
            ? t(`Between $${BASE_SWAP_LIMITS.minTicketUsd} and $${cap} per ticket.`, `Entre $${BASE_SWAP_LIMITS.minTicketUsd} y $${cap} por ticket.`)
            : assetBalance && assetBalance.units === 0
              ? t(`No ${token.symbol} in this wallet.`, `No hay ${token.symbol} en esta wallet.`)
              : t(`Enter how much ${token.symbol} to sell, up to your balance.`, `Escribe cuánto ${token.symbol} vender, hasta tu saldo.`)
          : error
            ? <span className="text-amber-300">{error}</span>
            : preview
              ? side === 'buy'
                ? <>≈ {preview.amountOut} {token.symbol}{preview.priceImpactPct !== null ? ` · ${t('impact', 'impacto')} ${preview.priceImpactPct.toFixed(2)}%` : ''}</>
                : <>≈ ${preview.amountOut} USDC{preview.priceImpactPct !== null ? ` · ${t('impact', 'impacto')} ${preview.priceImpactPct.toFixed(2)}%` : ''}</>
              : t('Quoting on Uniswap V3…', 'Cotizando en Uniswap V3…')}
      </div>
      {preview?.withheld.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2 text-[11px] text-amber-200/90">
          <span>{t('Quote only for now: ', 'Por ahora solo cotización: ')}{preview.withheld.join(' · ')}</span>
          {side === 'buy' && usd > cap && <button type="button" onClick={() => { setTouched(true); setUsd(Math.max(BASE_SWAP_LIMITS.minTicketUsd, Math.floor(cap))); }} className="rounded-md border border-amber-300/40 px-2 py-0.5 font-mono text-[10px] text-amber-200 hover:bg-amber-300/10">{t(`Use $${Math.floor(cap)}`, `Usar $${Math.floor(cap)}`)}</button>}
        </div>
      ) : null}
      {isConnected && valid && (insufficient || overCap || !spendBalance) && (
        <p role="status" className="text-xs text-amber-200">
          {insufficient ? t('Insufficient balance on Base for this amount.', 'Saldo insuficiente en Base para este monto.')
            : overCap ? t(`The current ticket limit is $${cap}. Reduce the amount.`, `El límite actual es $${cap}. Reduce el monto.`)
            : t('Waiting for your Base balance before preparing a swap.', 'Esperando tu saldo en Base antes de preparar el swap.')}
        </p>
      )}
      {side === 'sell' && token.native && <p className="text-xs text-white/50">{t('Leave some ETH in your wallet for network fees.', 'Deja algo de ETH en tu wallet para las comisiones de red.')}</p>}
      {stock && (
        <div className="text-[10px] font-mono leading-relaxed text-white/40">
          {t('Coinbase tokenized stock (B20). It is not the underlying share. Not offered to U.S. persons or restricted countries; you attest before anything is built, buying or selling.', 'Acción tokenizada por Coinbase (B20). No es la acción subyacente. No se ofrece a personas de EE. UU. ni a países restringidos; tú lo atestiguas antes de construir nada, al comprar o al vender.')}
        </div>
      )}

      {!isConnected ? (
        <button type="button" onClick={() => void open()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/15 font-mono text-xs font-bold tracking-[0.14em] text-sky-300 transition hover:bg-sky-500/25">
          <Wallet size={14} />{t('CONNECT WALLET', 'CONECTAR WALLET')}
        </button>
      ) : !armed ? (
        <div className="flex items-center gap-3">
          <button type="button" disabled={!valid || !readyToPrepare} onClick={() => setArmed(true)} className="h-11 flex-1 rounded-xl bg-sky-400 font-mono text-xs font-bold tracking-[0.14em] text-black transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40">{side === 'buy' ? t('PREPARE BUY', 'PREPARAR COMPRA') : t('PREPARE SELL', 'PREPARAR VENTA')}</button>
          <span className="font-mono text-[10px] text-white/40">{shortAddress}</span>
        </div>
      ) : (
        <SwapConfirm key={`${side}-${token.symbol}-${side === 'buy' ? usd : trade.amountIn}`} trade={trade} walletAddress={address} title={t('Your swap · you review, you sign:', 'Tu swap · tú revisas, tú firmas:')} />
      )}

      <div className="text-[9px] font-mono tracking-[0.12em] text-white/30">
        {t(`Base · Uniswap V3 · max $${cap} per ticket · analysis is not advice`, `Base · Uniswap V3 · máx. $${cap} por ticket · el análisis no es asesoría`)}
      </div>
    </div>
  );
}

/** Under a LONG verdict: the analyzed asset, if it lives on Bobby's Base allow-list (BTC → cbBTC, NVDA → NVDAc…). */
export function DeskSwapCard({ symbol, conviction }: { symbol: string; conviction: number | null }) {
  const token = useMemo(() => findBaseToken(symbol), [symbol]);
  if (!token || token.stable) return null;
  return <SwapPanel initial={token} conviction={conviction} pickable={false} />;
}

/** From the menu: any allow-listed pair, buy or sell against USDC. */
export function SwapSheet({ initialSymbol, onClose }: { initialSymbol?: string | null; onClose: () => void }) {
  const initial = useMemo(() => {
    const hit = findBaseToken(initialSymbol);
    return hit && !hit.stable ? hit : BUYABLE[0];
  }, [initialSymbol]);
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/85" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-[61] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0c] text-white shadow-2xl">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] p-4">
            <div>
              <Dialog.Title className="font-mono text-sm tracking-[0.15em]">{t('Swap on Base', 'Swap en Base')}</Dialog.Title>
              <div className="mt-0.5 text-[10px] font-mono tracking-[0.12em] text-white/40">{t('Your wallet signs. Bobby prepares and verifies.', 'Tu wallet firma. Bobby prepara y verifica.')}</div>
            </div>
            <Dialog.Close aria-label={t('Close and return to desk', 'Cerrar y volver al desk')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/80 hover:bg-white/10"><X size={20} /></Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
            <SwapPanel initial={initial} conviction={null} pickable />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
