// ============================================================
// Bobby Telegram Bot Preview — Stitch chat interface
// Multi-agent cluster response, voice waveform, group CTA
// Static preview page showcasing the Telegram bot experience
// ============================================================

import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { useAccount, useSendTransaction, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { parseUnits } from 'viem';
import { useAppKit } from '@reown/appkit/react';
import { Check, Loader2, AlertTriangle } from 'lucide-react';
import KineticShell from '@/components/kinetic/KineticShell';

// Payment config — X Layer (Chain 196)
// Bobby treasury wallet (NOT the user's wallet)
const BOBBY_WALLET = '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea' as `0x${string}`;
const USDT_CONTRACT = '0x1E4a5963aBFD975d8c9021ce480b42188849D41d' as `0x${string}`;
const PAYMENT_AMOUNT_OKB = BigInt('1000000000000000'); // 0.001 OKB
const PAYMENT_AMOUNT_USDT = BigInt('10000'); // 0.01 USDT (6 decimals)
const XLAYER_CHAIN_ID = 196;

const DEMO_CONVERSATION = [
  {
    type: 'user',
    text: 'Bobby, should I long BTC?',
    time: '14:02',
  },
  {
    type: 'bobby',
    agents: [
      {
        name: 'Alpha Hunter',
        stance: 'BULLISH',
        color: 'border-green-500',
        textColor: 'text-green-400',
        text: 'Order flow accumulation at $64.2k support. Rising wedge breakout on 4H. Volume divergence confirms buyer pressure. Entry zone: $64,100–$64,400.',
      },
      {
        name: 'Red Team',
        stance: 'CAUTION',
        color: 'border-red-500',
        textColor: 'text-red-400',
        text: 'CPI data release in 6 hours — high volatility expected. Liquidity grab below $63.8k likely before any sustained move. Risk of fake breakout.',
      },
    ],
    verdict: {
      action: 'MODERATE LONG',
      conviction: 74,
      reasoning: 'Bullish structure valid but macro risk demands caution. Half-size entry at $64.2k with tight stop at $63.6k. Scale in after CPI if structure holds.',
    },
    time: '14:02',
  },
];

export default function BobbyTelegramPage() {
  const [searchParams] = useSearchParams();
  const activateGroupId = searchParams.get('activate');
  const { address, isConnected } = useAccount();
  const { open: openWallet } = useAppKit();

  const [groupInfo, setGroupInfo] = useState<{ name: string; status: string } | null>(null);
  const [paymentState, setPaymentState] = useState<'idle' | 'connected' | 'signing' | 'verifying' | 'success' | 'error'>('idle');
  const [paymentError, setPaymentError] = useState('');
  const [session, setSession] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [payToken, setPayToken] = useState<'OKB' | 'USDT'>('OKB');

  // OKB native transfer
  const { sendTransaction, data: sendTxHash } = useSendTransaction();
  // USDT ERC-20 transfer
  const { writeContract, data: writeTxHash } = useWriteContract();
  const { switchChain } = useSwitchChain();

  // Pick whichever hash exists
  const pendingTxHash = sendTxHash || writeTxHash;

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: pendingTxHash,
  });

  // When tx is confirmed, activate the group
  useEffect(() => {
    if (isConfirmed && pendingTxHash && session && paymentState === 'verifying') {
      activateGroup(pendingTxHash, session);
    }
  }, [isConfirmed, pendingTxHash, session]);

  // If ?activate=GROUP_ID, fetch group info
  useEffect(() => {
    if (!activateGroupId) return;
    fetch(`/api/telegram-access?status&group_id=${activateGroupId}`)
      .then(r => r.json())
      .then(d => {
        if (d.active) {
          setGroupInfo({ name: 'Group', status: 'active' });
          setPaymentState('success');
        }
      })
      .catch(() => {});
    const SB = 'https://egpixaunlnzauztbrnuz.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';
    fetch(`${SB}/rest/v1/telegram_groups?telegram_group_id=eq.${activateGroupId}&select=telegram_group_name,bot_status`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    }).then(r => r.json()).then(d => {
      if (Array.isArray(d) && d.length > 0) {
        setGroupInfo({ name: d[0].telegram_group_name || 'Your Group', status: d[0].bot_status });
      }
    }).catch(() => {});
  }, [activateGroupId]);

  // Update state when wallet connects (NO auto-trigger — explicit 2-step per Codex)
  useEffect(() => {
    if (isConnected && address && paymentState === 'idle' && activateGroupId) {
      setPaymentState('connected');
    }
  }, [isConnected, address, activateGroupId]);

  // Step 1: Connect wallet
  const handleConnect = () => {
    openWallet();
  };

  // Step 2: Sign real USDT transfer on X Layer
  const handlePay = async () => {
    if (!isConnected || !address || !activateGroupId) return;

    setPaymentState('signing');
    setPaymentError('');

    try {
      // Create session first
      const sessionRes = await fetch(`/api/telegram-access?group_id=${activateGroupId}&wallet=${address}`);
      const sessionData = await sessionRes.json();

      if (sessionData.already_active) {
        setPaymentState('success');
        return;
      }

      if (!sessionData.session) {
        setPaymentError('Could not create payment session');
        setPaymentState('error');
        return;
      }

      setSession(sessionData.session);

      const onSuccess = (hash: string) => { setTxHash(hash); setPaymentState('verifying'); };
      const onError = (error: any) => {
        if (error.message?.includes('rejected') || error.code === 4001) {
          setPaymentError('Transaction rejected. Please try again.');
        } else if (error.message?.includes('insufficient')) {
          setPaymentError(`Insufficient ${payToken} balance on X Layer.`);
        } else {
          setPaymentError(error.message?.slice(0, 100) || 'Transaction failed');
        }
        setPaymentState('error');
      };

      if (payToken === 'OKB') {
        // Native OKB transfer
        sendTransaction({
          to: BOBBY_WALLET,
          value: PAYMENT_AMOUNT_OKB,
          chainId: XLAYER_CHAIN_ID,
        }, { onSuccess, onError });
      } else {
        // USDT ERC-20 transfer
        writeContract({
          address: USDT_CONTRACT,
          abi: [{ name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
          functionName: 'transfer',
          args: [BOBBY_WALLET, PAYMENT_AMOUNT_USDT],
          chainId: XLAYER_CHAIN_ID,
        }, { onSuccess, onError });
      }
    } catch (err) {
      setPaymentError('Connection error');
      setPaymentState('error');
    }
  };

  // Step 3: Activate group after tx confirmed
  const activateGroup = async (hash: string, sessionId: string) => {
    try {
      const activateRes = await fetch('/api/telegram-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: sessionId,
          wallet_address: address,
          tx_hash: hash,
        }),
      });
      const result = await activateRes.json();
      if (result.ok) {
        setPaymentState('success');
      } else {
        setPaymentError(result.error || 'Activation failed');
        setPaymentState('error');
      }
    } catch {
      setPaymentError('Failed to activate group');
      setPaymentState('error');
    }
  };

  return (
    <KineticShell activeTab="terminal">
      <Helmet><title>Telegram | Bobby Agent Trader</title></Helmet>

      <div className="max-w-md mx-auto px-5 pt-6 pb-20">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <span className="text-[8px] font-mono text-green-400/40 tracking-widest">TELEGRAM_INTEGRATION</span>
          <h1 className="text-2xl font-black tracking-tight mt-1">Your Agent on Telegram</h1>
          <p className="text-[10px] font-mono text-white/30 mt-2 max-w-xs mx-auto leading-relaxed">
            Get your agent's debates and signals directly in Telegram. Three agents debate — you decide.
          </p>
        </motion.div>

        {/* Activation Flow — 6-state payment (Gemini UX design) */}
        {activateGroupId && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-px rounded ${paymentState === 'success' ? 'bg-gradient-to-r from-green-500/40 via-green-400/20 to-green-500/40' : paymentState === 'error' ? 'bg-gradient-to-r from-red-500/30 via-red-400/10 to-red-500/30' : 'bg-gradient-to-r from-green-500/30 via-green-400/10 to-green-500/30'}`}>
            <div className="bg-[#0a0a0a] rounded p-5 text-center"
              style={paymentState === 'success' ? { boxShadow: '0 0 30px rgba(0,255,102,0.1)' } : undefined}>

              {/* STATE: SUCCESS */}
              {paymentState === 'success' && (
                <>
                  <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-xl font-black text-green-400 mb-1">BOBBY IS LIVE</h3>
                  <p className="text-[10px] font-mono text-white/40 mb-1">{groupInfo?.name || 'Your group'}</p>
                  <p className="text-[9px] font-mono text-white/20 mb-4">Bobby is now fully integrated.</p>
                  {txHash && (
                    <a href={`https://www.oklink.com/xlayer/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                      className="text-[8px] font-mono text-green-400/40 hover:text-green-400 mb-3 block">
                      TX: {txHash.slice(0, 10)}...{txHash.slice(-6)} · View on Explorer →
                    </a>
                  )}
                  <a href="https://t.me/Bobbyagentraderbot" target="_blank" rel="noopener noreferrer"
                    className="inline-block w-full px-6 py-3 bg-green-500 text-black font-mono text-[10px] font-black tracking-widest rounded active:scale-95 transition-all"
                    style={{ boxShadow: '0 0 20px rgba(34,197,94,0.3)' }}>
                    OPEN IN TELEGRAM →
                  </a>
                  <button onClick={() => { navigator.clipboard.writeText('https://t.me/Bobbyagentraderbot'); }}
                    className="text-[8px] font-mono text-white/15 mt-2 hover:text-white/30 transition-colors block">
                    Link not working? Click to copy: t.me/Bobbyagentraderbot
                  </button>
                  <p className="text-[8px] font-mono text-white/15 mt-2">
                    Bot not responding? Make sure Bobby has admin privileges.{' '}
                    <a href="https://t.me/Bobbyagentraderbot" className="text-green-400/40 hover:text-green-400">Contact Support</a>
                  </p>
                </>
              )}

              {/* STATE: ERROR */}
              {paymentState === 'error' && (
                <>
                  <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto mb-3">
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-black text-red-400 mb-1">ACTIVATION FAILED</h3>
                  <p className="text-[10px] font-mono text-white/30 mb-4">{paymentError}</p>
                  <button onClick={() => { setPaymentState('connected'); setPaymentError(''); }}
                    className="w-full py-3 bg-white/[0.06] text-white/60 font-mono text-[10px] font-black tracking-widest rounded hover:bg-white/[0.1] transition-all">
                    RETRY TRANSACTION
                  </button>
                </>
              )}

              {/* STATE: SIGNING */}
              {paymentState === 'signing' && (
                <>
                  <Loader2 className="w-10 h-10 text-green-400 animate-spin mx-auto mb-3" />
                  <h3 className="text-sm font-black mb-1">AWAITING SIGNATURE...</h3>
                  <p className="text-[10px] font-mono text-white/30">Please confirm the transaction in your wallet.</p>
                  <p className="text-[8px] font-mono text-white/15 mt-2">Do not close this window.</p>
                </>
              )}

              {/* STATE: VERIFYING */}
              {paymentState === 'verifying' && (
                <>
                  <Loader2 className="w-10 h-10 text-amber-400 animate-spin mx-auto mb-3" />
                  <h3 className="text-sm font-black text-amber-400 mb-1">VERIFYING ON X LAYER...</h3>
                  {pendingTxHash && <p className="text-[9px] font-mono text-white/30">TX: {pendingTxHash.slice(0, 14)}...</p>}
                  <p className="text-[8px] font-mono text-white/15 mt-2">Block confirmation pending...</p>
                </>
              )}

              {/* STATE: IDLE (not connected) or CONNECTED (ready to pay) */}
              {(paymentState === 'idle' || paymentState === 'connected') && (
                <>
                  <div className="w-10 h-10 rounded bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-3">
                    <span className="text-green-400 text-lg">⚡</span>
                  </div>
                  <h3 className="text-sm font-black mb-1">
                    ACTIVATE BOBBY IN {groupInfo?.name?.toUpperCase() || 'YOUR GROUP'}
                  </h3>

                  {/* Wallet connected indicator */}
                  {isConnected && address && (
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-[9px] font-mono text-green-400/60">{address.slice(0, 6)}...{address.slice(-4)}</span>
                    </div>
                  )}

                  {/* Receipt */}
                  <div className="bg-white/[0.02] border border-white/[0.06] rounded p-3 mb-4 text-left">
                    <div className="flex justify-between text-[9px] font-mono mb-1">
                      <span className="text-white/30">GROUP</span>
                      <span className="text-white/60">{groupInfo?.name || 'Loading...'}</span>
                    </div>
                    <div className="flex justify-between text-[9px] font-mono mb-1">
                      <span className="text-white/30">NETWORK</span>
                      <span className="text-white/60">X Layer (196)</span>
                    </div>
                    <div className="flex justify-between text-[9px] font-mono mb-1">
                      <span className="text-white/30">DURATION</span>
                      <span className="text-white/60">30 Days Prepaid</span>
                    </div>
                    <div className="flex justify-between text-[9px] font-mono mb-1">
                      <span className="text-white/30">AUTO-RENEW</span>
                      <span className="text-white/60">OFF (You control)</span>
                    </div>
                    <div className="flex justify-between text-[9px] font-mono mb-1">
                      <span className="text-white/30">PAY TO</span>
                      <span className="text-green-400/60">{BOBBY_WALLET.slice(0, 6)}...{BOBBY_WALLET.slice(-4)}</span>
                    </div>
                    {/* Token selector */}
                    <div className="flex gap-2 mt-2 pt-2 border-t border-white/[0.06] mb-2">
                      <button onClick={() => setPayToken('OKB')}
                        className={`flex-1 py-1.5 rounded text-[9px] font-mono font-bold transition-all ${payToken === 'OKB' ? 'bg-green-500/20 border border-green-500/40 text-green-400' : 'bg-white/[0.03] border border-white/[0.06] text-white/30'}`}>
                        0.001 OKB
                      </button>
                      <button onClick={() => setPayToken('USDT')}
                        className={`flex-1 py-1.5 rounded text-[9px] font-mono font-bold transition-all ${payToken === 'USDT' ? 'bg-green-500/20 border border-green-500/40 text-green-400' : 'bg-white/[0.03] border border-white/[0.06] text-white/30'}`}>
                        0.01 USDT
                      </button>
                    </div>
                    <div className="flex justify-between text-[9px] font-mono">
                      <span className="text-white/40">COST</span>
                      <span className="text-green-400 font-bold text-sm">{payToken === 'OKB' ? '0.001 OKB' : '0.01 USDT'}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      <span className="text-[7px]">🛡</span>
                      <span className="text-[7px] font-mono text-white/20">Secured by OKX X Layer (Chain 196)</span>
                    </div>
                  </div>

                  {/* Step 1: Connect OR Step 2: Pay */}
                  {!isConnected ? (
                    <button onClick={handleConnect}
                      className="w-full py-3 bg-green-500 text-black font-mono text-[10px] font-black tracking-widest rounded active:scale-95 transition-all"
                      style={{ boxShadow: '0 0 20px rgba(34,197,94,0.3)' }}>
                      CONNECT WALLET TO INITIALIZE
                    </button>
                  ) : (
                    <>
                      <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded p-2 mb-3">
                        <p className="text-[9px] font-mono text-amber-400/70">
                          Wallet authorized. Broadcast activation onto X Layer.
                        </p>
                      </div>
                      <button onClick={handlePay}
                        className="w-full py-3 bg-green-500 text-black font-mono text-[10px] font-black tracking-widest rounded active:scale-95 transition-all animate-pulse"
                        style={{ boxShadow: '0 0 20px rgba(34,197,94,0.3)' }}>
                        SIGN & PAY {payToken === 'OKB' ? '0.001 OKB' : '0.01 USDT'}
                      </button>
                    </>
                  )}
                  <p className="text-[7px] font-mono text-white/15 mt-2 leading-relaxed">
                    Payments are final and non-refundable. Service activates immediately upon block confirmation. Cancel anytime by removing the bot from your group.
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Chat Preview */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="space-y-4 mb-8">

          {/* Date separator */}
          <div className="text-center">
            <span className="text-[9px] font-mono text-white/20 bg-white/[0.03] px-3 py-1 rounded-full">Today, 14:02 UTC</span>
          </div>

          {/* User message */}
          <div className="flex justify-end">
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl rounded-tr-none px-4 py-2.5 max-w-[75%]">
              <p className="text-sm text-white/80">{DEMO_CONVERSATION[0].text}</p>
              <span className="text-[8px] text-white/20 font-mono mt-1 block text-right">{DEMO_CONVERSATION[0].time} ✓✓</span>
            </div>
          </div>

          {/* Bobby cluster response */}
          <div className="flex justify-start">
            <div className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] rounded-xl rounded-tl-none p-4 max-w-[90%] space-y-3">
              {/* Agent analyses */}
              {DEMO_CONVERSATION[1].agents!.map((agent, i) => (
                <motion.div key={agent.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.15 }}
                  className={`border-l-4 ${agent.color} pl-3 py-1`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-mono font-bold ${agent.textColor}`}>{agent.name}</span>
                    <span className={`text-[7px] font-mono px-1.5 py-0.5 rounded ${
                      agent.stance === 'BULLISH' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                    }`}>{agent.stance}</span>
                  </div>
                  <p className="text-[10px] text-white/40 leading-relaxed">{agent.text}</p>
                </motion.div>
              ))}

              {/* Gradient divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

              {/* Bobby's Verdict */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-mono font-bold text-yellow-400">Bobby's Verdict</span>
                  <span className="text-[7px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">{DEMO_CONVERSATION[1].verdict!.action}</span>
                </div>
                <p className="text-[10px] text-white/50 leading-relaxed mb-3">{DEMO_CONVERSATION[1].verdict!.reasoning}</p>

                {/* Conviction bar */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${DEMO_CONVERSATION[1].verdict!.conviction}%`, boxShadow: '0 0 8px rgba(34,197,94,0.4)' }} />
                  </div>
                  <span className="text-[10px] font-mono text-green-400 font-bold">{DEMO_CONVERSATION[1].verdict!.conviction}%</span>
                </div>

                {/* Voice note mock */}
                <div className="mt-3 flex items-center gap-3 bg-white/[0.02] border border-white/[0.04] rounded p-2">
                  <button className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-green-400 text-xs ml-0.5">▶</span>
                  </button>
                  <div className="flex-1 flex items-center gap-[2px] h-5">
                    {[45, 70, 35, 80, 55, 90, 40, 75, 50, 85, 30, 65, 45, 78, 38, 60].map((h, i) => (
                      <div key={i} className="flex-1 bg-green-400/30 rounded-full" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <span className="text-[9px] font-mono text-white/20 flex-shrink-0">0:12</span>
                </div>
              </motion.div>

              <span className="text-[8px] text-white/15 font-mono block text-right">{DEMO_CONVERSATION[1].time}</span>
            </div>
          </div>
        </motion.div>

        {/* Deploy to Telegram Group — x402 payment flow */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
          <div className="p-px rounded bg-gradient-to-r from-green-500/30 via-green-400/10 to-green-500/30">
            <div className="bg-[#0a0a0a] rounded p-5 text-center">
              <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-lg">⚡</span>
              </div>
              <h3 className="text-sm font-bold mb-1">ACTIVATE BOBBY IN YOUR GROUP</h3>
              <p className="text-[10px] font-mono text-white/30 mb-3 max-w-xs mx-auto">
                Activate Bobby in your Telegram group. Multi-agent trading intelligence, voice notes, real-time signals.
              </p>
              {/* Payment info */}
              <div className="bg-white/[0.02] border border-white/[0.06] rounded p-3 mb-4 max-w-xs mx-auto">
                <div className="flex justify-between text-[9px] font-mono mb-1">
                  <span className="text-white/30">SERVICE</span>
                  <span className="text-white/60">Bobby Agent Trader</span>
                </div>
                <div className="flex justify-between text-[9px] font-mono mb-1">
                  <span className="text-white/30">NETWORK</span>
                  <span className="text-white/60">X Layer (196)</span>
                </div>
                <div className="flex justify-between text-[9px] font-mono mb-1">
                  <span className="text-white/30">ACCESS</span>
                  <span className="text-white/60">30 Days</span>
                </div>
                <div className="flex justify-between text-[9px] font-mono mt-2 pt-2 border-t border-white/[0.06]">
                  <span className="text-white/40">COST</span>
                  <span className="text-green-400 font-bold text-sm">0.1 OKB (~$8)</span>
                </div>
              </div>

              <a href="https://t.me/Bobbyagentraderbot?startgroup=true" target="_blank" rel="noopener noreferrer"
                className="inline-block w-full max-w-xs px-6 py-3 bg-green-500 text-black font-mono text-[10px] font-black tracking-widest rounded active:scale-95 transition-all"
                style={{ boxShadow: '0 0 20px rgba(34,197,94,0.3)' }}>
                STEP 1: ADD BOT TO GROUP →
              </a>
              <p className="text-[8px] font-mono text-white/15 mt-2">
                After adding, Bobby will send you a payment link to activate.
              </p>
              <button onClick={() => navigator.clipboard.writeText('https://t.me/Bobbyagentraderbot?startgroup=true')}
                className="text-[7px] font-mono text-white/10 mt-1 hover:text-white/25 transition-colors">
                Desktop? Click to copy link
              </button>
            </div>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
          className="mt-6 grid grid-cols-2 gap-2">
          {[
            { label: 'MULTI_AGENT', desc: '3 AI agents debate' },
            { label: 'VOICE_NOTES', desc: 'Audio responses' },
            { label: 'REAL_TIME', desc: 'OKX market data' },
            { label: 'ON_CHAIN', desc: 'X Layer verified' },
          ].map(f => (
            <div key={f.label} className="bg-white/[0.02] border border-white/[0.04] rounded p-3">
              <span className="text-[8px] font-mono text-green-400/50 tracking-widest">{f.label}</span>
              <p className="text-[10px] font-mono text-white/40 mt-0.5">{f.desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Back link */}
        <div className="mt-6 text-center">
          <Link to="/agentic-world/bobby" className="text-[9px] font-mono text-white/20 hover:text-green-400 transition-colors">
            ← BACK_TO_TERMINAL
          </Link>
        </div>
      </div>
    </KineticShell>
  );
}
