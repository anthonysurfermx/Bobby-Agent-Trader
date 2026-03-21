// ============================================================
// POST /api/okx-perps
// OKX Perpetual Futures — Execute leveraged trades from Bobby
// User provides their OKX API credentials client-side
// Bobby generates the order, user confirms, we execute
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';

const OKX_BASE = 'https://www.okx.com';

interface OKXCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

// Dual-mode trading: Paper (demo) and Live (production)
// Keys are resolved per-request based on mode parameter

// Production keys (live trading with real money)
const LIVE_KEY = process.env.OKX_CEX_API_KEY || process.env.OKX_API_KEY || '';
const LIVE_SECRET = process.env.OKX_CEX_SECRET_KEY || process.env.OKX_SECRET_KEY || '';
const LIVE_PASSPHRASE = process.env.OKX_CEX_PASSPHRASE || process.env.OKX_PASSPHRASE || '';

// Demo keys (paper trading with simulated money)
const DEMO_KEY = process.env.OKX_DEMO_API_KEY || '';
const DEMO_SECRET = process.env.OKX_DEMO_SECRET_KEY || '';
const DEMO_PASSPHRASE = process.env.OKX_DEMO_PASSPHRASE || '';

// X Layer contract for on-chain track record
const TRACK_RECORD_CONTRACT = process.env.BOBBY_CONTRACT_ADDRESS || '0xF841b428E6d743187D7BE2242eccC1078fdE2395';

function getCredentials(mode: 'paper' | 'live'): { creds: OKXCredentials; simulated: boolean } {
  if (mode === 'paper') {
    // Paper trading uses demo keys with x-simulated-trading: 1
    // If no demo keys, fall back to live keys with simulated header
    const hasDemo = DEMO_KEY && DEMO_SECRET && DEMO_PASSPHRASE;
    return {
      creds: {
        apiKey: hasDemo ? DEMO_KEY : LIVE_KEY,
        secret: hasDemo ? DEMO_SECRET : LIVE_SECRET,
        passphrase: hasDemo ? DEMO_PASSPHRASE : LIVE_PASSPHRASE,
      },
      simulated: true, // Always simulated in paper mode
    };
  }
  return {
    creds: { apiKey: LIVE_KEY, secret: LIVE_SECRET, passphrase: LIVE_PASSPHRASE },
    simulated: false,
  };
}

// ---- OKX API Signature ----
function signOKX(
  timestamp: string,
  method: string,
  path: string,
  body: string,
  secretKey: string,
): string {
  const prehash = timestamp + method.toUpperCase() + path + body;
  return createHmac('sha256', secretKey).update(prehash).digest('base64');
}

async function okxRequest(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  credentials: OKXCredentials & { simulated?: boolean },
): Promise<any> {
  const timestamp = new Date().toISOString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const sign = signOKX(timestamp, method, path, bodyStr, credentials.secret);

  const res = await fetch(`${OKX_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'OK-ACCESS-KEY': credentials.apiKey,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': credentials.passphrase,
      'x-simulated-trading': credentials.simulated ? '1' : '0',
    },
    ...(body ? { body: bodyStr } : {}),
  });

  return res.json();
}

// ---- Instrument ID mapping ----
function getInstId(symbol: string): string {
  const map: Record<string, string> = {
    // Crypto
    BTC: 'BTC-USDT-SWAP',
    ETH: 'ETH-USDT-SWAP',
    SOL: 'SOL-USDT-SWAP',
    OKB: 'OKB-USDT-SWAP',
    XRP: 'XRP-USDT-SWAP',
    DOGE: 'DOGE-USDT-SWAP',
    AVAX: 'AVAX-USDT-SWAP',
    LINK: 'LINK-USDT-SWAP',
    DOT: 'DOT-USDT-SWAP',
    ADA: 'ADA-USDT-SWAP',
    ARB: 'ARB-USDT-SWAP',
    OP: 'OP-USDT-SWAP',
    MATIC: 'MATIC-USDT-SWAP',
    ATOM: 'ATOM-USDT-SWAP',
    UNI: 'UNI-USDT-SWAP',
    // Stock Perpetuals (OKX March 2026)
    NVDA: 'NVDA-USDT-SWAP',
    AAPL: 'AAPL-USDT-SWAP',
    TSLA: 'TSLA-USDT-SWAP',
    META: 'META-USDT-SWAP',
    GOOGL: 'GOOGL-USDT-SWAP',
    MSFT: 'MSFT-USDT-SWAP',
    AMD: 'AMD-USDT-SWAP',
    COIN: 'COIN-USDT-SWAP',
    MSTR: 'MSTR-USDT-SWAP',
    SPY: 'SPY-USDT-SWAP',
    QQQ: 'QQQ-USDT-SWAP',
    XOM: 'XOM-USDT-SWAP',
    JPM: 'JPM-USDT-SWAP',
    GS: 'GS-USDT-SWAP',
  };
  return map[symbol.toUpperCase()] || `${symbol.toUpperCase()}-USDT-SWAP`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, credentials, params } = req.body as {
    action: string;
    credentials?: { apiKey: string; secret: string; passphrase: string };
    params?: Record<string, any>;
  };

  // ── Auth for mutant actions: require internal secret or user credentials ──
  const mutantActions = ['open_position', 'close_position', 'set_tpsl'];
  if (mutantActions.includes(action)) {
    const internalSecret = process.env.BOBBY_CYCLE_SECRET || process.env.CRON_SECRET;
    const hasUserCreds = credentials?.apiKey && credentials?.secret;
    const hasInternalAuth = !!internalSecret && params?.internalSecret === internalSecret;
    const hasHeaderAuth = !!internalSecret && req.headers['x-internal-secret'] === internalSecret;
    if (!hasUserCreds && !hasInternalAuth && !hasHeaderAuth) {
      return res.status(401).json({ error: 'Unauthorized — credentials or internal auth required for trading' });
    }
  }

  // ── PUBLIC: Get mark price + funding (no credentials needed) ──
  // ── SETUP: Configure account for perpetual trading ──
  if (action === 'setup_account') {
    const tradingMode = params?.mode === 'paper' ? 'paper' : 'live';
    const { creds: setupCreds, simulated } = getCredentials(tradingMode as any);
    const c = { ...setupCreds, simulated };
    try {
      // 1. Set position mode to long/short
      const posMode = await okxRequest('POST', '/api/v5/account/set-position-mode', { posMode: 'long_short_mode' }, c);
      // 2. Set account level to single-currency margin (1)
      // Note: this only works if no open positions exist
      const acctLv = params?.accountLevel || '2'; // 2 = multi-currency margin (needed for SWAP perps)
      const acctRes = await okxRequest('POST', '/api/v5/account/set-account-level', { acctLv }, c);
      return res.status(200).json({
        ok: true,
        positionMode: posMode,
        accountLevel: acctRes,
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err.message || 'Setup failed' });
    }
  }

  if (action === 'market_info') {
    const symbol = params?.symbol || 'BTC';
    const instId = getInstId(symbol);

    try {
      const [tickerRes, fundingRes] = await Promise.all([
        fetch(`${OKX_BASE}/api/v5/market/ticker?instId=${instId}`),
        fetch(`${OKX_BASE}/api/v5/public/funding-rate?instId=${instId}`),
      ]);

      const ticker = await tickerRes.json();
      const funding = await fundingRes.json();

      const t = ticker.data?.[0];
      const f = funding.data?.[0];

      return res.status(200).json({
        ok: true,
        symbol,
        instId,
        markPrice: parseFloat(t?.last || '0'),
        change24h: parseFloat(t?.sodUtc8 ? (((parseFloat(t.last) - parseFloat(t.sodUtc8)) / parseFloat(t.sodUtc8)) * 100).toFixed(2) : '0'),
        volume24h: parseFloat(t?.volCcy24h || '0'),
        fundingRate: parseFloat(f?.fundingRate || '0'),
        nextFundingTime: f?.fundingTime,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to fetch market info' });
    }
  }

  // ── PUBLIC: Get available leverage for an instrument ──
  if (action === 'leverage_info') {
    const symbol = params?.symbol || 'BTC';
    const instId = getInstId(symbol);

    try {
      const leverageRes = await fetch(
        `${OKX_BASE}/api/v5/public/instruments?instType=SWAP&instId=${instId}`
      );
      const data = await leverageRes.json();
      const inst = data.data?.[0];

      return res.status(200).json({
        ok: true,
        symbol,
        instId,
        maxLeverage: parseInt(inst?.lever || '125'),
        minSize: inst?.minSz || '1',
        tickSize: inst?.tickSz,
        ctVal: inst?.ctVal, // Contract value per unit
        ctMult: inst?.ctMult,
        settleCcy: inst?.settleCcy || 'USDT',
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to fetch leverage info' });
    }
  }

  // ── Resolve credentials based on trading mode ──
  const tradingMode = (params?.mode === 'live') ? 'live' : 'paper'; // Default: paper
  const { creds: resolvedCreds, simulated } = getCredentials(tradingMode);

  if (!resolvedCreds.apiKey || !resolvedCreds.secret || !resolvedCreds.passphrase) {
    return res.status(400).json({
      error: `OKX CEX ${tradingMode} keys not configured. Set OKX_CEX_* or OKX_DEMO_* env vars.`,
      mode: tradingMode,
    });
  }

  // Attach simulated flag for the x-simulated-trading header
  const creds = { ...resolvedCreds, simulated };

  // ── SET LEVERAGE ──
  if (action === 'set_leverage') {
    const symbol = params?.symbol || 'BTC';
    const leverage = params?.leverage || 10;
    const instId = getInstId(symbol);
    const side = params?.direction === 'short' ? 'short' : 'long';

    try {
      const result = await okxRequest('POST', '/api/v5/account/set-leverage', {
        instId,
        lever: String(leverage),
        mgnMode: 'isolated',
      }, creds);

      return res.status(200).json({
        ok: result.code === '0',
        data: result.data,
        error: result.code !== '0' ? result.msg : undefined,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to set leverage' });
    }
  }

  // ── OPEN POSITION (Market Order) ──
  if (action === 'open_position') {
    const symbol = params?.symbol || 'BTC';
    const direction = params?.direction || 'long'; // 'long' or 'short'
    const leverage = params?.leverage || 10;
    const amountUSDT = params?.amount || 50; // USDT margin
    const instId = getInstId(symbol);

    try {
      // Step 1: Set leverage (isolated margin, long/short mode)
      await okxRequest('POST', '/api/v5/account/set-leverage', {
        instId,
        lever: String(leverage),
        mgnMode: 'isolated',
        posSide: direction === 'long' ? 'long' : 'short',
      }, creds);

      // Step 2: Get contract size info
      const instRes = await fetch(
        `${OKX_BASE}/api/v5/public/instruments?instType=SWAP&instId=${instId}`
      );
      const instData = await instRes.json();
      const inst = instData.data?.[0];
      const ctVal = parseFloat(inst?.ctVal || '0.01'); // Contract value in base currency
      const minSz = parseFloat(inst?.minSz || '1');     // Min order size in contracts
      const lotSz = parseFloat(inst?.lotSz || '1');     // Lot size increment

      // Step 3: Get mark price
      const priceRes = await fetch(`${OKX_BASE}/api/v5/market/ticker?instId=${instId}`);
      const priceData = await priceRes.json();
      const markPrice = parseFloat(priceData.data?.[0]?.last || '0');

      // Step 4: Calculate size dynamically based on instrument specs
      // OKX SWAP: sz is in contracts. 1 contract = ctVal units of base currency
      // margin = sz * ctVal * markPrice / leverage → sz = margin * leverage / (ctVal * markPrice)
      const sizeInContracts = (amountUSDT * leverage) / (ctVal * markPrice);
      // Round down to nearest lotSz
      const sizeRounded = Math.floor(sizeInContracts / lotSz) * lotSz;
      const minMarginNeeded = (minSz * ctVal * markPrice / leverage);

      if (sizeRounded < minSz) {
        return res.status(400).json({
          ok: false,
          error: `Amount too small. Minimum ${minMarginNeeded.toFixed(2)} USDT needed for ${symbol}. (ctVal=${ctVal}, minSz=${minSz})`,
        });
      }

      // Step 5: Place market order (sz in ETH units for SWAP)
      const orderResult = await okxRequest('POST', '/api/v5/trade/order', {
        instId,
        tdMode: 'isolated',
        side: direction === 'long' ? 'buy' : 'sell',
        posSide: direction === 'long' ? 'long' : 'short',
        ordType: 'market',
        sz: String(sizeRounded),
      }, creds);

      if (orderResult.code !== '0') {
        return res.status(400).json({
          ok: false,
          error: orderResult.data?.[0]?.sMsg || orderResult.msg || 'Order failed',
          code: orderResult.data?.[0]?.sCode,
        });
      }

      const orderId = orderResult.data?.[0]?.ordId;

      // On-chain commit: register this trade prediction on X Layer
      // Skip if caller will handle commit separately (e.g. bobby-cycle)
      if (!params?.skipOnchainCommit) {
        try {
          const commitRes = await fetch(
            `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://defi-mexico-hub.vercel.app'}/api/xlayer-record`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'commit',
                threadId: `perp-${symbol}-${orderId}-${Date.now()}`,
                symbol,
                agent: 'cio',
                conviction: params?.conviction || 7,
                entryPrice: markPrice,
                targetPrice: direction === 'long' ? markPrice * 1.05 : markPrice * 0.95,
                stopPrice: direction === 'long' ? markPrice * 0.97 : markPrice * 1.03,
              }),
            }
          );
          const commitData = await commitRes.json();
          console.log('[Perps] On-chain commit:', commitData.ok ? 'success' : 'pending');
        } catch (err) {
          console.warn('[Perps] On-chain commit failed (non-blocking):', err);
        }
      } else {
        console.log('[Perps] Skipping on-chain commit (caller handles it)');
      }

      return res.status(200).json({
        ok: true,
        action: 'position_opened',
        symbol,
        direction,
        leverage: `${leverage}x`,
        margin: `${amountUSDT} USDT`,
        notional: `${(sizeRounded * markPrice).toFixed(2)} USDT`,
        size: `${sizeRounded} ETH`,
        markPrice,
        orderId,
        instId,
        mode: tradingMode,
        simulated,
        onchain: { contract: TRACK_RECORD_CONTRACT, chain: 'X Layer (196)' },
      });
    } catch (err) {
      console.error('[Perps] open_position error:', err);
      return res.status(500).json({ ok: false, error: `Failed to open position: ${err instanceof Error ? err.message : 'unknown'}` });
    }
  }

  // ── CLOSE POSITION ──
  if (action === 'close_position') {
    const symbol = params?.symbol || 'BTC';
    const direction = params?.direction || 'long';
    const instId = getInstId(symbol);

    try {
      const result = await okxRequest('POST', '/api/v5/trade/close-position', {
        instId,
        mgnMode: 'isolated',
        posSide: direction === 'long' ? 'long' : 'short',
      }, creds);

      return res.status(200).json({
        ok: result.code === '0',
        action: 'position_closed',
        symbol,
        direction,
        data: result.data,
        error: result.code !== '0' ? result.msg : undefined,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to close position' });
    }
  }

  // ── SET TP/SL (Take Profit / Stop Loss) ──
  if (action === 'set_tpsl') {
    const symbol = params?.symbol || 'BTC';
    const direction = params?.direction || 'long';
    const takeProfit = params?.takeProfit;
    const stopLoss = params?.stopLoss;
    const instId = getInstId(symbol);

    if (!takeProfit && !stopLoss) {
      return res.status(400).json({ error: 'At least one of takeProfit or stopLoss required' });
    }

    try {
      // Get current position size
      const posRes = await okxRequest('GET', `/api/v5/account/positions?instId=${instId}`, null, creds);
      const pos = posRes.data?.find((p: any) => p.posSide === (direction === 'long' ? 'long' : 'short'));

      if (!pos || parseFloat(pos.pos) === 0) {
        return res.status(400).json({ ok: false, error: 'No open position found' });
      }

      const closeSide = direction === 'long' ? 'sell' : 'buy';
      const results: any[] = [];

      // Take profit order
      if (takeProfit) {
        const tpResult = await okxRequest('POST', '/api/v5/trade/order-algo', {
          instId,
          tdMode: 'isolated',
          side: closeSide,
          posSide: direction === 'long' ? 'long' : 'short',
          ordType: 'conditional',
          sz: pos.pos,
          tpTriggerPx: String(takeProfit),
          tpOrdPx: '-1', // Market price
          tpTriggerPxType: 'mark',
        }, creds);
        results.push({ type: 'tp', ...tpResult });
      }

      // Stop loss order
      if (stopLoss) {
        const slResult = await okxRequest('POST', '/api/v5/trade/order-algo', {
          instId,
          tdMode: 'isolated',
          side: closeSide,
          posSide: direction === 'long' ? 'long' : 'short',
          ordType: 'conditional',
          sz: pos.pos,
          slTriggerPx: String(stopLoss),
          slOrdPx: '-1', // Market price
          slTriggerPxType: 'mark',
        }, creds);
        results.push({ type: 'sl', ...slResult });
      }

      // Validate that OKX actually accepted the orders
      const failedOrders = results.filter((r: any) => {
        const code = r.code || r.data?.[0]?.sCode;
        return code && code !== '0';
      });
      if (failedOrders.length > 0) {
        const failMsgs = failedOrders.map((r: any) => `${r.type}: ${r.data?.[0]?.sMsg || r.msg || 'unknown'}`).join('; ');
        return res.status(400).json({
          ok: false,
          error: `TP/SL rejected by OKX: ${failMsgs}`,
          results,
        });
      }

      return res.status(200).json({
        ok: true,
        action: 'tpsl_set',
        symbol,
        direction,
        takeProfit,
        stopLoss,
        results,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to set TP/SL' });
    }
  }

  // ── GET POSITIONS ──
  if (action === 'positions') {
    try {
      const result = await okxRequest('GET', '/api/v5/account/positions?instType=SWAP', null, creds);

      const positions = (result.data || [])
        .filter((p: any) => parseFloat(p.pos) !== 0)
        .map((p: any) => ({
          symbol: p.instId.split('-')[0],
          instId: p.instId,
          direction: p.posSide,
          size: parseFloat(p.pos),
          leverage: `${p.lever}x`,
          entryPrice: parseFloat(p.avgPx),
          markPrice: parseFloat(p.markPx),
          unrealizedPnl: parseFloat(p.upl),
          unrealizedPnlPct: parseFloat(p.uplRatio) * 100,
          margin: parseFloat(p.margin),
          liquidationPrice: parseFloat(p.liqPx || '0'),
        }));

      return res.status(200).json({ ok: true, positions });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to fetch positions' });
    }
  }

  // ── GET ACCOUNT BALANCE ──
  if (action === 'balance') {
    try {
      const result = await okxRequest('GET', '/api/v5/account/balance', null, creds);
      const details = result.data?.[0]?.details || [];

      return res.status(200).json({
        ok: true,
        totalEquity: parseFloat(result.data?.[0]?.totalEq || '0'),
        availableBalance: parseFloat(result.data?.[0]?.availBal || '0'),
        currencies: details.map((d: any) => ({
          currency: d.ccy,
          available: parseFloat(d.availBal),
          equity: parseFloat(d.eq),
          unrealizedPnl: parseFloat(d.upl),
        })),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to fetch balance' });
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
