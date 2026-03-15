// ============================================================
// GET /api/dex-approve
// Proxy for OKX DEX Aggregator — returns ERC-20 approve tx data
// Needed before swapping ERC-20 tokens (not needed for native ETH)
// Params: chainId, tokenContractAddress, approveAmount
// Returns: { data, dexContractAddress } for wallet signing
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const OKX_BASE = 'https://web3.okx.com';

async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chainId, tokenContractAddress, approveAmount } = req.query;

  if (!chainId || !tokenContractAddress || !approveAmount) {
    return res.status(400).json({
      error: 'Missing params. Required: chainId, tokenContractAddress, approveAmount',
    });
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
      return res.status(502).json({ error: 'OKX API error', status: response.status, detail: errorText });
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
      return res.status(502).json({ error: 'OKX API error', code: json.code, msg: json.msg });
    }

    if (!json.data || json.data.length === 0) {
      return res.status(200).json({ ok: false, error: 'No approval data returned' });
    }

    const d = json.data[0];

    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json({
      ok: true,
      approve: {
        data: d.data,
        to: d.dexContractAddress,
        gasLimit: d.gasLimit,
        gasPrice: d.gasPrice,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DEX Approve] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
