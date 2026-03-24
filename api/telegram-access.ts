// ============================================================
// /api/telegram-access — x402 Payment Gate for Telegram Groups
//
// GET ?session=<id>  → Returns 402 Payment Required
// POST ?session=<id> → Receives payment proof, verifies, activates
// GET ?status&group_id=<id> → Bot checks if group is active
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const config = { maxDuration: 30 };

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

const PAYMENT_CONFIG = {
  network: 'eip155:196', // X Layer
  asset: 'OKB',
  amountAtomic: '100000000000000000', // 0.1 OKB (~$8)
  amountHuman: '$8/month (0.1 OKB)',
  payTo: '0xc3f836ec06a2202af23e59997a613ca0722f35d1',
  accessDays: 30,
};

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SB_SERVICE_KEY) return res.status(500).json({ error: 'Server misconfigured' });
  const supabase = createClient(SB_URL, SB_SERVICE_KEY);

  // === Bot status check: GET /api/telegram-access?status&group_id=123 ===
  if (req.method === 'GET' && req.query.status !== undefined) {
    const groupId = req.query.group_id;
    if (!groupId) return res.status(400).json({ error: 'group_id required' });

    const { data: sub } = await supabase
      .from('telegram_subscriptions')
      .select('status, expires_at')
      .eq('telegram_group_id', Number(groupId))
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.status(200).json({
      active: !!sub,
      expires_at: sub?.expires_at || null,
    });
  }

  // === Create session + return 402: GET /api/telegram-access?group_id=123&wallet=0x... ===
  if (req.method === 'GET') {
    const groupId = Number(req.query.group_id);
    const wallet = typeof req.query.wallet === 'string' ? req.query.wallet.toLowerCase() : null;

    if (!groupId) return res.status(400).json({ error: 'group_id required' });

    // Check group exists
    const { data: group } = await supabase
      .from('telegram_groups')
      .select('*')
      .eq('telegram_group_id', groupId)
      .single();

    if (!group) return res.status(404).json({ error: 'Group not found. Add @Bobbyagentraderbot to your group first.' });

    // Check if already active
    const { data: activeSub } = await supabase
      .from('telegram_subscriptions')
      .select('status, expires_at')
      .eq('telegram_group_id', groupId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .maybeSingle();

    if (activeSub) {
      return res.status(200).json({ ok: true, already_active: true, expires_at: activeSub.expires_at });
    }

    // Create activation session
    const reference = crypto.randomUUID();
    const resource = `/api/telegram-access/activate?session=${reference}`;
    const validUntil = new Date(Date.now() + 3600000); // 1 hour

    await supabase.from('telegram_activation_sessions').insert({
      telegram_group_id: groupId,
      telegram_user_id: group.added_by_telegram_user_id || 0,
      payer_wallet_address: wallet,
      x402_reference: reference,
      resource,
      payment_asset: PAYMENT_CONFIG.asset,
      payment_amount_atomic: PAYMENT_CONFIG.amountAtomic,
      pay_to: PAYMENT_CONFIG.payTo,
      valid_until: validUntil.toISOString(),
      status: 'pending',
    });

    // Return 402 with x402 payload
    const payload = {
      x402Version: 1,
      error: 'Payment Required',
      resource: { url: resource, description: `Activate Bobby Agent Trader in "${group.telegram_group_name}"` },
      accepts: [{
        scheme: 'exact',
        network: PAYMENT_CONFIG.network,
        maxAmountRequired: PAYMENT_CONFIG.amountAtomic,
        asset: PAYMENT_CONFIG.asset,
        payTo: PAYMENT_CONFIG.payTo,
        maxTimeoutSeconds: 3600,
        extra: {
          reference,
          groupId,
          groupName: group.telegram_group_name,
          accessDays: PAYMENT_CONFIG.accessDays,
        },
      }],
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    res.setHeader('X-Payment-Required', payloadBase64);

    return res.status(402).json({
      error: 'Payment Required',
      protocol: 'x402',
      network: PAYMENT_CONFIG.network,
      amount: PAYMENT_CONFIG.amountHuman,
      asset: PAYMENT_CONFIG.asset,
      payTo: PAYMENT_CONFIG.payTo,
      groupName: group.telegram_group_name,
      accessDays: PAYMENT_CONFIG.accessDays,
      session: reference,
      payload: payloadBase64,
    });
  }

  // === Activate after payment: POST /api/telegram-access ===
  if (req.method === 'POST') {
    const { session, wallet_address, payment_proof, tx_hash } = req.body || {};

    if (!session) return res.status(400).json({ error: 'session required' });

    // Load session
    const { data: sessionData } = await supabase
      .from('telegram_activation_sessions')
      .select('*')
      .eq('x402_reference', session)
      .eq('status', 'pending')
      .single();

    if (!sessionData) return res.status(404).json({ error: 'Session not found or already consumed' });

    // Check expiry
    if (new Date(sessionData.valid_until) < new Date()) {
      await supabase.from('telegram_activation_sessions').update({ status: 'expired' }).eq('id', sessionData.id);
      return res.status(410).json({ error: 'Session expired. Please request a new one.' });
    }

    // P0 FIX: Verify tx_hash on-chain before activating
    if (!tx_hash || typeof tx_hash !== 'string' || !tx_hash.startsWith('0x')) {
      return res.status(400).json({ error: 'Valid tx_hash required' });
    }

    // Check tx_hash not already used (anti-replay)
    const { data: existingTx } = await supabase
      .from('telegram_subscriptions')
      .select('id')
      .eq('payment_tx_hash', tx_hash)
      .maybeSingle();

    if (existingTx) {
      return res.status(409).json({ error: 'This transaction has already been used for activation' });
    }

    // Verify transaction on X Layer blockchain
    try {
      const rpcUrl = 'https://rpc.xlayer.tech';
      const txRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [tx_hash] }),
      });
      const txData = await txRes.json();
      const tx = txData.result;

      if (!tx) {
        return res.status(400).json({ error: 'Transaction not found on X Layer. Please wait for confirmation.' });
      }

      // Verify recipient
      if (tx.to?.toLowerCase() !== PAYMENT_CONFIG.payTo.toLowerCase()) {
        return res.status(400).json({ error: `Payment sent to wrong address. Expected ${PAYMENT_CONFIG.payTo}` });
      }

      // Verify sender matches claimed wallet
      if (wallet_address && tx.from?.toLowerCase() !== wallet_address.toLowerCase()) {
        return res.status(400).json({ error: 'Transaction sender does not match connected wallet' });
      }

      // Verify amount (0.1 OKB = 1e17 wei = 0x16345785d8a0000)
      const txValue = BigInt(tx.value || '0');
      const expectedValue = BigInt(PAYMENT_CONFIG.amountAtomic);
      if (txValue < expectedValue) {
        return res.status(400).json({ error: `Insufficient payment. Expected ${PAYMENT_CONFIG.amountHuman}` });
      }

      // Verify transaction receipt (success)
      const receiptRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getTransactionReceipt', params: [tx_hash] }),
      });
      const receiptData = await receiptRes.json();
      if (!receiptData.result || receiptData.result.status !== '0x1') {
        return res.status(400).json({ error: 'Transaction failed or not yet confirmed' });
      }

      // P0 FIX: Verify tx happened AFTER session was created (prevent old tx replay)
      const blockNumber = receiptData.result.blockNumber;
      if (blockNumber) {
        const blockRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'eth_getBlockByNumber', params: [blockNumber, false] }),
        });
        const blockData = await blockRes.json();
        if (blockData.result?.timestamp) {
          const blockTime = parseInt(blockData.result.timestamp, 16) * 1000;
          const sessionCreated = new Date(sessionData.created_at).getTime();
          // Allow 5 min buffer before session creation (clock drift)
          if (blockTime < sessionCreated - 5 * 60 * 1000) {
            return res.status(400).json({ error: 'Transaction is older than this activation session. Please make a new payment.' });
          }
        }
      }
    } catch (verifyErr) {
      console.error('[telegram-access] TX verification error:', verifyErr);
      return res.status(502).json({ error: 'Could not verify transaction on X Layer. Please try again.' });
    }

    const payloadHash = crypto.createHash('sha256').update(tx_hash).digest('hex');

    // Create subscription FIRST (per Codex P2 fix — correct order)
    const expiresAt = new Date(Date.now() + PAYMENT_CONFIG.accessDays * 24 * 60 * 60 * 1000);
    await supabase.from('telegram_subscriptions').insert({
      telegram_group_id: sessionData.telegram_group_id,
      payer_wallet_address: wallet_address?.toLowerCase() || 'unknown',
      payment_tx_hash: tx_hash,
      payment_asset: PAYMENT_CONFIG.asset,
      payment_amount_atomic: PAYMENT_CONFIG.amountAtomic,
      chain_id: 196,
      x402_reference: session,
      activated_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      status: 'active',
    });

    // Activate group
    await supabase.from('telegram_groups')
      .update({ bot_status: 'active' })
      .eq('telegram_group_id', sessionData.telegram_group_id);

    // Mark session consumed LAST (per Codex P2 — correct order)
    await supabase.from('telegram_activation_sessions').update({
      status: 'consumed',
      payer_wallet_address: wallet_address?.toLowerCase() || null,
      payment_payload_hash: payloadHash,
    }).eq('id', sessionData.id);

    // Notify group
    await sendTelegramMessage(sessionData.telegram_group_id,
      `✅ <b>Bobby Agent Trader ACTIVATED!</b>\n\n` +
      `Multi-agent trading intelligence is now live in this group.\n\n` +
      `🟢 Alpha Hunter — scanning opportunities\n` +
      `🔴 Red Team — challenging theses\n` +
      `🟡 CIO — making decisions\n\n` +
      `Try: <code>/analyze BTC</code>\n\n` +
      `Access expires: ${expiresAt.toLocaleDateString()}\n` +
      `<i>Powered by x402 on OKX X Layer</i>`
    );

    return res.status(200).json({
      ok: true,
      activated: true,
      group_id: sessionData.telegram_group_id,
      expires_at: expiresAt.toISOString(),
      tx_hash: tx_hash || payloadHash,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
