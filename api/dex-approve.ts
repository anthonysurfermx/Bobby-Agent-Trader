// ============================================================
// GET /api/dex-approve
// Proxy for OKX DEX Aggregator — returns ERC-20 approve tx data
// Needed before swapping ERC-20 tokens (not needed for native ETH)
// Params: chainId, tokenContractAddress, approveAmount
// Returns: { data, dexContractAddress } for wallet signing
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkApproveTx, DexRefusal } from './_lib/dex-allowlist.js';
import { hmacSign } from './_lib/okx-hmac.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';

const OKX_BASE = 'https://web3.okx.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await enforcePublicRateLimit(req, res, 'dex-approve', 30, 600)) return;

  const { chainId, tokenContractAddress, approveAmount } = req.query;

  if (!chainId || !tokenContractAddress || !approveAmount) {
    return res.status(400).json({
      error: 'Missing params. Required: chainId, tokenContractAddress, approveAmount',
    });
  }
  if (!/^\d{1,10}$/.test(String(chainId)) || !/^0x[a-fA-F0-9]{40}$/.test(String(tokenContractAddress))
    || !/^\d{1,78}$/.test(String(approveAmount))) {
    return res.status(400).json({ error: 'Invalid approval parameters' });
  }

  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase || !projectId) {
    return res.status(500).json({
      error: 'OKX DEX credentials not configured',
    });
  }

  try {
    const queryParams: Record<string, string> = {
      chainIndex: String(chainId),
      tokenContractAddress: String(tokenContractAddress),
      approveAmount: String(approveAmount),
    };

    const requestPath = '/api/v6/dex/aggregator/approve-transaction';
    const queryString = '?' + new URLSearchParams(queryParams).toString();
    const timestamp = new Date().toISOString();

    const stringToSign = timestamp + 'GET' + requestPath + queryString;
    const signature = await hmacSign(stringToSign, secretKey);

    const url = `${OKX_BASE}${requestPath}${queryString}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-PROJECT': projectId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DEX Approve] OKX Error:', response.status, errorText);
      return res.status(502).json({ error: 'OKX API error', status: response.status });
    }

    const json = await response.json() as {
      code: string;
      msg: string;
      data: Array<{
        data: string;
        dexContractAddress: string;
        gasLimit: string;
        gasPrice: string;
      }>;
    };

    if (json.code !== '0') {
      console.error('[DEX Approve] OKX API Error:', json.code, json.msg);
      return res.status(502).json({ error: 'OKX API error', code: json.code });
    }

    if (!json.data || json.data.length === 0) {
      return res.status(200).json({ ok: false, error: 'No approval data returned' });
    }

    const d = json.data[0];

    res.setHeader('Cache-Control', 'no-store');

    // The spender must be allow-listed and the calldata must be exactly approve(spender, requested amount).
    let checked: { to: string; spender: string };
    try {
      checked = checkApproveTx(String(chainId), { to: d.dexContractAddress, data: d.data }, String(approveAmount));
    } catch (e) {
      const r = e instanceof DexRefusal ? e : new DexRefusal(String(e));
      console.error('[dex-approve] refused', r.code, r.message);
      return res.status(r.code === 'dex_not_configured' ? 503 : 502).json({ ok: false, error: r.message, code: r.code });
    }
    return res.status(200).json({
      ok: true,
      approve: {
        data: d.data,
        to: checked.to,
        spender: checked.spender,
        amount: String(approveAmount),
        gasLimit: d.gasLimit,
        gasPrice: d.gasPrice,
        disclosure: { chainId: Number(chainId), router: checked.to, spender: checked.spender, valueWei: '0', minReceived: null, note: 'Exact-amount approval to an allow-listed OKX contract; never unlimited.' },
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DEX Approve] Error:', msg);
    return res.status(500).json({ error: 'Approval request failed' });
  }
}
