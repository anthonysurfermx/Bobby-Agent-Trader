// ============================================================
// OnchainOS API Client — OKX REST API v5
// Maneja autenticación HMAC-SHA256 y llamadas a Market, Trade, Account
// ============================================================

import type { TradeParams, TradeResult, Balance, TickerData } from './types.js';

const OKX_BASE_URL = 'https://www.okx.com/api/v5';

// Genera firma HMAC-SHA256 requerida por OKX
async function generateSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  secretKey: string
): Promise<string> {
  const prehash = timestamp + method + requestPath + body;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(prehash));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function getTimestamp(): string {
  return new Date().toISOString().slice(0, -5) + 'Z';
}

interface OKXCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  projectId?: string;
}

function getCredentials(): OKXCredentials {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  if (!apiKey || !secretKey || !passphrase) {
    throw new Error('[OnchainOS] Missing OKX API credentials in environment variables');
  }

  return { apiKey, secretKey, passphrase, projectId };
}

async function okxFetch<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const creds = getCredentials();
  const timestamp = getTimestamp();
  const bodyStr = body ? JSON.stringify(body) : '';

  const signature = await generateSignature(
    timestamp,
    method,
    path,
    bodyStr,
    creds.secretKey
  );

  const headers: Record<string, string> = {
    'OK-ACCESS-KEY': creds.apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': creds.passphrase,
    'Content-Type': 'application/json',
  };

  // OnchainOS requiere project ID
  if (creds.projectId) {
    headers['OK-ACCESS-PROJECT'] = creds.projectId;
  }

  const url = `${OKX_BASE_URL}${path}`;
  console.log('[OnchainOS] REQUEST', method, path);

  const response = await fetch(url, {
    method,
    headers,
    body: bodyStr || undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[OnchainOS] HTTP ${response.status}: ${errorText}`);
  }

  const json = await response.json() as { code: string; msg: string; data: T };

  if (json.code !== '0') {
    throw new Error(`[OnchainOS] API Error ${json.code}: ${json.msg}`);
  }

  return json.data;
}

// ---- Public API ----

export async function getSpotPrice(symbol: string): Promise<number> {
  const instId = symbol.includes('-SWAP') ? symbol : symbol;
  const path = `/market/ticker?instId=${instId}`;

  const data = await okxFetch<TickerData[]>('GET', path);

  if (!data || data.length === 0) {
    throw new Error(`[OnchainOS] No ticker data for ${instId}`);
  }

  const price = parseFloat(data[0].last);
  console.log('[OnchainOS] PRICE', instId, price);
  return price;
}

export async function executeTrade(params: TradeParams): Promise<TradeResult> {
  // Seguridad: verificar que live trading está habilitado
  if (process.env.ENABLE_LIVE_TRADING !== 'true') {
    console.log('[OnchainOS] SIMULATED TRADE (live trading disabled)', params);
    return {
      ordId: 'SIM-' + Date.now(),
      clOrdId: '',
      sCode: '0',
      sMsg: 'Simulated — ENABLE_LIVE_TRADING is false',
    };
  }

  const body = {
    instId: params.instId,
    tdMode: 'cross',
    side: params.side,
    posSide: params.side === 'buy' ? 'long' : 'short',
    ordType: params.ordType,
    sz: params.size,
    lever: params.lever,
    ...(params.px && { px: params.px }),
  };

  console.log('[OnchainOS] EXECUTE TRADE', body);

  const data = await okxFetch<TradeResult[]>('POST', '/trade/order', body);

  if (!data || data.length === 0) {
    throw new Error('[OnchainOS] Empty response from Trade API');
  }

  const result = data[0];

  if (result.sCode !== '0') {
    throw new Error(`[OnchainOS] Trade failed: ${result.sMsg}`);
  }

  console.log('[OnchainOS] TRADE SUCCESS', result.ordId);
  return result;
}

export async function getWalletBalance(ccy: string = 'USDT'): Promise<Balance> {
  const path = `/account/balance?ccy=${ccy}`;
  const data = await okxFetch<Array<{ details: Balance[] }>>('GET', path);

  if (!data || data.length === 0 || !data[0].details || data[0].details.length === 0) {
    throw new Error(`[OnchainOS] No balance data for ${ccy}`);
  }

  const balance = data[0].details[0];
  console.log('[OnchainOS] BALANCE', ccy, balance.availBal);
  return balance;
}
