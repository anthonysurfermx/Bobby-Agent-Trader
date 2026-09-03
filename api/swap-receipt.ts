// Verified Base swap receipts shared by web and iOS.
// The client submits only a tx hash plus the quote it displayed. The server
// re-reads Base, verifies sender/router/calldata/status, then persists.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getAddress, type Address, type Hex } from 'viem';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { BASE_SWAP_CHAIN_ID } from '../src/lib/base-swap/tokens.js';
import { baseClient, decodeSwapTx, resolvePair, SWAP_ROUTER02 } from './_lib/base-swap.js';
import { requireIdentity } from './_lib/user-identity.js';
import { guardWrite, WALLET_RE } from './_lib/write-guard.js';

export const config = { maxDuration: 20 };

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const UINT_RE = /^\d{1,78}$/;
const Body = z.object({
  wallet: z.string().regex(WALLET_RE),
  txHash: z.string().regex(HASH_RE),
  tokenIn: z.string().trim().min(1).max(64),
  tokenOut: z.string().trim().min(1).max(64),
  amountInRaw: z.string().regex(UINT_RE),
  minAmountOutRaw: z.string().regex(UINT_RE),
});

function addressEq(a: unknown, b: Address): boolean {
  return typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const identity = await requireIdentity(req, res);
    if (!identity) return;
    const filters = identity.wallet
      ? `or=(identity_id.eq.${identity.id},wallet_address.eq.${identity.wallet})`
      : `identity_id=eq.${identity.id}`;
    const r = await fetch(bobbyRest(`bobby_swap_receipts?${filters}&order=block_timestamp.desc&limit=100&select=*`), { headers: bobbyServiceHeaders() });
    if (!r.ok) return res.status(502).json({ error: 'Could not read swap history' });
    return res.status(200).json({ ok: true, receipts: await r.json() });
  }

  const guarded = await guardWrite(req, res, {
    methods: ['POST'], scope: 'swap-receipt', schema: Body,
    perIp: { limit: 30, windowSec: 600 },
    perSubject: { key: (_body, wallet) => wallet, limit: 60, windowSec: 3600 },
  });
  if (!guarded) return;
  const identity = await requireIdentity(req, res);
  if (!identity || !guarded.wallet) return;
  const body = guarded.body;

  try {
    const { tokenIn, tokenOut } = resolvePair(body.tokenIn, body.tokenOut);
    if (tokenIn.assetClass !== 'tokenized-stock' && tokenOut.assetClass !== 'tokenized-stock') {
      return res.status(400).json({ error: 'Only tokenized-stock receipts are accepted here' });
    }
    const client = baseClient();
    const hash = body.txHash as Hex;
    const [tx, receipt] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })]);
    if (receipt.status !== 'success') return res.status(409).json({ error: 'Transaction did not succeed on Base' });
    if (!addressEq(tx.from, getAddress(guarded.wallet))) return res.status(403).json({ error: 'Transaction sender does not match session wallet' });
    if (!tx.to || !addressEq(tx.to, SWAP_ROUTER02)) return res.status(400).json({ error: 'Transaction did not target the pinned Uniswap router' });

    const decoded = decodeSwapTx(tx.input);
    const swapCall = decoded.calls.find((call) => call.functionName === 'exactInputSingle');
    if (!swapCall) return res.status(400).json({ error: 'Unsupported swap calldata shape' });
    const params = swapCall.args[0] as { tokenIn?: Address; tokenOut?: Address; recipient?: Address; amountIn?: bigint; amountOutMinimum?: bigint };
    if (!addressEq(params.tokenIn, getAddress(tokenIn.address)) || !addressEq(params.tokenOut, getAddress(tokenOut.address))) {
      return res.status(400).json({ error: 'Onchain token pair does not match the displayed quote' });
    }
    if (!addressEq(params.recipient, getAddress(guarded.wallet))) return res.status(400).json({ error: 'Swap recipient does not match session wallet' });
    if (params.amountIn !== BigInt(body.amountInRaw) || params.amountOutMinimum !== BigInt(body.minAmountOutRaw)) {
      return res.status(400).json({ error: 'Onchain amounts do not match the displayed quote' });
    }
    if (Number(tx.chainId) !== BASE_SWAP_CHAIN_ID) return res.status(400).json({ error: 'Wrong chain' });
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const row = {
      identity_id: identity.id,
      wallet_address: guarded.wallet,
      chain_id: BASE_SWAP_CHAIN_ID,
      tx_hash: hash.toLowerCase(),
      router_address: SWAP_ROUTER02.toLowerCase(),
      token_in_address: tokenIn.address.toLowerCase(),
      token_out_address: tokenOut.address.toLowerCase(),
      token_in_symbol: tokenIn.symbol,
      token_out_symbol: tokenOut.symbol,
      amount_in_raw: body.amountInRaw,
      min_amount_out_raw: body.minAmountOutRaw,
      block_number: receipt.blockNumber.toString(),
      block_timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      platform: 'web',
    };
    const stored = await fetch(bobbyRest('bobby_swap_receipts?on_conflict=chain_id,tx_hash&select=id,tx_hash,block_timestamp'), {
      method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }), body: JSON.stringify(row),
    });
    if (!stored.ok) throw new Error(`database returned ${stored.status}`);
    return res.status(200).json({ ok: true, receipt: ((await stored.json()) as unknown[])[0] });
  } catch (error) {
    console.error('[swap-receipt]', error);
    return res.status(502).json({ error: 'Could not verify and store swap receipt' });
  }
}
