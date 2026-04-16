// ============================================================
// GET /api/dex-swap
// Proxy for OKX DEX Aggregator — returns swap calldata for on-chain execution
// Params: chainId, fromToken, toToken, amount, userWalletAddress, slippage
// Returns: tx object { from, to, value, data, gas } ready for wallet signing
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hmacSign } from './_lib/okx-hmac';

const OKX_BASE = 'https://web3.okx.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chainId, fromToken, toToken, amount, userWalletAddress, slippage } = req.query;

  if (!chainId || !fromToken || !toToken || !amount || !userWalletAddress) {
    return res.status(400).json({
      error: 'Missing params. Required: chainId, fromToken, toToken, amount, userWalletAddress',
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
      fromTokenAddress: String(fromToken),
      toTokenAddress: String(toToken),
      amount: String(amount),
      userWalletAddress: String(userWalletAddress),
      slippage: String(slippage || '0.005'),
      swapMode: 'exactIn',
    };

    const requestPath = '/api/v6/dex/aggregator/swap';
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
      console.error('[DEX Swap] OKX Error:', response.status, errorText);
      return res.status(502).json({ error: 'OKX API error', status: response.status, detail: errorText });
    }

    const json = await response.json() as {
      code: string;
      msg: string;
      data: Array<{
        routerResult: {
          chainIndex: string;
          fromToken: { tokenSymbol: string; tokenUnitPrice: string; decimal: string; tokenContractAddress: string };
          toToken: { tokenSymbol: string; tokenUnitPrice: string; decimal: string; tokenContractAddress: string };
          fromTokenAmount: string;
          toTokenAmount: string;
          estimateGasFee: string;
        };
        tx: {
          from: string;
          to: string;
          value: string;
          data: string;
          gas: string;
          gasPrice: string;
          maxPriorityFeePerGas?: string;
          minReceiveAmount: string;
        };
      }>;
    };

    if (json.code !== '0') {
      console.error('[DEX Swap] OKX API Error:', json.code, json.msg);
      return res.status(502).json({ error: 'OKX API error', code: json.code, msg: json.msg });
    }

    if (!json.data || json.data.length === 0) {
      return res.status(200).json({ ok: false, error: 'No swap route available' });
    }

    const d = json.data[0];
    const fromDecimals = parseInt(d.routerResult.fromToken.decimal);
    const toDecimals = parseInt(d.routerResult.toToken.decimal);

    // No cache — swap calldata is time-sensitive
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json({
      ok: true,
      swap: {
        fromToken: d.routerResult.fromToken.tokenSymbol,
        toToken: d.routerResult.toToken.tokenSymbol,
        fromAmount: parseFloat(d.routerResult.fromTokenAmount) / (10 ** fromDecimals),
        toAmount: parseFloat(d.routerResult.toTokenAmount) / (10 ** toDecimals),
        estimateGasFee: d.routerResult.estimateGasFee,
        tx: d.tx,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DEX Swap] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
