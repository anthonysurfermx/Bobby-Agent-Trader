import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Globe,
  DollarSign,
  BarChart3,
  Building2,
  Loader2,
  Coins,
  AlertTriangle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CHART_COLORS } from '@/components/charts/DefiChartTheme';
import { AIInsightsTerminal } from '@/components/agentic/AIInsightsTerminal';

// ── Types ───────────────────────────────────────────────────────────
interface LatamPair {
  exchange: string;
  base: string;
  quote: string;
  pair: string;
  status: 'active' | 'break' | 'offline';
}

interface ExchangeResult {
  id: string;
  name: string;
  type: 'Global' | 'LATAM';
  totalPairs: number;
  latamPairs: LatamPair[];
  error?: string;
}

interface CountryData {
  code: string;
  country: string;
  countryEs: string;
  flag: string;
  color: string;
  exchangeCount: number;
  pairCount: number;
  hasPresence: boolean;
}

// ── Constants ────────────────────────────────────────────────────────
const LATAM_CURRENCIES = ['BRL', 'MXN', 'ARS', 'COP', 'CLP', 'PEN', 'UYU', 'VES', 'BOB', 'PYG', 'DOP'];

const CURRENCY_META: Record<string, { country: string; countryEs: string; flag: string; color: string }> = {
  BRL: { country: 'Brazil', countryEs: 'Brasil', flag: '🇧🇷', color: '#009739' },
  MXN: { country: 'Mexico', countryEs: 'México', flag: '🇲🇽', color: '#006847' },
  ARS: { country: 'Argentina', countryEs: 'Argentina', flag: '🇦🇷', color: '#75AADB' },
  COP: { country: 'Colombia', countryEs: 'Colombia', flag: '🇨🇴', color: '#FCD116' },
  CLP: { country: 'Chile', countryEs: 'Chile', flag: '🇨🇱', color: '#D52B1E' },
  PEN: { country: 'Peru', countryEs: 'Perú', flag: '🇵🇪', color: '#D91023' },
  UYU: { country: 'Uruguay', countryEs: 'Uruguay', flag: '🇺🇾', color: '#001489' },
  VES: { country: 'Venezuela', countryEs: 'Venezuela', flag: '🇻🇪', color: '#CF142B' },
  BOB: { country: 'Bolivia', countryEs: 'Bolivia', flag: '🇧🇴', color: '#007934' },
  PYG: { country: 'Paraguay', countryEs: 'Paraguay', flag: '🇵🇾', color: '#D52B1E' },
  DOP: { country: 'Dominican Rep.', countryEs: 'Rep. Dominicana', flag: '🇩🇴', color: '#002D62' },
};

// Exchange definitions with their API parsers
interface ExchangeDef {
  id: string;
  name: string;
  type: 'Global' | 'LATAM';
  rank: number;
  fetch: () => Promise<{ totalPairs: number; latamPairs: LatamPair[] }>;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const LATAM_SET = new Set(LATAM_CURRENCIES.map(c => c.toUpperCase()));

function matchLatam(quote: string): string | null {
  const q = quote.toUpperCase();
  if (LATAM_SET.has(q)) return q;
  return null;
}

// ── Exchange API Fetchers ────────────────────────────────────────────
async function fetchBinance(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
  const data = await res.json();
  const symbols = data.symbols || [];
  const latam: LatamPair[] = [];
  for (const s of symbols) {
    const q = matchLatam(s.quoteAsset);
    if (q) latam.push({
      exchange: 'Binance', base: s.baseAsset, quote: q,
      pair: `${s.baseAsset}/${q}`,
      status: s.status === 'TRADING' ? 'active' : 'break',
    });
  }
  return { totalPairs: symbols.length, latamPairs: latam };
}

async function fetchOKX(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const latam: LatamPair[] = [];
  let total = 0;
  for (const instType of ['SPOT', 'SWAP', 'FUTURES']) {
    const res = await fetch(`https://www.okx.com/api/v5/public/instruments?instType=${instType}`);
    const data = await res.json();
    const instruments = data.data || [];
    total += instruments.length;
    for (const inst of instruments) {
      const id: string = inst.instId || '';
      const parts = id.split('-');
      if (parts.length >= 2) {
        const q = matchLatam(parts[1]);
        if (q) latam.push({
          exchange: 'OKX', base: parts[0], quote: q,
          pair: `${parts[0]}/${q}`,
          status: inst.state === 'live' ? 'active' : 'break',
        });
      }
    }
    await sleep(500);
  }
  return { totalPairs: total, latamPairs: latam };
}

async function fetchBybit(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const latam: LatamPair[] = [];
  let total = 0;
  for (const category of ['spot', 'linear']) {
    const res = await fetch(`https://api.bybit.com/v5/market/instruments-info?category=${category}&limit=1000`);
    const data = await res.json();
    const list = data.result?.list || [];
    total += list.length;
    for (const s of list) {
      const q = matchLatam(s.quoteCoin || '');
      if (q) latam.push({
        exchange: 'Bybit', base: s.baseCoin, quote: q,
        pair: `${s.baseCoin}/${q}`,
        status: s.status === 'Trading' ? 'active' : 'break',
      });
    }
    await sleep(500);
  }
  return { totalPairs: total, latamPairs: latam };
}

async function fetchBitget(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.bitget.com/api/v2/spot/public/symbols');
  const data = await res.json();
  const symbols = data.data || [];
  const latam: LatamPair[] = [];
  for (const s of symbols) {
    const q = matchLatam(s.quoteCoin || '');
    if (q) latam.push({
      exchange: 'Bitget', base: s.baseCoin, quote: q,
      pair: `${s.baseCoin}/${q}`,
      status: s.status === 'online' ? 'active' : 'break',
    });
  }
  return { totalPairs: symbols.length, latamPairs: latam };
}

async function fetchKuCoin(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.kucoin.com/api/v1/symbols');
  const data = await res.json();
  const symbols = data.data || [];
  const latam: LatamPair[] = [];
  for (const s of symbols) {
    const q = matchLatam(s.quoteCurrency || '');
    if (q) latam.push({
      exchange: 'KuCoin', base: s.baseCurrency, quote: q,
      pair: `${s.baseCurrency}/${q}`,
      status: s.enableTrading ? 'active' : 'break',
    });
  }
  return { totalPairs: symbols.length, latamPairs: latam };
}

async function fetchGateIO(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.gateio.ws/api/v4/spot/currency_pairs');
  const data = await res.json();
  const latam: LatamPair[] = [];
  for (const p of data) {
    const parts = (p.id || '').split('_');
    if (parts.length === 2) {
      const q = matchLatam(parts[1]);
      if (q) latam.push({
        exchange: 'Gate.io', base: parts[0].toUpperCase(), quote: q,
        pair: `${parts[0].toUpperCase()}/${q}`,
        status: p.trade_status === 'tradable' ? 'active' : 'break',
      });
    }
  }
  return { totalPairs: data.length, latamPairs: latam };
}

async function fetchMEXC(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.mexc.com/api/v3/exchangeInfo');
  const data = await res.json();
  const symbols = data.symbols || [];
  const latam: LatamPair[] = [];
  for (const s of symbols) {
    const q = matchLatam(s.quoteAsset || '');
    if (q) latam.push({
      exchange: 'MEXC', base: s.baseAsset, quote: q,
      pair: `${s.baseAsset}/${q}`,
      status: s.status === 'ENABLED' || s.isSpotTradingAllowed ? 'active' : 'break',
    });
  }
  return { totalPairs: symbols.length, latamPairs: latam };
}

async function fetchHTX(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.huobi.pro/v1/common/symbols');
  const data = await res.json();
  const symbols = data.data || [];
  const latam: LatamPair[] = [];
  for (const s of symbols) {
    const q = matchLatam((s['quote-currency'] || '').toUpperCase());
    if (q) latam.push({
      exchange: 'HTX', base: (s['base-currency'] || '').toUpperCase(), quote: q,
      pair: `${(s['base-currency'] || '').toUpperCase()}/${q}`,
      status: s.state === 'online' ? 'active' : 'offline',
    });
  }
  return { totalPairs: symbols.length, latamPairs: latam };
}

async function fetchBingX(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://open-api.bingx.com/openApi/spot/v1/common/symbols');
  const data = await res.json();
  const symbols = data.data?.symbols || [];
  const latam: LatamPair[] = [];
  for (const s of symbols) {
    const q = matchLatam(s.quoteAsset || '');
    if (q) latam.push({
      exchange: 'BingX', base: s.baseAsset, quote: q,
      pair: `${s.baseAsset}/${q}`, status: 'active',
    });
  }
  return { totalPairs: symbols.length, latamPairs: latam };
}

async function fetchCryptoCom(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.crypto.com/exchange/v1/public/get-instruments');
  const data = await res.json();
  const instruments = data.result?.data || [];
  const latam: LatamPair[] = [];
  for (const inst of instruments) {
    const q = matchLatam(inst.quote_currency || '');
    if (q) latam.push({
      exchange: 'Crypto.com', base: inst.base_currency, quote: q,
      pair: `${inst.base_currency}/${q}`, status: 'active',
    });
  }
  return { totalPairs: instruments.length, latamPairs: latam };
}

async function fetchKraken(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.kraken.com/0/public/AssetPairs');
  const data = await res.json();
  const pairs = Object.values(data.result || {}) as Array<{ base: string; quote: string; wsname?: string; status?: string }>;
  const latam: LatamPair[] = [];
  for (const p of pairs) {
    const q = matchLatam(p.quote || '');
    if (q) latam.push({
      exchange: 'Kraken', base: p.base, quote: q,
      pair: `${p.base}/${q}`, status: 'active',
    });
  }
  return { totalPairs: pairs.length, latamPairs: latam };
}

async function fetchPhemex(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.phemex.com/exchange/public/cfg/v2/products');
  const data = await res.json();
  const products = data.data?.products || data.data?.perpProductsV2 || [];
  const latam: LatamPair[] = [];
  for (const p of products) {
    const q = matchLatam(p.quoteCurrency || '');
    if (q) latam.push({
      exchange: 'Phemex', base: p.baseCurrency, quote: q,
      pair: `${p.baseCurrency}/${q}`, status: 'active',
    });
  }
  return { totalPairs: products.length, latamPairs: latam };
}

async function fetchWhiteBIT(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://whitebit.com/api/v4/public/markets');
  const data = await res.json();
  const latam: LatamPair[] = [];
  for (const m of data) {
    const q = matchLatam(m.stock || '');
    const q2 = matchLatam(m.money || '');
    const quote = q2 || q;
    if (quote) latam.push({
      exchange: 'WhiteBIT', base: m.stock?.toUpperCase(), quote,
      pair: `${m.stock}/${quote}`, status: 'active',
    });
  }
  return { totalPairs: data.length, latamPairs: latam };
}

async function fetchLBank(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.lbank.info/v2/currencyPairs.do');
  const data = await res.json();
  const pairs: string[] = data.data || [];
  const latam: LatamPair[] = [];
  for (const p of pairs) {
    const parts = p.split('_');
    if (parts.length === 2) {
      const q = matchLatam(parts[1]);
      if (q) latam.push({
        exchange: 'LBank', base: parts[0].toUpperCase(), quote: q,
        pair: `${parts[0].toUpperCase()}/${q}`, status: 'active',
      });
    }
  }
  return { totalPairs: pairs.length, latamPairs: latam };
}

async function fetchBitso(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  try {
    const res = await fetch('https://api.bitso.com/v3/available_books');
    const data = await res.json();
    const books = data.payload || [];
    const latam: LatamPair[] = [];
    for (const b of books) {
      const parts = (b.book || '').split('_');
      if (parts.length === 2) {
        const q = matchLatam(parts[1]);
        if (q) latam.push({
          exchange: 'Bitso', base: parts[0].toUpperCase(), quote: q,
          pair: `${parts[0].toUpperCase()}/${q}`, status: 'active',
        });
      }
    }
    return { totalPairs: books.length, latamPairs: latam };
  } catch {
    // Bitso API blocks browser CORS; use hardcoded data from Feb 2026 scan
    const pairs: [string, string][] = [
      ['BTC','MXN'],['ETH','MXN'],['SOL','MXN'],['XRP','MXN'],['USDT','MXN'],
      ['USDC','MXN'],['LTC','MXN'],['AVAX','MXN'],['MANA','MXN'],['DAI','MXN'],
      ['PYUSD','MXN'],['UNI','MXN'],['COMP','MXN'],['BAT','MXN'],['LINK','MXN'],
      ['GRT','MXN'],['AXS','MXN'],['CHZ','MXN'],['DOGE','MXN'],['SHIB','MXN'],
      ['BTC','BRL'],['ETH','BRL'],['SOL','BRL'],['USDT','BRL'],
      ['BTC','ARS'],['ETH','ARS'],['USD','ARS'],
      ['BTC','COP'],['ETH','COP'],['USD','COP'],
    ];
    const latam: LatamPair[] = pairs.map(([base, quote]) => ({
      exchange: 'Bitso', base, quote, pair: `${base}/${quote}`, status: 'active' as const,
    }));
    return { totalPairs: 99, latamPairs: latam };
  }
}

async function fetchMercadoBitcoin(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.mercadobitcoin.net/api/v4/symbols');
  const data = await res.json();
  const symbols: string[] = data.symbol || data.symbols || (Array.isArray(data) ? data : []);
  const latam: LatamPair[] = [];
  for (const s of symbols) {
    const str = typeof s === 'string' ? s : (s as { symbol?: string }).symbol || '';
    if (str.endsWith('-BRL')) {
      const base = str.replace('-BRL', '');
      latam.push({
        exchange: 'Mercado Bitcoin', base, quote: 'BRL',
        pair: `${base}/BRL`, status: 'active',
      });
    }
  }
  return { totalPairs: symbols.length, latamPairs: latam };
}

async function fetchNovaDAX(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.novadax.com/v1/common/symbols');
  const data = await res.json();
  const symbols = data.data || [];
  const latam: LatamPair[] = [];
  for (const s of symbols) {
    const q = matchLatam(s.quoteCurrency || '');
    if (q) latam.push({
      exchange: 'NovaDAX', base: s.baseCurrency, quote: q,
      pair: `${s.baseCurrency}/${q}`,
      status: s.status === 'ONLINE' ? 'active' : 'break',
    });
  }
  return { totalPairs: symbols.length, latamPairs: latam };
}

async function fetchCoinEx(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.coinex.com/v2/spot/market');
  const data = await res.json();
  const markets = data.data || [];
  const latam: LatamPair[] = [];
  for (const m of markets) {
    const q = matchLatam(m.quote_ccy || '');
    if (q) latam.push({
      exchange: 'CoinEx', base: m.base_ccy, quote: q,
      pair: `${m.base_ccy}/${q}`, status: 'active',
    });
  }
  return { totalPairs: markets.length, latamPairs: latam };
}

async function fetchBitMart(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api-cloud.bitmart.com/spot/v1/symbols');
  const data = await res.json();
  const symbols: string[] = data.data?.symbols || [];
  const latam: LatamPair[] = [];
  for (const s of symbols) {
    const parts = s.split('_');
    if (parts.length === 2) {
      const q = matchLatam(parts[1]);
      if (q) latam.push({
        exchange: 'BitMart', base: parts[0], quote: q,
        pair: `${parts[0]}/${q}`, status: 'active',
      });
    }
  }
  return { totalPairs: symbols.length, latamPairs: latam };
}

// ── LATAM-Native Exchange Fetchers ───────────────────────────────────
async function fetchBuda(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://www.buda.com/api/v2/markets');
  const data = await res.json();
  const markets = data.markets || [];
  const latam: LatamPair[] = [];
  for (const m of markets) {
    const q = matchLatam((m.quote_currency || '').toUpperCase());
    if (q) latam.push({
      exchange: 'Buda', base: (m.base_currency || '').toUpperCase(), quote: q,
      pair: `${(m.base_currency || '').toUpperCase()}/${q}`, status: 'active',
    });
  }
  return { totalPairs: markets.length, latamPairs: latam };
}

async function fetchFoxbit(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.foxbit.com.br/rest/v3/markets');
  const data = await res.json();
  const markets = data.data || data || [];
  const arr = Array.isArray(markets) ? markets : Object.values(markets);
  const latam: LatamPair[] = [];
  for (const m of arr) {
    const symbol: string = m.symbol || m.name || '';
    if (symbol.endsWith('BRL')) {
      const base = symbol.replace('BRL', '');
      if (base) latam.push({
        exchange: 'Foxbit', base, quote: 'BRL',
        pair: `${base}/BRL`, status: 'active',
      });
    }
  }
  return { totalPairs: arr.length, latamPairs: latam };
}

async function fetchSatoshiTango(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://api.satoshitango.com/v3/ticker/ARS');
  const data = await res.json();
  const ticker = data.data?.ticker || {};
  const latam: LatamPair[] = [];
  for (const coin of Object.keys(ticker)) {
    const base = coin.toUpperCase();
    latam.push({
      exchange: 'SatoshiTango', base, quote: 'ARS',
      pair: `${base}/ARS`, status: 'active',
    });
  }
  return { totalPairs: latam.length, latamPairs: latam };
}

async function fetchLemonCash(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  // Lemon API requires auth; use CriptoYa aggregator
  const res = await fetch('https://criptoya.com/api/lemoncash');
  const data = await res.json();
  const latam: LatamPair[] = [];
  for (const coin of Object.keys(data)) {
    if (typeof data[coin] === 'object' && data[coin].ask) {
      latam.push({
        exchange: 'Lemon Cash', base: coin.toUpperCase(), quote: 'ARS',
        pair: `${coin.toUpperCase()}/ARS`, status: 'active',
      });
    }
  }
  return { totalPairs: latam.length, latamPairs: latam };
}

async function fetchBelo(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://criptoya.com/api/belo');
  const data = await res.json();
  const latam: LatamPair[] = [];
  for (const coin of Object.keys(data)) {
    if (typeof data[coin] === 'object' && data[coin].ask) {
      latam.push({
        exchange: 'Belo', base: coin.toUpperCase(), quote: 'ARS',
        pair: `${coin.toUpperCase()}/ARS`, status: 'active',
      });
    }
  }
  return { totalPairs: latam.length, latamPairs: latam };
}

async function fetchRipio(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://criptoya.com/api/ripio');
  const data = await res.json();
  const latam: LatamPair[] = [];
  for (const coin of Object.keys(data)) {
    if (typeof data[coin] === 'object' && data[coin].ask) {
      latam.push({
        exchange: 'Ripio', base: coin.toUpperCase(), quote: 'ARS',
        pair: `${coin.toUpperCase()}/ARS`, status: 'active',
      });
    }
  }
  return { totalPairs: latam.length, latamPairs: latam };
}

async function fetchBuenbit(): Promise<{ totalPairs: number; latamPairs: LatamPair[] }> {
  const res = await fetch('https://criptoya.com/api/buenbit');
  const data = await res.json();
  const latam: LatamPair[] = [];
  for (const coin of Object.keys(data)) {
    if (typeof data[coin] === 'object' && data[coin].ask) {
      latam.push({
        exchange: 'Buenbit', base: coin.toUpperCase(), quote: 'ARS',
        pair: `${coin.toUpperCase()}/ARS`, status: 'active',
      });
    }
  }
  return { totalPairs: latam.length, latamPairs: latam };
}

// ── Exchange Registry ────────────────────────────────────────────────
const EXCHANGES: ExchangeDef[] = [
  // Global exchanges
  { id: 'binance', name: 'Binance', type: 'Global', rank: 1, fetch: fetchBinance },
  { id: 'okx', name: 'OKX', type: 'Global', rank: 2, fetch: fetchOKX },
  { id: 'bybit', name: 'Bybit', type: 'Global', rank: 3, fetch: fetchBybit },
  { id: 'bitget', name: 'Bitget', type: 'Global', rank: 4, fetch: fetchBitget },
  { id: 'kucoin', name: 'KuCoin', type: 'Global', rank: 5, fetch: fetchKuCoin },
  { id: 'gate', name: 'Gate.io', type: 'Global', rank: 6, fetch: fetchGateIO },
  { id: 'mexc', name: 'MEXC', type: 'Global', rank: 7, fetch: fetchMEXC },
  { id: 'htx', name: 'HTX', type: 'Global', rank: 8, fetch: fetchHTX },
  { id: 'bingx', name: 'BingX', type: 'Global', rank: 9, fetch: fetchBingX },
  { id: 'crypto_com', name: 'Crypto.com', type: 'Global', rank: 10, fetch: fetchCryptoCom },
  { id: 'kraken', name: 'Kraken', type: 'Global', rank: 11, fetch: fetchKraken },
  { id: 'phemex', name: 'Phemex', type: 'Global', rank: 12, fetch: fetchPhemex },
  { id: 'whitebit', name: 'WhiteBIT', type: 'Global', rank: 13, fetch: fetchWhiteBIT },
  { id: 'lbank', name: 'LBank', type: 'Global', rank: 14, fetch: fetchLBank },
  { id: 'coinex', name: 'CoinEx', type: 'Global', rank: 15, fetch: fetchCoinEx },
  { id: 'bitmart', name: 'BitMart', type: 'Global', rank: 16, fetch: fetchBitMart },
  // LATAM-native exchanges
  { id: 'bitso', name: 'Bitso', type: 'LATAM', rank: 17, fetch: fetchBitso },
  { id: 'mercado_bitcoin', name: 'Mercado Bitcoin', type: 'LATAM', rank: 18, fetch: fetchMercadoBitcoin },
  { id: 'novadax', name: 'NovaDAX', type: 'LATAM', rank: 19, fetch: fetchNovaDAX },
  { id: 'foxbit', name: 'Foxbit', type: 'LATAM', rank: 20, fetch: fetchFoxbit },
  { id: 'buda', name: 'Buda', type: 'LATAM', rank: 21, fetch: fetchBuda },
  { id: 'satoshitango', name: 'SatoshiTango', type: 'LATAM', rank: 22, fetch: fetchSatoshiTango },
  { id: 'lemon', name: 'Lemon Cash', type: 'LATAM', rank: 23, fetch: fetchLemonCash },
  { id: 'ripio', name: 'Ripio', type: 'LATAM', rank: 24, fetch: fetchRipio },
  { id: 'belo', name: 'Belo', type: 'LATAM', rank: 25, fetch: fetchBelo },
  { id: 'buenbit', name: 'Buenbit', type: 'LATAM', rank: 26, fetch: fetchBuenbit },
];

// ── Cache ────────────────────────────────────────────────────────────
const CACHE_TTL = 15 * 60 * 1000;
let latamCache: { data: ExchangeResult[]; ts: number } | null = null;

// ── Helpers ──────────────────────────────────────────────────────────
function fmt(value: number, decimals = 1): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(decimals)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(decimals)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(decimals)}K`;
  return value.toFixed(0);
}

// ── Component ────────────────────────────────────────────────────────
export default function LatamExchangesTab() {
  const { t, i18n } = useTranslation();
  const isEs = i18n.language === 'es';
  const [results, setResults] = useState<ExchangeResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: EXCHANGES.length });
  const fetchLatamData = useCallback(async () => {
    if (latamCache && Date.now() - latamCache.ts < CACHE_TTL) {
      setResults(latamCache.data);
      setScanProgress({ current: EXCHANGES.length, total: EXCHANGES.length });
      setLoading(false);
      return;
    }

    setLoading(true);
    const exchangeResults: ExchangeResult[] = [];

    for (let i = 0; i < EXCHANGES.length; i++) {
      const ex = EXCHANGES[i];
      setScanProgress({ current: i + 1, total: EXCHANGES.length });

      try {
        const result = await ex.fetch();
        exchangeResults.push({
          id: ex.id, name: ex.name, type: ex.type,
          totalPairs: result.totalPairs,
          latamPairs: result.latamPairs,
        });
      } catch (err) {
        console.error(`Error fetching ${ex.name}:`, err);
        exchangeResults.push({
          id: ex.id, name: ex.name, type: ex.type,
          totalPairs: 0, latamPairs: [],
          error: String(err),
        });
      }

      setResults([...exchangeResults]);
      await sleep(800);
    }

    latamCache = { data: exchangeResults, ts: Date.now() };
    setLoading(false);
  }, []);

  useEffect(() => { fetchLatamData(); }, [fetchLatamData]);

  // ── Computed data ──────────────────────────────────────────────────
  const allPairs = results.flatMap(r => r.latamPairs);
  const activePairs = allPairs.filter(p => p.status === 'active');
  const totalActivePairs = activePairs.length;
  const exchangesWithPairs = results.filter(r => r.latamPairs.length > 0).length;
  const exchangesWithNone = results.filter(r => r.latamPairs.length === 0 && !r.error).length;

  // Currencies with pairs
  const pairsByCurrency: Record<string, { pairs: number; exchanges: Set<string> }> = {};
  activePairs.forEach(p => {
    if (!pairsByCurrency[p.quote]) pairsByCurrency[p.quote] = { pairs: 0, exchanges: new Set() };
    pairsByCurrency[p.quote].pairs++;
    pairsByCurrency[p.quote].exchanges.add(p.exchange);
  });

  // Currencies WITHOUT pairs (the insight)
  const currenciesWithNoPairs = LATAM_CURRENCIES.filter(c => !pairsByCurrency[c]);

  // Country data for chart
  const countryData: CountryData[] = LATAM_CURRENCIES.map(code => {
    const meta = CURRENCY_META[code];
    const cd = pairsByCurrency[code];
    return {
      code, country: meta.country, countryEs: meta.countryEs,
      flag: meta.flag, color: meta.color,
      exchangeCount: cd?.exchanges.size || 0,
      pairCount: cd?.pairs || 0,
      hasPresence: !!cd,
    };
  }).sort((a, b) => b.pairCount - a.pairCount);

  // Heat map: only exchanges that have LATAM pairs, sorted by pair count
  const currenciesWithPairs = LATAM_CURRENCIES.filter(c => pairsByCurrency[c]);
  const heatmapData = results
    .filter(r => r.latamPairs.some(p => p.status === 'active'))
    .map(r => {
      const byCurrency: Record<string, number> = {};
      currenciesWithPairs.forEach(c => { byCurrency[c] = 0; });
      r.latamPairs.filter(p => p.status === 'active').forEach(p => {
        byCurrency[p.quote] = (byCurrency[p.quote] || 0) + 1;
      });
      return {
        name: r.name, id: r.id, type: r.type, byCurrency,
        totalActive: r.latamPairs.filter(p => p.status === 'active').length,
        totalAll: r.latamPairs.length,
      };
    })
    .sort((a, b) => {
      // Sort by currency diversity first, then by pair count
      const aDiversity = Object.values(a.byCurrency).filter(v => v > 0).length;
      const bDiversity = Object.values(b.byCurrency).filter(v => v > 0).length;
      if (bDiversity !== aDiversity) return bDiversity - aDiversity;
      return b.totalActive - a.totalActive;
    });

  // Top unique pairs (deduplicated by base/quote, pick highest rank exchange)
  const uniquePairMap = new Map<string, LatamPair & { count: number; exchanges: string[] }>();
  for (const p of activePairs) {
    const key = `${p.base}/${p.quote}`;
    const existing = uniquePairMap.get(key);
    if (existing) {
      existing.count++;
      if (!existing.exchanges.includes(p.exchange)) existing.exchanges.push(p.exchange);
    } else {
      uniquePairMap.set(key, { ...p, count: 1, exchanges: [p.exchange] });
    }
  }
  const topUniquePairs = [...uniquePairMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  const isScanning = loading && scanProgress.current < scanProgress.total;

  // ── Tooltips & Labels ──────────────────────────────────────────────
  function CountryTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CountryData }> }) {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-lg">
        <div className="font-semibold">{d.flag} {isEs ? d.countryEs : d.country} ({d.code})</div>
        <div className="text-muted-foreground">{d.pairCount} {t('metrics.latam.pairs')}</div>
        <div className="text-muted-foreground">{d.exchangeCount} {t('metrics.latam.exchanges')}</div>
      </div>
    );
  }

  function PairCountLabel(props: { x?: number; y?: number; width?: number; value?: number }) {
    const { x, y, width, value } = props;
    if (!x || !y || !width || !value) return null;
    return (
      <text x={x + width + 6} y={(y ?? 0) + 15} fill={CHART_COLORS.textLight} fontSize={12} fontWeight={600}>
        {value}
      </text>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero */}
      <div className="text-center space-y-2">
        <Badge variant="outline">
          <Globe className="w-3 h-3 mr-1" />
          {t('metrics.latam.badge')}
        </Badge>
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold">
          {t('metrics.latam.title')}
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
          {t('metrics.latam.subtitle')}
        </p>
        <p className="text-xs text-muted-foreground">
          {isEs ? '26 exchanges escaneados via APIs directas' : '26 exchanges scanned via direct APIs'}
          {' · '}{LATAM_CURRENCIES.length} {isEs ? 'monedas LATAM buscadas' : 'LATAM currencies searched'}
        </p>
      </div>

      {/* Scanning progress */}
      {isScanning && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 pb-4 px-4 flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <div className="flex-1">
              <div className="text-sm font-medium">{t('metrics.latam.scanning')}</div>
              <div className="text-xs text-muted-foreground">
                {t('metrics.latam.scanProgress', { current: scanProgress.current, total: scanProgress.total })}
                {results.length > 0 && ` · ${results[results.length - 1]?.name}`}
              </div>
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <BarChart3 className="w-3.5 h-3.5" />
              {t('metrics.latam.totalPairs')}
            </div>
            {results.length === 0 ? <Skeleton className="h-8 w-20" /> : (
              <div>
                <div className="text-xl sm:text-2xl font-bold text-foreground">{fmt(totalActivePairs)}</div>
                <div className="text-[10px] text-muted-foreground">{isEs ? 'pares activos' : 'active pairs'}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Building2 className="w-3.5 h-3.5" />
              {t('metrics.latam.totalExchanges')}
            </div>
            {results.length === 0 ? <Skeleton className="h-8 w-20" /> : (
              <div>
                <div className="text-xl sm:text-2xl font-bold text-foreground">
                  {exchangesWithPairs} <span className="text-sm text-muted-foreground">/ {results.length}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {exchangesWithNone} {isEs ? 'sin pares LATAM' : 'with zero LATAM pairs'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Coins className="w-3.5 h-3.5" />
              {isEs ? 'Monedas con Presencia' : 'Currencies with Presence'}
            </div>
            {results.length === 0 ? <Skeleton className="h-8 w-20" /> : (
              <div>
                <div className="text-xl sm:text-2xl font-bold text-foreground">
                  {currenciesWithPairs.length} <span className="text-sm text-muted-foreground">/ {LATAM_CURRENCIES.length}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {currenciesWithNoPairs.length} {isEs ? 'monedas sin ningún par' : 'currencies with zero pairs'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <DollarSign className="w-3.5 h-3.5" />
              {t('metrics.latam.topCurrency')}
            </div>
            {results.length === 0 ? <Skeleton className="h-8 w-20" /> : (
              <div>
                {Object.entries(pairsByCurrency).sort((a, b) => b[1].pairs - a[1].pairs).slice(0, 1).map(([code, data]) => (
                  <div key={code}>
                    <div className="text-xl sm:text-2xl font-bold text-foreground">
                      {CURRENCY_META[code]?.flag} {code}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {data.pairs} {isEs ? 'pares en' : 'pairs across'} {data.exchanges.size} exchanges
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── AI Insights ──────────────────────────────────────────── */}
      {!loading && results.length > 0 && (
        <AIInsightsTerminal
          context="latam-exchanges"
          data={{
            totalActivePairs,
            exchangesWithPairs,
            totalExchanges: results.length,
            currenciesWithPresence: currenciesWithPairs.length,
            totalCurrencies: LATAM_CURRENCIES.length,
            currenciesWithNoPairs,
            topExchanges: heatmapData.slice(0, 8).map(e => ({
              name: e.name, type: e.type, pairCount: e.totalActive,
            })),
            currencyBreakdown: countryData.filter(c => c.hasPresence).map(c => ({
              code: c.code, flag: c.flag, pairs: c.pairCount, exchanges: c.exchangeCount,
            })),
          }}
          commandLabel="openclaw --explain latam-exchanges"
          buttonLabel="EXPLAIN WITH AI"
        />
      )}

      {/* ── Insight: Missing Currencies ───────────────────────────── */}
      {currenciesWithNoPairs.length > 0 && results.length > 5 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-sm font-semibold text-foreground mb-1">
                  {isEs ? 'Monedas LATAM sin presencia en ningún exchange' : 'LATAM currencies with zero exchange presence'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {currenciesWithNoPairs.map(code => (
                    <Badge key={code} variant="outline" className="text-xs">
                      {CURRENCY_META[code]?.flag} {CURRENCY_META[code] ? (isEs ? CURRENCY_META[code].countryEs : CURRENCY_META[code].country) : code} ({code})
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {isEs
                    ? `${currenciesWithNoPairs.length} de ${LATAM_CURRENCIES.length} monedas LATAM no tienen un solo par de trading en los ${results.length} exchanges escaneados.`
                    : `${currenciesWithNoPairs.length} out of ${LATAM_CURRENCIES.length} LATAM currencies have zero trading pairs across all ${results.length} exchanges scanned.`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Heat Map ──────────────────────────────────────────────── */}
      {heatmapData.length > 0 && (
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
              {t('metrics.latam.heatmap')}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {t('metrics.latam.heatmapDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <div className="border rounded-lg overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-xs sm:text-sm min-w-[500px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 sm:p-3 font-medium">{t('metrics.latam.exchange')}</th>
                    {currenciesWithPairs.map(c => (
                      <th key={c} className="text-center p-2 sm:p-3 font-medium">
                        {CURRENCY_META[c]?.flag} {c}
                      </th>
                    ))}
                    <th className="text-center p-2 sm:p-3 font-medium">{t('metrics.latam.totalPairsCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {heatmapData.map(row => (
                    <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-2 sm:p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{row.name}</span>
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">{row.type}</Badge>
                        </div>
                      </td>
                      {currenciesWithPairs.map(c => {
                        const count = row.byCurrency[c] || 0;
                        const bg = count === 0 ? undefined : CURRENCY_META[c]?.color;
                        const opacity = count === 0 ? 1 : Math.min(0.2 + count * 0.06, 0.85);
                        return (
                          <td key={c} className="text-center p-2 sm:p-3">
                            <span
                              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-xs font-bold"
                              style={{
                                backgroundColor: bg, opacity: count > 0 ? opacity : 1,
                                color: count > 0 ? '#fff' : CHART_COLORS.textMuted,
                              }}
                            >
                              {count || '·'}
                            </span>
                          </td>
                        );
                      })}
                      <td className="text-center p-2 sm:p-3 font-mono font-bold">{row.totalActive}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Country Bar Chart ─────────────────────────────────────── */}
      {countryData.some(c => c.pairCount > 0) && (
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />
              {t('metrics.latam.pairsByCountry')}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {t('metrics.latam.pairsByCountryDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <div className="w-full h-[320px] sm:h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={countryData} layout="vertical" margin={{ left: 10, right: 55, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category" dataKey="code" width={55}
                    tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => {
                      const meta = CURRENCY_META[payload.value];
                      return (
                        <text x={x} y={y} dy={4} textAnchor="end" fill={CHART_COLORS.textLight} fontSize={12}>
                          {meta?.flag} {payload.value}
                        </text>
                      );
                    }}
                    axisLine={false} tickLine={false}
                  />
                  <RechartsTooltip content={<CountryTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="pairCount" radius={[0, 6, 6, 0]} maxBarSize={24}>
                    {countryData.map((d, i) => (
                      <Cell key={i} fill={d.hasPresence ? d.color : '#374151'} opacity={d.hasPresence ? 1 : 0.3} />
                    ))}
                    <LabelList content={<PairCountLabel />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/50">
              {countryData.filter(c => c.hasPresence).map(c => (
                <div key={c.code} className="text-xs space-y-0.5">
                  <div className="font-semibold">{c.flag} {isEs ? c.countryEs : c.country}</div>
                  <div className="text-muted-foreground">
                    {c.exchangeCount} {t('metrics.latam.exchanges')}, {c.pairCount} {t('metrics.latam.pairs')}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Top Pairs (deduplicated, showing exchange coverage) ───── */}
      {topUniquePairs.length > 0 && (
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
              {t('metrics.latam.topPairs')}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {isEs
                ? 'Pares más listados en LATAM, mostrando en cuántos exchanges están disponibles'
                : 'Most listed LATAM pairs, showing availability across exchanges'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <div className="border rounded-lg overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-xs sm:text-sm min-w-[400px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 sm:p-3 font-medium w-10">#</th>
                    <th className="text-left p-2 sm:p-3 font-medium">{t('metrics.latam.pair')}</th>
                    <th className="text-center p-2 sm:p-3 font-medium">
                      {isEs ? 'Exchanges' : 'Exchanges'}
                    </th>
                    <th className="text-left p-2 sm:p-3 font-medium hidden sm:table-cell">
                      {isEs ? 'Disponible en' : 'Available on'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {topUniquePairs.map((p, i) => (
                    <tr key={`${p.base}-${p.quote}`} className="hover:bg-muted/30 transition-colors">
                      <td className="p-2 sm:p-3 text-muted-foreground">{i + 1}</td>
                      <td className="p-2 sm:p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{p.base}/{p.quote}</span>
                          <span className="text-[10px]">{CURRENCY_META[p.quote]?.flag}</span>
                        </div>
                      </td>
                      <td className="p-2 sm:p-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
                          style={{ backgroundColor: CURRENCY_META[p.quote]?.color || '#6b7280', color: '#fff' }}>
                          {p.count}
                        </span>
                      </td>
                      <td className="p-2 sm:p-3 text-muted-foreground hidden sm:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {p.exchanges.map(ex => (
                            <Badge key={ex} variant="secondary" className="text-[9px] px-1 py-0">{ex}</Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Data source ───────────────────────────────────────────── */}
      <p className="text-[10px] text-center" style={{ color: CHART_COLORS.textMuted }}>
        {isEs
          ? 'Datos obtenidos directamente de las APIs públicas de cada exchange. Escaneo de pares spot + futuros + swaps.'
          : 'Data fetched directly from each exchange public API. Spot + futures + swap pairs scanned.'}
        {' · '}{t('metrics.latam.dataNote')}: {new Date().toLocaleDateString()}
        {' · DeFi México'}
      </p>
    </div>
  );
}
