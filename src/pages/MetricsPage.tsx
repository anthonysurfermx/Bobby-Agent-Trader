// src/pages/MetricsPage.tsx
import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import {
  TrendingUp,
  Globe,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Activity,
  Info,
  Coins,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ChainTVLChart } from '@/components/charts/ChainTVLChart';
import { CHART_COLORS } from '@/components/charts/DefiChartTheme';
import { AIInsightsTerminal } from '@/components/agentic/AIInsightsTerminal';

const LatamExchangesTab = lazy(() => import('@/components/LatamExchangesTab'));

// ── Types ───────────────────────────────────────────────────────────
interface KPIData {
  globalTVL: number | null;
  globalTVLChange: number | null;
  dexVolume: number | null;
  dexVolumeChange: number | null;
  totalFees: number | null;
  totalFeesChange: number | null;
  stablecoinsMcap: number | null;
  stablecoinsMcapChange: number | null;
}

interface ChainData {
  name: string;
  tvl: number;
  tokenSymbol: string;
}

interface ProtocolData {
  name: string;
  category: string;
  tvl: number;
  change_1d: number | null;
  change_7d: number | null;
  logo: string;
}

interface MXNStablecoin {
  name: string;
  symbol: string;
  tvl: number;
  issuer: string;
  chain: string;
  color: string;
}

// ── Static Data ─────────────────────────────────────────────────────
// MXN Stablecoins (manually tracked — not on DefiLlama)
// Last updated: April 2026
// Sources: RWA.xyz, CoinGecko, on-chain data
const mxnStablecoins: MXNStablecoin[] = [
  { name: 'MXNB', symbol: 'MXNB', tvl: 22000000, issuer: 'Juno (Bitso)', chain: 'Arbitrum', color: '#00D4AA' },
  { name: 'MXNT', symbol: 'MXNT', tvl: 4500000, issuer: 'Tether', chain: 'Multi-chain', color: '#26A17B' },
  { name: 'MMXN', symbol: 'MMXN', tvl: 3200000, issuer: 'Moneta', chain: 'Polygon', color: '#F97316' },
  { name: 'MXNe', symbol: 'MXNe', tvl: 76000, issuer: 'Brale', chain: 'Solana', color: '#8B5CF6' },
];

const CHAIN_BAR_COLORS = [
  '#00FF88', '#00D4FF', '#8B5CF6', '#F97316', '#EF4444',
  '#10B981', '#3B82F6', '#EC4899', '#F59E0B', '#6366F1',
];

// ── In-memory cache ─────────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000; // 5 min
const cache: Record<string, { data: unknown; ts: number }> = {};

async function cachedFetch<T>(key: string, url: string): Promise<T> {
  const hit = cache[key];
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data as T;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  cache[key] = { data, ts: Date.now() };
  return data as T;
}

// ── Formatters ──────────────────────────────────────────────────────
function fmt(value: number, decimals = 1): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(decimals)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(decimals)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(decimals)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(decimals)}K`;
  return `$${value.toFixed(0)}`;
}

function ChangeIndicator({ value }: { value: number | null }) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? 'text-green-500' : 'text-red-500'}`}>
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

// ── Component ───────────────────────────────────────────────────────
export default function MetricsPage() {
  const { t, i18n } = useTranslation();
  const [kpi, setKpi] = useState<KPIData>({
    globalTVL: null, globalTVLChange: null,
    dexVolume: null, dexVolumeChange: null,
    totalFees: null, totalFeesChange: null,
    stablecoinsMcap: null, stablecoinsMcapChange: null,
  });
  const [chains, setChains] = useState<ChainData[]>([]);
  const [protocols, setProtocols] = useState<ProtocolData[]>([]);
  const [loading, setLoading] = useState(true);

  const totalMXNTVL = mxnStablecoins.reduce((s, c) => s + c.tvl, 0);
  const maxMXNTVL = Math.max(...mxnStablecoins.map(c => c.tvl));
  const lastUpdated = i18n.language === 'en' ? 'February 2026' : 'Febrero 2026';

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fire all API calls in parallel
      const [tvlData, dexData, feesData, stableData, chainsData, protocolsData] = await Promise.allSettled([
        cachedFetch<Array<{ date: number; tvl: number }>>('tvl', 'https://api.llama.fi/v2/historicalChainTvl'),
        cachedFetch<{ total24h: number; change_1d: number }>('dex', 'https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true'),
        cachedFetch<{ total24h: number; change_1d: number }>('fees', 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true'),
        cachedFetch<{ peggedAssets: Array<{ circulating: { peggedUSD: number }; circulatingPrevDay: { peggedUSD: number } }> }>('stables', 'https://stablecoins.llama.fi/stablecoins?includePrices=true'),
        cachedFetch<ChainData[]>('chains', 'https://api.llama.fi/v2/chains'),
        cachedFetch<ProtocolData[]>('protocols', 'https://api.llama.fi/protocols'),
      ]);

      // KPI: Global TVL
      if (tvlData.status === 'fulfilled' && tvlData.value.length > 0) {
        const latest = tvlData.value[tvlData.value.length - 1];
        const prev = tvlData.value[tvlData.value.length - 2];
        const change = prev ? ((latest.tvl - prev.tvl) / prev.tvl) * 100 : null;
        setKpi(k => ({ ...k, globalTVL: latest.tvl, globalTVLChange: change }));
      }

      // KPI: DEX Volume
      if (dexData.status === 'fulfilled') {
        setKpi(k => ({ ...k, dexVolume: dexData.value.total24h, dexVolumeChange: dexData.value.change_1d }));
      }

      // KPI: Fees
      if (feesData.status === 'fulfilled') {
        setKpi(k => ({ ...k, totalFees: feesData.value.total24h, totalFeesChange: feesData.value.change_1d }));
      }

      // KPI: Stablecoins MCap
      if (stableData.status === 'fulfilled') {
        const assets = stableData.value.peggedAssets;
        const totalMcap = assets.reduce((s, a) => s + (a.circulating?.peggedUSD || 0), 0);
        const prevMcap = assets.reduce((s, a) => s + (a.circulatingPrevDay?.peggedUSD || 0), 0);
        const change = prevMcap ? ((totalMcap - prevMcap) / prevMcap) * 100 : null;
        setKpi(k => ({ ...k, stablecoinsMcap: totalMcap, stablecoinsMcapChange: change }));
      }

      // Chains: top 10 by TVL
      if (chainsData.status === 'fulfilled') {
        const sorted = [...chainsData.value]
          .filter(c => c.tvl > 0)
          .sort((a, b) => b.tvl - a.tvl)
          .slice(0, 10);
        setChains(sorted);
      }

      // Protocols: top 15 DeFi (no CEX)
      if (protocolsData.status === 'fulfilled') {
        const sorted = [...protocolsData.value]
          .filter(p => p.category !== 'CEX' && p.tvl > 0)
          .sort((a, b) => b.tvl - a.tvl)
          .slice(0, 15);
        setProtocols(sorted);
      }
    } catch (err) {
      console.error('Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── KPI Card helper ─────────────────────────────────────────────
  function KPICard({ icon: Icon, label, value, change, color }: {
    icon: typeof Globe;
    label: string;
    value: number | null;
    change: number | null;
    color: string;
  }) {
    return (
      <Card className={`border border-${color}/20 bg-gradient-to-br from-${color}/5 to-transparent`}>
        <CardContent className="pt-4 pb-4 px-4 sm:px-5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Icon className="w-3.5 h-3.5" />
            {label}
          </div>
          {loading || value === null ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <div className="space-y-1">
              <div className="text-xl sm:text-2xl font-bold text-foreground">{fmt(value)}</div>
              <ChangeIndicator value={change} />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Custom Tooltip for chains bar chart ─────────────────────────
  function ChainsTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChainData }> }) {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-lg">
        <div className="font-semibold">{d.name}</div>
        <div className="text-muted-foreground">{fmt(d.tvl)}</div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{t('metrics.pageTitle')} | DeFi México</title>
        <meta name="description" content={t('metrics.pageDescription')} />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Hero */}
        <section className="relative py-8 sm:py-12 md:py-16 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5" />
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-5xl mx-auto text-center space-y-3">
              <Badge variant="outline" className="mb-2">
                <Activity className="w-3 h-3 mr-1" />
                {t('metrics.badge')}
              </Badge>
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                {t('metrics.title')}
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
                {t('metrics.subtitle')}
              </p>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <Tabs defaultValue="global" className="container mx-auto px-4 max-w-5xl">
          <TabsList className="mb-6 w-full sm:w-auto">
            <TabsTrigger value="global" className="flex-1 sm:flex-initial">
              <Globe className="w-3.5 h-3.5 mr-1.5" />
              {t('metrics.tabs.global')}
            </TabsTrigger>
            <TabsTrigger value="latam" className="flex-1 sm:flex-initial">
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
              {t('metrics.tabs.latam')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="latam">
            <Suspense fallback={<div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>}>
              <LatamExchangesTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="global">
        {/* ── Section 1: KPI Cards ──────────────────────────────── */}
        <section className="container mx-auto px-4 -mt-4 sm:-mt-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-5xl mx-auto">
            <KPICard icon={Globe} label={t('metrics.globalTVL')} value={kpi.globalTVL} change={kpi.globalTVLChange} color="primary" />
            <KPICard icon={BarChart3} label={t('metrics.dexVolume')} value={kpi.dexVolume} change={kpi.dexVolumeChange} color="blue-500" />
            <KPICard icon={Coins} label={t('metrics.totalFees')} value={kpi.totalFees} change={kpi.totalFeesChange} color="amber-500" />
            <KPICard icon={DollarSign} label={t('metrics.stablecoinsMcap')} value={kpi.stablecoinsMcap} change={kpi.stablecoinsMcapChange} color="purple-500" />
          </div>
        </section>

        {/* ── AI Insights ──────────────────────────────────────── */}
        {!loading && kpi.globalTVL !== null && (
          <section className="container mx-auto px-4 py-6 sm:py-8">
            <div className="max-w-5xl mx-auto">
              <AIInsightsTerminal
                context="exchange-metrics"
                data={{
                  globalTVL: kpi.globalTVL,
                  globalTVLChange: kpi.globalTVLChange,
                  dexVolume: kpi.dexVolume,
                  dexVolumeChange: kpi.dexVolumeChange,
                  totalFees: kpi.totalFees,
                  totalFeesChange: kpi.totalFeesChange,
                  stablecoinsMcap: kpi.stablecoinsMcap,
                  stablecoinsMcapChange: kpi.stablecoinsMcapChange,
                  topChains: chains.slice(0, 5).map(c => ({ name: c.name, tvl: c.tvl })),
                  topProtocols: protocols.slice(0, 5).map(p => ({ name: p.name, tvl: p.tvl, change_1d: p.change_1d })),
                }}
                commandLabel="openclaw --explain defi-metrics"
                buttonLabel="EXPLAIN WITH AI"
              />
            </div>
          </section>
        )}

        {/* ── Section 2: Top Chains by TVL ──────────────────────── */}
        <section className="container mx-auto px-4 py-8 sm:py-10">
          <div className="max-w-5xl mx-auto">
            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
                  {t('metrics.topChains')}
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {t('metrics.topChainsDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {loading || chains.length === 0 ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Bar chart */}
                    <div className="w-full h-[300px] sm:h-[350px] mb-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chains} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                          <XAxis type="number" tickFormatter={(v) => fmt(v, 0)} tick={{ fill: CHART_COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" width={80} tick={{ fill: CHART_COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                          <RechartsTooltip content={<ChainsTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                          <Bar dataKey="tvl" radius={[0, 4, 4, 0]} maxBarSize={24}>
                            {chains.map((_, i) => (
                              <Cell key={i} fill={CHAIN_BAR_COLORS[i % CHAIN_BAR_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Table */}
                    <div className="border rounded-lg overflow-x-auto -mx-4 sm:mx-0">
                      <table className="w-full text-xs sm:text-sm min-w-[320px]">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-2 sm:p-3 font-medium w-10">{t('metrics.rank')}</th>
                            <th className="text-left p-2 sm:p-3 font-medium">{t('metrics.chain')}</th>
                            <th className="text-right p-2 sm:p-3 font-medium">{t('metrics.tvl')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {chains.map((chain, i) => (
                            <tr key={chain.name} className="hover:bg-muted/30 transition-colors">
                              <td className="p-2 sm:p-3 text-muted-foreground">{i + 1}</td>
                              <td className="p-2 sm:p-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHAIN_BAR_COLORS[i % CHAIN_BAR_COLORS.length] }} />
                                  <span className="font-medium">{chain.name}</span>
                                  {chain.tokenSymbol && <span className="text-muted-foreground text-xs hidden sm:inline">({chain.tokenSymbol})</span>}
                                </div>
                              </td>
                              <td className="p-2 sm:p-3 text-right font-mono">{fmt(chain.tvl)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── Section 3: Top DeFi Protocols ─────────────────────── */}
        <section className="container mx-auto px-4 pb-8 sm:pb-10">
          <div className="max-w-5xl mx-auto">
            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                  {t('metrics.topProtocols')}
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {t('metrics.topProtocolsDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {loading || protocols.length === 0 ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full text-xs sm:text-sm min-w-[480px]">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2 sm:p-3 font-medium w-10">{t('metrics.rank')}</th>
                          <th className="text-left p-2 sm:p-3 font-medium">{t('metrics.protocol')}</th>
                          <th className="text-left p-2 sm:p-3 font-medium hidden sm:table-cell">{t('metrics.category')}</th>
                          <th className="text-right p-2 sm:p-3 font-medium">{t('metrics.tvl')}</th>
                          <th className="text-right p-2 sm:p-3 font-medium">{t('metrics.change1d')}</th>
                          <th className="text-right p-2 sm:p-3 font-medium hidden sm:table-cell">{t('metrics.change7d')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {protocols.map((p, i) => (
                          <tr key={p.name} className="hover:bg-muted/30 transition-colors">
                            <td className="p-2 sm:p-3 text-muted-foreground">{i + 1}</td>
                            <td className="p-2 sm:p-3">
                              <div className="flex items-center gap-2">
                                {p.logo && <img src={p.logo} alt="" className="w-5 h-5 rounded-full flex-shrink-0" loading="lazy" />}
                                <span className="font-medium truncate max-w-[140px] sm:max-w-none">{p.name}</span>
                              </div>
                            </td>
                            <td className="p-2 sm:p-3 text-muted-foreground hidden sm:table-cell">
                              <Badge variant="secondary" className="text-[10px] font-normal">{p.category}</Badge>
                            </td>
                            <td className="p-2 sm:p-3 text-right font-mono">{fmt(p.tvl)}</td>
                            <td className="p-2 sm:p-3 text-right">
                              <ChangeIndicator value={p.change_1d} />
                            </td>
                            <td className="p-2 sm:p-3 text-right hidden sm:table-cell">
                              <ChangeIndicator value={p.change_7d} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── Section 4: Historical Global TVL (replaces iframe) ── */}
        <section className="container mx-auto px-4 pb-8 sm:pb-10">
          <div className="max-w-5xl mx-auto">
            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                  {t('metrics.historicalTVL')}
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {t('metrics.historicalDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <ChainTVLChart identifier="All" />
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── Section 5: MXN Stablecoins ────────────────────────── */}
        <section className="container mx-auto px-4 pb-8 sm:pb-10">
          <div className="max-w-5xl mx-auto">
            <Card>
              <CardHeader className="px-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
                      {t('metrics.breakdown')}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {t('metrics.breakdownDescription')}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[10px] sm:text-xs flex-shrink-0">
                    {t('metrics.lastUpdate')}: {lastUpdated}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {/* Total card */}
                <div className="flex items-center justify-between mb-6 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                  <span className="text-sm font-medium">{t('metrics.mxnTVL')}</span>
                  <span className="text-xl sm:text-2xl font-bold text-purple-500">{fmt(totalMXNTVL)}</span>
                </div>

                {/* Bar breakdown */}
                <div className="space-y-3 mb-6">
                  {mxnStablecoins.map((coin) => (
                    <div key={coin.symbol} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs sm:text-sm">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: coin.color }} />
                          <span className="font-medium">{coin.symbol}</span>
                          <span className="text-muted-foreground hidden sm:inline">({coin.issuer})</span>
                        </div>
                        <span className="font-mono text-xs">{fmt(coin.tvl)}</span>
                      </div>
                      <div className="h-5 bg-muted rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all duration-500"
                          style={{ width: `${(coin.tvl / maxMXNTVL) * 100}%`, backgroundColor: coin.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Data table */}
                <div className="border rounded-lg overflow-x-auto -mx-4 sm:mx-0">
                  <table className="w-full text-xs sm:text-sm min-w-[320px]">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 sm:p-3 font-medium">{t('metrics.table.stablecoin')}</th>
                        <th className="text-left p-2 sm:p-3 font-medium">{t('metrics.table.issuer')}</th>
                        <th className="text-left p-2 sm:p-3 font-medium hidden sm:table-cell">{t('metrics.table.chain')}</th>
                        <th className="text-right p-2 sm:p-3 font-medium">TVL</th>
                        <th className="text-right p-2 sm:p-3 font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {mxnStablecoins.map((coin) => (
                        <tr key={coin.symbol} className="hover:bg-muted/30 transition-colors">
                          <td className="p-2 sm:p-3">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: coin.color }} />
                              <span className="font-medium">{coin.symbol}</span>
                            </div>
                          </td>
                          <td className="p-2 sm:p-3 text-muted-foreground">{coin.issuer}</td>
                          <td className="p-2 sm:p-3 text-muted-foreground hidden sm:table-cell">{coin.chain}</td>
                          <td className="p-2 sm:p-3 text-right font-mono">{fmt(coin.tvl)}</td>
                          <td className="p-2 sm:p-3 text-right font-mono">{((coin.tvl / totalMXNTVL) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/30 font-medium">
                        <td className="p-2 sm:p-3" colSpan={2}>Total</td>
                        <td className="p-2 sm:p-3 hidden sm:table-cell" />
                        <td className="p-2 sm:p-3 text-right font-mono">{fmt(totalMXNTVL)}</td>
                        <td className="p-2 sm:p-3 text-right font-mono">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── Footer: Data source note ──────────────────────────── */}
        <section className="container mx-auto px-4 pb-12 sm:pb-16">
          <div className="max-w-5xl mx-auto">
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="pt-4 sm:pt-5 px-4 sm:px-6">
                <div className="flex items-start gap-3">
                  <Info className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1.5 text-xs sm:text-sm text-muted-foreground">
                    <p><strong>{t('metrics.dataNote')}</strong></p>
                    <p>{t('metrics.globalTVLNote')}</p>
                    <p>{t('metrics.mxnNote')} {t('metrics.lastUpdate')}: <span className="font-medium text-foreground">{lastUpdated}</span>.</p>
                    <p className="text-[10px] sm:text-xs pt-1 opacity-60">{t('metrics.poweredBy')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
