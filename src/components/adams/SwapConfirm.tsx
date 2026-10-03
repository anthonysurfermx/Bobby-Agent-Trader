import { speechLocale, t as ui, translatedEnglish, lang } from '@/lib/companions/i18n';
// ============================================================
// SwapConfirm — Inline trade execution card in chat (Base · Uniswap V3 ·
// Coinbase B20 tokenized stocks)
//
// State machine (every transition waits for a MINED, SUCCESSFUL receipt):
//   idle → approving → requoting → ready → swapping → verifying → confirmed
//                                             ↘ error (retry)
// The server hands out swap calldata only once it simulated with the
// allowance in place, so after an approval this card re-quotes through
// /api/base-swap (session-bound) instead of reusing the old payload. After
// the swap mines, /api/swap-receipt verifies it on-chain and records it;
// nothing is written from the client's word.
// ============================================================

import { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi';
import { CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { BASE, BASE_CHAIN_ID } from '@/config/chains';
import { assertApprovalCalldata, assertRevokeCalldata, assertSwapCalldata } from '@/lib/base-swap/calldata-guard';
import { assertExecutionViewConsistent, assertQuoteConsistent, type QuoteLike, type ValidatedQuote } from '@/lib/base-swap/quote-guard';
import { BASE_SWAP_LIMITS, findBaseToken, isStockToken } from '@/lib/base-swap/tokens';
import { useBobbySession } from '@/hooks/useBobbySession';

interface Tx { to: string; data: string; value?: string }

interface StockReference {
  symbol: string;
  usdPrice: number;
  ageSec: number;
  multiplierHuman: number;
  marketDeviationPct: number;
  pausedFeatures: string;
  transferPaused: boolean;
}

export interface TradeIntent {
  tokenIn: 'USDC';
  tokenOut: string;
  amount: string;
  cycleId: string;
  wallet: string;
  expiresAt: number;
  jti: string;
  intentToken: string;
  preview: {
    amountOut: string;
    minAmountOut: string;
    executionPrice: number;
    priceImpactPct: number | null;
    route: { description: string };
    venue: { name: string; router: string };
    stockReference: StockReference | null;
    warnings: string[];
    limits: { maxTicketUsd: number };
  };
}

export interface TradeExecution {
  tokenSymbol: string;
  amountUsd: number;
  confidence: number;
  sizingMethod: string;
  /** Always Base (8453); kept on the row for the record. */
  chain: string;
  /** Direction. Default buy (USDC → asset). A sell sends the asset and receives USDC. */
  side?: 'buy' | 'sell';
  /** For sells: the asset amount in token units as a decimal string — exactly what the server quotes and the wallet approves. */
  amountIn?: string;
  /** The cycle's recommendation, quote-only. Calldata exists only after the human attests. */
  intent?: TradeIntent;
  execution?: {
    needsApproval: boolean;
    approveTx?: Tx;
    /** Absent while an approval is pending; filled by the re-quote. */
    swapTx?: Tx;
    calldataHash?: string;
    /** approve(router, 0) when an allowance exists. */
    revokeTx?: Tx;
    quote: { fromToken: string; toToken: string; fromAmount: string; fromAmountRaw?: string; toAmount: string; minReceived?: string; minReceivedRaw?: string };
    disclosure?: {
      venue?: string;
      router?: string;
      tokenContract?: string | null;
      spender?: string | null;
      minReceived?: string | null;
      route?: string;
      priceImpactPct?: number | null;
      deadline?: number;
      simulated?: boolean;
      stockReference?: StockReference | null;
      note?: string;
    };
  };
}

type SwapState = 'intent' | 'building' | 'idle' | 'approving' | 'requoting' | 'ready' | 'swapping' | 'verifying' | 'confirmed' | 'unrecorded' | 'skipped' | 'error';

function localizedSwapError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!message) return fallback;
  if (lang() === 'en') return message;
  return translatedEnglish(message) ?? fallback;
}

export function SwapConfirm({ trade, walletAddress, title = ui('Bobby proposes:', 'Bobby propone:') }: { trade: TradeExecution; walletAddress?: string; title?: string }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, setState] = useState<SwapState>(trade.execution ? (trade.execution.swapTx ? 'ready' : 'idle') : 'intent');
  const [execution, setExecution] = useState(trade.execution);
  // BP-01: the full /api/base-swap quote, kept alongside the reduced `execution` view.
  const [fullQuote, setFullQuote] = useState<QuoteLike | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [swapTxHash, setSwapTxHash] = useState<`0x${string}` | undefined>();
  const [receiptNote, setReceiptNote] = useState<string | null>(null);

  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { chainId: connectedChainId, address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const session = useBobbySession({ auto: false });
  const wallet = (walletAddress || address || '').toLowerCase();

  const disclosure = execution?.disclosure;
  const selling = trade.side === 'sell';
  const fromToken = execution?.quote.fromToken ?? trade.intent?.tokenIn ?? (selling ? trade.tokenSymbol : 'USDC');
  const toToken = execution?.quote.toToken ?? trade.intent?.tokenOut ?? (selling ? 'USDC' : trade.tokenSymbol);
  const fromAmount = execution?.quote.fromAmount ?? trade.intent?.amount ?? (selling && trade.amountIn ? trade.amountIn : trade.amountUsd.toFixed(2));
  // Whether this is a tokenized stock is decided from the allow-list the card
  // and the server share, BEFORE any round-trip: the attestation the human
  // reads first must already be the stock one. The B20 reference numbers
  // still come from the server once it has quoted.
  const stockReference = disclosure?.stockReference ?? trade.intent?.preview.stockReference ?? null;
  // A tokenized stock on either leg needs the stock attestation — selling one is still a B20 transfer.
  const stock = isStockToken(findBaseToken(toToken)) || isStockToken(findBaseToken(fromToken)) || stockReference !== null;
  // If the kind of attestation ever changes under the human, their earlier tick does not carry over.
  useEffect(() => { setAcknowledged(false); }, [stock]);

  /** Where a fresh server answer lands: approval first, or straight to the swap. */
  const stateFor = (exec: NonNullable<TradeExecution['execution']>): SwapState => (exec.swapTx ? 'ready' : 'idle');

  const ensureChain = async () => {
    if (connectedChainId !== BASE_CHAIN_ID) await switchChainAsync({ chainId: BASE_CHAIN_ID });
  };

  /** Sends a tx and waits until it is mined with status success. */
  const sendAndConfirm = async (tx: Tx) => {
    if (!publicClient) throw new Error('No Base client');
    await ensureChain();
    const hash = await sendTransactionAsync({
      chainId: BASE_CHAIN_ID,
      to: tx.to as `0x${string}`,
      data: tx.data as `0x${string}`,
      value: tx.value ? BigInt(tx.value) : undefined,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`Transaction ${hash.slice(0, 10)}… reverted on-chain`);
    return hash;
  };

  const sessionHeaders = async () => {
    const stored = session.ready ? session.session : await session.ensureSession();
    if (!stored) throw new Error('Sign the wallet session to continue');
    return session.headers();
  };

  /**
   * Asks the server to build (or rebuild) the transaction for this wallet.
   * The attestation the human just gave travels with the request; the cycle
   * id ties the receipt to the recommendation. Returns what the server built:
   * an approval step, or simulated swap calldata.
   */
  const build = async (): Promise<NonNullable<TradeExecution['execution']>> => {
    const headers = await sessionHeaders();
    const res = await fetch('/api/base-swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        tokenIn: fromToken,
        tokenOut: toToken,
        amount: fromAmount,
        wallet,
        ...(stock ? { stockEligibilityConfirmed: acknowledged } : {}),
        ...(trade.intent ? { cycleId: trade.intent.cycleId, intentToken: trade.intent.intentToken, intentExpiresAt: trade.intent.expiresAt, intentJti: trade.intent.jti } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Build failed');
    if (!data.execution) {
      const why = (data.quote?.txWithheld as string[] | undefined)?.join('; ') || 'calldata withheld';
      throw new Error(why);
    }
    // BP-01: validate the FULL quote against the request this card made, in integer units,
    // before anything is displayed or signed — and (third round) refuse a reduced
    // `execution` view that disagrees with it: what the card shows is what it signs.
    const v = assertQuoteConsistent(data.quote, request());
    assertExecutionViewConsistent(data.execution, data.quote, v);
    setFullQuote(data.quote);
    setExecution(data.execution);
    return data.execution;
  };

  /** The request this card makes — the only source of truth for pair, amount, slippage and wallet. */
  const request = () => ({ tokenIn: fromToken, tokenOut: toToken, amount: fromAmount, slippagePct: BASE_SWAP_LIMITS.defaultSlippagePct, wallet });
  /** Re-validate right before a signature; refuses if no full quote was ever validated. */
  const validated = (): ValidatedQuote => {
    if (!fullQuote) throw new Error('No validated quote; build first');
    const v = assertQuoteConsistent(fullQuote, request());
    assertExecutionViewConsistent(execution, fullQuote, v);
    return v;
  };

  const handleBuild = async () => {
    try {
      setState('building');
      const exec = await build();
      setState(stateFor(exec));
    } catch (err) {
      setState('error');
      setErrorMsg(localizedSwapError(err, ui('Could not prepare the transaction. Review the wallet and quote, then retry.', 'No pude preparar la transacción. Revisa la wallet y la cotización y reintenta.')));
    }
  };

  const notExpired = () => {
    if (disclosure?.deadline && disclosure.deadline <= Math.floor(Date.now() / 1000) + 15) throw new Error('Quote expired. Re-quote before signing.');
  };

  const handleApprove = async () => {
    try {
      if (!execution?.approveTx) throw new Error('No approval to sign; build first');
      notExpired();
      const v = validated();
      assertApprovalCalldata(execution.approveTx, { tokenSymbol: v.tokenInSymbol, amountRaw: v.amountInRaw });
      setState('approving');
      await sendAndConfirm(execution.approveTx);
      setState('requoting');
      const exec = await build();
      if (!exec.swapTx || exec.disclosure?.simulated !== true) throw new Error('Swap is not ready after the approval; re-quote');
      setState('ready');
    } catch (err) {
      setState('error');
      setErrorMsg(localizedSwapError(err, ui('Approval failed. Review the wallet and retry.', 'La aprobación falló. Revisa la wallet y reintenta.')));
    }
  };

  /**
   * Posts the hash to /api/swap-receipt. 202 = not indexed yet: retry with
   * backoff. 200 = verified and recorded. Anything else = the chain says one
   * thing and the record another; that is shown, never painted green.
   */
  const submitReceipt = async (hash: `0x${string}`) => {
    const headers = await sessionHeaders();
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch('/api/swap-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ txHash: hash, wallet, platform: 'web' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
      if (res.ok && data.ok) { setReceiptNote(ui('Verified on-chain and recorded', 'Verificado en cadena y registrado')); setState('confirmed'); return; }
      setReceiptNote(ui(`Mined on ${BASE.name}, but not recorded (status ${res.status}). Retry the record check.`, `Minada en ${BASE.name}, sin registrar (estado ${res.status}). Reintenta la verificación.`));
      setState('unrecorded');
      return;
    }
    setReceiptNote(ui('Mined, but the receipt is still indexing. Retry in a moment.', "Minada, pero el recibo aún se está indexando. Reintenta en un momento."));
    setState('unrecorded');
  };

  const handleSwap = async () => {
    try {
      if (!execution?.swapTx) throw new Error('No swap calldata; re-quote first');
      if (disclosure?.simulated !== true) throw new Error('Swap has not passed the post-approval simulation');
      notExpired();
      const v = validated();
      assertSwapCalldata(execution.swapTx, {
        tokenInSymbol: v.tokenInSymbol,
        tokenOutSymbol: v.tokenOutSymbol,
        amountInRaw: v.amountInRaw,
        minAmountOutRaw: v.minAmountOutRaw,
        recipient: v.recipient,
        deadline: v.deadline,
      });
      setState('swapping');
      const hash = await sendAndConfirm(execution.swapTx);
      setSwapTxHash(hash);
      setState('verifying');
      await submitReceipt(hash);
    } catch (err) {
      setState('error');
      setErrorMsg(localizedSwapError(err, ui('Swap failed. Review the wallet and retry.', 'El swap falló. Revisa la wallet y reintenta.')));
    }
  };

  const handleRevoke = async () => {
    try {
      if (!execution?.revokeTx) return;
      assertRevokeCalldata(execution.revokeTx, { tokenSymbol: fromToken });
      setState('approving');
      await sendAndConfirm(execution.revokeTx);
      setState('requoting');
      // After a revoke the next build needs an approval again: land on 'idle', not 'ready'.
      const exec = await build();
      setState(stateFor(exec));
    } catch (err) {
      setState('error');
      setErrorMsg(localizedSwapError(err, ui('Revocation failed. Review the wallet and retry.', 'La revocación falló. Revisa la wallet y reintenta.')));
    }
  };

  if (state === 'skipped') return null;

  // Third-round BP-01: once a quote is validated, every economic field on the card comes
  // from the VALIDATED full quote (the reduced view is refused if it disagrees). Before a
  // build there is only the intent preview, which is labelled as an estimate.
  const minReceived = fullQuote ? String(fullQuote.minAmountOut) : (trade.intent?.preview.minAmountOut ? `≈ ${trade.intent.preview.minAmountOut}` : '—');
  const deadlineLeftMin = disclosure?.deadline ? Math.max(0, Math.round((disclosure.deadline * 1000 - Date.now()) / 60000)) : null;
  const canSign = acknowledged && (state === 'idle' || state === 'ready');
  const canBuild = acknowledged && state === 'intent';
  const button = 'flex-1 py-1.5 px-3 bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors rounded disabled:opacity-40';
  const skip = 'py-1.5 px-3 border border-white/10 text-white/30 hover:text-white/60 transition-colors rounded';

  return (
    <div className="border border-green-500/20 bg-green-500/[0.03] rounded-lg p-3 font-mono text-[11px]">
      <div className="text-green-400/60 mb-2">{title}</div>

      <div className="space-y-1 mb-3">
        {selling
          ? <div className="text-green-300">{ui(`Sell ${fromAmount} ${fromToken} for approximately $${trade.amountUsd.toLocaleString(speechLocale(), {minimumFractionDigits:2,maximumFractionDigits:2})} USDC`, `Vender ${fromAmount} ${fromToken} por aproximadamente $${trade.amountUsd.toLocaleString(speechLocale(), {minimumFractionDigits:2,maximumFractionDigits:2})} USDC`)}</div>
          : <div className="text-green-300">{ui(`Buy ${toToken} for $${trade.amountUsd.toLocaleString(speechLocale(), {minimumFractionDigits:2,maximumFractionDigits:2})}`, `Comprar ${toToken} por $${trade.amountUsd.toLocaleString(speechLocale(), {minimumFractionDigits:2,maximumFractionDigits:2})}`)}{trade.intent ? ` · ≈ ${Number(trade.intent.preview.amountOut).toLocaleString(speechLocale(), { maximumFractionDigits: 6 })} ${toToken}` : ''}</div>}
        <div className="text-green-400/50">{ui("via", "vía")}{disclosure?.venue ?? 'Uniswap V3'} {ui("on", "en")}{BASE.name}{stock ? ui(' · Coinbase Tokenized Stock (B20)', " · Acción tokenizada Coinbase (B20)") : ''}</div>
        <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 font-mono text-[10px] text-white/70 space-y-1">
          <div>{ui("CHAIN ·", "RED ·")}{BASE.name} ({BASE_CHAIN_ID})</div>
          <div>{ui("SWAP CONTRACT ·", "CONTRATO SWAP ·")}{disclosure?.router ?? execution?.swapTx?.to ?? trade.intent?.preview.venue.router ?? '—'}</div>
          {(disclosure?.route ?? trade.intent?.preview.route.description) && <div>{ui("ROUTE ·", "RUTA ·")}{disclosure?.route ?? trade.intent?.preview.route.description}</div>}
          {execution?.approveTx && state !== 'ready' && (
            <>
              <div>{ui("APPROVE TOKEN ·", "TOKEN A APROBAR ·")}{disclosure?.tokenContract ?? execution.approveTx.to}</div>
              <div>{ui("APPROVE SPENDER ·", "CONTRATO AUTORIZADO ·")}{disclosure?.spender ?? '—'} {ui("· exact", "· importe exacto")}{fromAmount} {fromToken}</div>
              <div className="text-amber-300/80">{ui("If you approve and do not complete the swap, or the swap reverts, that allowance stays until spent or revoked.", "Si apruebas y no completas el swap, o si falla, el permiso permanece hasta usarse o revocarse.")}</div>
            </>
          )}
          <div>{ui("MIN RECEIVED ·", "MÍNIMO RECIBIDO ·")}{minReceived} {toToken}</div>
          {typeof (disclosure?.priceImpactPct ?? trade.intent?.preview.priceImpactPct) === 'number' && <div>{ui("PRICE IMPACT ·", "IMPACTO EN PRECIO ·")}{((disclosure?.priceImpactPct ?? trade.intent!.preview.priceImpactPct)!).toLocaleString(speechLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>}
          {stockReference && (
            <>
              <div>{ui(`B20 reference: $${stockReference.usdPrice.toLocaleString(speechLocale(), {minimumFractionDigits:2,maximumFractionDigits:2})} · Uniswap deviation ${stockReference.marketDeviationPct.toLocaleString(speechLocale(), {minimumFractionDigits:2,maximumFractionDigits:2})}% · feed age ${Math.round(stockReference.ageSec / 3600)} h`, `Referencia B20: $${stockReference.usdPrice.toLocaleString(speechLocale(), {minimumFractionDigits:2,maximumFractionDigits:2})} · desvío Uniswap ${stockReference.marketDeviationPct.toLocaleString(speechLocale(), {minimumFractionDigits:2,maximumFractionDigits:2})}% · antigüedad ${Math.round(stockReference.ageSec / 3600)} h`)}</div>
              <div>{ui("B20 MULTIPLIER ·", "MULTIPLICADOR B20 ·")}{stockReference.multiplierHuman}× {stockReference.transferPaused ? ui('· TRANSFERS PAUSED', "· TRANSFERENCIAS PAUSADAS") : stockReference.pausedFeatures !== '0' ? ui('· issuer paused mint/redeem', "· emisor pausó emisión/canje") : ''}</div>
            </>
          )}
          {deadlineLeftMin !== null && <div>{ui("VALID FOR ·", "VÁLIDO POR ·")}{deadlineLeftMin} min</div>}
          <div>{ui("SIMULATED ·", "SIMULADO ·")}{execution?.swapTx ? (disclosure?.simulated ? ui('yes (eth_call passed)', "sí (eth_call aprobado)") : ui('no', "no")) : execution ? ui('after approval + re-quote', "tras aprobación y nueva cotización") : ui('after you attest and the server builds', "tras tu confirmación y preparación del servidor")}</div>
          {(state === 'intent' || state === 'idle' || state === 'ready') && (
            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              <span>
                {stock
                  ? ui('I am in an eligible jurisdiction outside the U.S. I understand this B20 token is not the underlying share, and I checked the contract and the minimum. Bobby never signs for me.', "Estoy en una jurisdicción elegible fuera de EE. UU. Entiendo que el token B20 no es la acción subyacente y revisé contrato y mínimo. Bobby nunca firma por mí.")
                  : ui('I checked the contract and the minimum received. Bobby never signs for me.', "Revisé contrato y mínimo recibido. Bobby nunca firma por mí.")}
              </span>
            </label>
          )}
        </div>
        <div className="text-green-400/50">{ui("Confidence:", "Convicción:")}{trade.confidence}% ({trade.sizingMethod})</div>
      </div>

      {state === 'intent' && (
        <div className="flex gap-2">
          <button disabled={!canBuild} onClick={handleBuild} className={button}>{ui("Build transaction for my wallet", "Preparar transacción para mi wallet")}</button>
          <button onClick={() => setState('skipped')} className={skip}>{ui("Skip", "Omitir")}</button>
        </div>
      )}
      {state === 'building' && <div className="flex items-center gap-2 text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />{ui("Building and simulating for your wallet…", "Preparando y simulando para tu wallet…")}</div>}
      {state === 'idle' && execution && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button disabled={!canSign} onClick={handleApprove} className={button}>{ui(`Approve ${fromToken} (exact amount)`, `Aprobar ${fromToken} (importe exacto)`)}</button>
            <button onClick={() => setState('skipped')} className={skip}>{ui("Skip", "Omitir")}</button>
          </div>
          {execution.revokeTx && <button onClick={handleRevoke} className="w-full py-1 text-white/40 hover:text-white/70 border border-white/10 rounded">{ui(`Revoke existing ${fromToken} allowance (approve 0)`, `Revocar permiso de ${fromToken} (aprobar 0)`)}</button>}
        </div>
      )}
      {state === 'approving' && <div className="flex items-center gap-2 text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />{ui(`Approving ${fromToken}… waiting for the receipt`, `Aprobando ${fromToken}… esperando el recibo`)}</div>}
      {state === 'requoting' && <div className="flex items-center gap-2 text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />{ui("Approval mined. Re-quoting and simulating the swap…", "Aprobación minada. Actualizando cotización y simulando el swap…")}</div>}
      {state === 'ready' && execution && (
        <div className="space-y-2">
          {!execution.approveTx && execution.swapTx && (
            <div className="flex items-center gap-2 text-green-400"><CheckCircle className="w-3 h-3" />{ui("Approval confirmed · quote refreshed and simulation passed", "Aprobación confirmada · cotización actualizada y simulación aprobada")}</div>
          )}
          <div className="flex gap-2">
            <button disabled={!canSign} onClick={handleSwap} className={button}>{ui("Execute Swap", "Firmar y ejecutar swap")}</button>
            <button onClick={() => setState('skipped')} className={skip}>{ui("Skip", "Omitir")}</button>
          </div>
          {execution.revokeTx && <button onClick={handleRevoke} className="w-full py-1 text-white/40 hover:text-white/70 border border-white/10 rounded">{ui(`Revoke ${fromToken} allowance instead (approve 0)`, `Revocar permiso de ${fromToken} (aprobar 0)`)}</button>}
        </div>
      )}
      {state === 'swapping' && <div className="flex items-center gap-2 text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />{ui("Swapping… waiting for the receipt", "Procesando swap… esperando el recibo")}</div>}
      {state === 'verifying' && <div className="flex items-center gap-2 text-amber-400"><Loader2 className="w-3 h-3 animate-spin" />{ui(`Mined. Verifying the receipt on ${BASE.name}…`, `Minada. Verificando el recibo en ${BASE.name}…`)}</div>}
      {state === 'confirmed' && swapTxHash && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-400"><CheckCircle className="w-3 h-3" />{ui("Confirmed on-chain", "Confirmado en cadena")}</div>
          {receiptNote && <div className="text-white/50">{receiptNote}</div>}
          <a href={`${BASE.explorerUrl}/tx/${swapTxHash}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-green-400/60 hover:text-green-400 transition-colors">
            <ExternalLink className="w-3 h-3" />{ui(`View on ${BASE.explorerName}`, `Ver en ${BASE.explorerName}`)}
          </a>
        </div>
      )}
      {state === 'unrecorded' && swapTxHash && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-400"><XCircle className="w-3 h-3" />{ui("Mined, not recorded", "Minada, sin registrar")}</div>
          {receiptNote && <div className="text-white/50">{receiptNote}</div>}
          <div className="flex gap-2">
            <button onClick={() => { setState('verifying'); void submitReceipt(swapTxHash).catch((e) => { setState('unrecorded'); setReceiptNote(localizedSwapError(e, ui('Could not record the receipt. Retry in a moment.', 'No pude registrar el recibo. Reintenta en un momento.'))); }); }} className={button}>{ui("Retry record", "Reintentar registro")}</button>
            <a href={`${BASE.explorerUrl}/tx/${swapTxHash}`} target="_blank" rel="noopener noreferrer" className={`${skip} flex items-center gap-1`}><ExternalLink className="w-3 h-3" />{BASE.explorerName}</a>
          </div>
        </div>
      )}
      {state === 'error' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-red-400"><XCircle className="w-3 h-3" />{errorMsg || ui('Transaction failed', "La transacción falló")}</div>
          <button onClick={() => { setState(execution ? stateFor(execution) : 'intent'); setErrorMsg(''); }} className="text-white/30 hover:text-white/60 transition-colors">{ui("Retry", "Reintentar")}</button>
        </div>
      )}
    </div>
  );
}
