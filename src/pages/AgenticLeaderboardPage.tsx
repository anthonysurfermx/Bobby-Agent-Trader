// src/pages/AgenticLeaderboardPage.tsx
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, ExternalLink, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, ShieldCheck } from 'lucide-react';
import { PixelTrophy, PixelCoins, PixelBarChart, PixelLayers } from '@/components/ui/pixel-icons';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ScrambleText } from '@/components/agentic/ScrambleText';
import { defillamaService, type AIAgentProtocol, type TVLHistoryPoint } from '@/services/defillama.service';
import { EntityComments } from '@/components/BlogComments';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { AgentAvatar3D } from '@/components/agentic/avatar-3d/AgentAvatar3D';
import { useAvatarRenderer } from '@/components/agentic/avatar-3d/useAvatarRenderer';
import { SkillsComparisonSection } from '@/components/agentic/SkillsComparisonSection';

function formatUSD(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value > 0) return `$${value.toFixed(0)}`;
  return '-';
}

function ChangeCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">-</span>;
  const isPositive = value >= 0;
  return (
    <span className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isPositive ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

type SortField = 'tvl' | 'feesAllTime' | 'fees24h' | 'mcap' | 'change_1d' | 'change_7d';
type SortDirection = 'desc' | 'asc';

function SortableHeader({ field, label, sortBy, sortDir, onSort, align = 'right' }: {
  field: SortField;
  label: string;
  sortBy: SortField;
  sortDir: SortDirection;
  onSort: (field: SortField) => void;
  align?: 'left' | 'right';
}) {
  const isActive = sortBy === field;
  return (
    <th
      className={`p-4 text-sm font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(field)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {isActive ? (
          sortDir === 'desc' ? <ArrowDown className="w-3 h-3 text-amber-500" /> : <ArrowUp className="w-3 h-3 text-amber-500" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

const CHART_COLORS = [
  '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316',
];

function formatChartValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export default function AgenticLeaderboardPage() {
  const { t } = useTranslation();
  const [protocols, setProtocols] = useState<AIAgentProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortField>('tvl');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [tvlHistory, setTvlHistory] = useState<TVLHistoryPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await defillamaService.getAIAgentProtocols();
      setProtocols(data);
      // Load chart data in background
      setChartLoading(true);
      defillamaService.getTVLHistory(data, 90)
        .then(setTvlHistory)
        .catch(() => {})
        .finally(() => setChartLoading(false));
    } catch (err) {
      console.error('Error loading DefiLlama data:', err);
      setError(t('agenticWorld.leaderboard.noData'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Get protocol names that appear in the chart data
  const chartProtocols = useMemo(() => {
    if (!tvlHistory.length) return [];
    const keys = new Set<string>();
    for (const point of tvlHistory) {
      for (const key of Object.keys(point)) {
        if (key !== 'date' && key !== 'timestamp') keys.add(key);
      }
    }
    // Sort by latest TVL value descending
    const lastPoint = tvlHistory[tvlHistory.length - 1];
    return Array.from(keys).sort((a, b) => {
      return ((lastPoint[b] as number) || 0) - ((lastPoint[a] as number) || 0);
    });
  }, [tvlHistory]);

  const sorted = useMemo(() => {
    return [...protocols].sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [protocols, sortBy, sortDir]);

  // 3D Avatar renderer
  const avatarSlugs = useMemo(() => sorted.map(p => p.slug), [sorted]);
  const { staticImages, attachLive, detachLive } = useAvatarRenderer(avatarSlugs);

  const totalTVL = useMemo(() => protocols.reduce((sum, p) => sum + p.tvl, 0), [protocols]);
  const totalFees = useMemo(() => protocols.reduce((sum, p) => sum + p.feesAllTime, 0), [protocols]);
  const totalFees24h = useMemo(() => protocols.reduce((sum, p) => sum + p.fees24h, 0), [protocols]);

  // Weighted average 24h TVL change (weighted by TVL)
  const avgTVLChange24h = useMemo(() => {
    const withChange = protocols.filter(p => p.change_1d !== null && p.tvl > 0);
    if (!withChange.length) return null;
    const totalW = withChange.reduce((s, p) => s + p.tvl, 0);
    if (totalW === 0) return null;
    return withChange.reduce((s, p) => s + (p.change_1d! * p.tvl), 0) / totalW;
  }, [protocols]);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{t('agenticWorld.leaderboard.title')} | DeFi Hub México</title>
        <meta name="description" content={t('agenticWorld.leaderboard.description')} />
      </Helmet>

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <PixelTrophy size={28} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-4xl font-bold">{t('agenticWorld.leaderboard.title')}</h1>
                <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs animate-pulse">
                  {t('agenticWorld.leaderboard.badge')}
                </Badge>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground text-lg mt-2">
            {t('agenticWorld.leaderboard.description')}
          </p>
        </div>

        {/* Stats - Terminal Style */}
        {!loading && !error && (
          <div className="grid grid-cols-3 gap-2 mb-8">
            <div className="border border-amber-500/30 bg-black/60 p-3 font-mono">
              <div className="text-[10px] text-amber-400/60 mb-1">{'>'} TOTAL_TVL</div>
              <div className="text-xl font-bold text-amber-400">
                <ScrambleText text={formatUSD(totalTVL)} />
              </div>
              {avgTVLChange24h !== null && (
                <div className={`text-[10px] mt-1 ${avgTVLChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {avgTVLChange24h >= 0 ? '+' : ''}{avgTVLChange24h.toFixed(2)}% 24h
                </div>
              )}
              <div className="flex gap-[2px] mt-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className={`w-1.5 h-1 ${i < 6 ? 'bg-amber-500' : 'bg-amber-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                ))}
              </div>
            </div>
            <div className="border border-amber-500/30 bg-black/60 p-3 font-mono">
              <div className="text-[10px] text-amber-400/60 mb-1">{'>'} TOTAL_FEES</div>
              <div className="text-xl font-bold text-amber-400">
                <ScrambleText text={formatUSD(totalFees)} />
              </div>
              {totalFees24h > 0 && (
                <div className="text-[10px] text-amber-300/50 mt-1">+{formatUSD(totalFees24h)} 24h</div>
              )}
              <div className="flex gap-[2px] mt-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className={`w-1.5 h-1 ${i < 4 ? 'bg-amber-500' : 'bg-amber-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                ))}
              </div>
            </div>
            <div className="border border-amber-500/30 bg-black/60 p-3 font-mono">
              <div className="text-[10px] text-amber-400/60 mb-1">{'>'} PROTOCOLS</div>
              <div className="text-xl font-bold text-amber-400">
                <ScrambleText text={`${protocols.length}`} />
              </div>
              <div className="text-[10px] text-amber-300/50 mt-1">{protocols.filter(p => p.tvl > 0).length} active TVL</div>
              <div className="flex gap-[2px] mt-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className={`w-1.5 h-1 ${i < 3 ? 'bg-amber-500' : 'bg-amber-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TVL History Chart */}
        {!loading && !error && (
          <Card className="mb-8 border-amber-500/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">TVL History (90d)</CardTitle>
                  <CardDescription>Total Value Locked over time</CardDescription>
                </div>
                {chartLoading && <LoadingSpinner size="sm" />}
              </div>
            </CardHeader>
            <CardContent>
              {tvlHistory.length > 0 ? (
                <div className="w-full h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tvlHistory}>
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: string) => {
                          const d = new Date(v);
                          return `${d.getMonth() + 1}/${d.getDate()}`;
                        }}
                        interval="preserveStartEnd"
                        minTickGap={40}
                      />
                      <YAxis
                        scale="log"
                        domain={['auto', 'auto']}
                        allowDataOverflow
                        tick={{ fontSize: 11 }}
                        tickFormatter={formatChartValue}
                        width={70}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        labelFormatter={(label: string) => {
                          const d = new Date(label);
                          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        }}
                        formatter={(value: number) => [formatChartValue(value), undefined]}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                      />
                      {chartProtocols.map((name, i) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                !chartLoading && (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                    No historical data available
                  </div>
                )
              )}
            </CardContent>
          </Card>
        )}

        {/* Skills Comparison */}
        {!loading && !error && <SkillsComparisonSection />}

        {/* Refresh Button */}
        {!loading && !error && (
          <div className="flex items-center justify-end mb-6">
            <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {/* Error */}
        {error && (
          <Card className="p-12 text-center border-red-500/20">
            <PixelTrophy size={48} className="mx-auto mb-4 text-red-500/50" />
            <h3 className="text-lg font-semibold mb-2">{error}</h3>
            <Button onClick={loadData} className="mt-4">
              {t('agenticWorld.leaderboard.retry')}
            </Button>
          </Card>
        )}

        {/* Desktop Table */}
        {!loading && !error && (
          <>
            <div className="hidden md:block">
              <Card className="overflow-hidden border-amber-500/20">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground w-12">{t('agenticWorld.leaderboard.rank')}</th>
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">{t('agenticWorld.leaderboard.name')}</th>
                        <SortableHeader field="tvl" label={t('agenticWorld.leaderboard.tvl')} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortableHeader field="feesAllTime" label={t('agenticWorld.leaderboard.fees')} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortableHeader field="fees24h" label={t('agenticWorld.leaderboard.fees24h')} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortableHeader field="mcap" label={t('agenticWorld.leaderboard.mcap')} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortableHeader field="change_1d" label={t('agenticWorld.leaderboard.change1d')} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortableHeader field="change_7d" label={t('agenticWorld.leaderboard.change7d')} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <th className="text-center p-4 text-sm font-medium text-muted-foreground w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((p, i) => (
                        <tr key={p.slug} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="p-4 text-sm font-bold text-muted-foreground">{i + 1}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              {p.logo ? (
                                <img
                                  src={p.logo}
                                  alt={p.name}
                                  className="w-9 h-9 rounded-lg shrink-0 bg-muted object-cover"
                                  loading="lazy"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              ) : (
                                <AgentAvatar3D
                                  slug={p.slug}
                                  name={p.name}
                                  size={36}
                                  staticImage={staticImages.get(p.slug)}
                                  onHoverAttach={attachLive}
                                  onHoverDetach={detachLive}
                                />
                              )}
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{p.name}</span>
                                  {p.symbol && p.symbol !== '-' && (
                                    <Badge variant="outline" className="text-[10px]">{p.symbol}</Badge>
                                  )}
                                  {p.category && p.category !== 'AI Agents' && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{p.category}</Badge>
                                  )}
                                  {p.audits > 0 && (
                                    <span title={`${p.audits} audit(s)`}>
                                      <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                                    </span>
                                  )}
                                </div>
                                {p.description && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-1 max-w-[300px]" title={p.description}>
                                    {p.description}
                                  </p>
                                )}
                                <div className="flex gap-1">
                                  {p.chains.slice(0, 3).map((chain) => (
                                    <Badge key={chain} variant="secondary" className="text-[10px] px-1.5 py-0">
                                      {chain}
                                    </Badge>
                                  ))}
                                  {p.chains.length > 3 && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                      +{p.chains.length - 3}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-right font-mono text-sm">{formatUSD(p.tvl)}</td>
                          <td className="p-4 text-right font-mono text-sm">{formatUSD(p.feesAllTime)}</td>
                          <td className="p-4 text-right font-mono text-sm">{formatUSD(p.fees24h)}</td>
                          <td className="p-4 text-right font-mono text-sm">{formatUSD(p.mcap)}</td>
                          <td className="p-4 text-right"><ChangeCell value={p.change_1d} /></td>
                          <td className="p-4 text-right"><ChangeCell value={p.change_7d} /></td>
                          <td className="p-4 text-center">
                            {p.url && (
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {sorted.map((p, i) => (
                <Card key={p.slug} className="border-amber-500/10">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-muted-foreground">#{i + 1}</span>
                        {p.logo ? (
                          <img
                            src={p.logo}
                            alt={p.name}
                            className="w-10 h-10 rounded-lg shrink-0 bg-muted object-cover"
                            loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <AgentAvatar3D
                            slug={p.slug}
                            name={p.name}
                            size={40}
                            staticImage={staticImages.get(p.slug)}
                            onHoverAttach={attachLive}
                            onHoverDetach={detachLive}
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{p.name}</span>
                            {p.symbol && p.symbol !== '-' && (
                              <Badge variant="outline" className="text-[10px]">{p.symbol}</Badge>
                            )}
                            {p.audits > 0 && (
                              <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                            )}
                          </div>
                          {p.description && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                              {p.description}
                            </p>
                          )}
                          <div className="flex gap-1 mt-1">
                            {p.chains.slice(0, 2).map((chain) => (
                              <Badge key={chain} variant="secondary" className="text-[10px] px-1.5 py-0">
                                {chain}
                              </Badge>
                            ))}
                            {p.chains.length > 2 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                +{p.chains.length - 2}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t('agenticWorld.leaderboard.tvl')}</span>
                        <p className="font-mono font-semibold">{formatUSD(p.tvl)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('agenticWorld.leaderboard.fees')}</span>
                        <p className="font-mono font-semibold">{formatUSD(p.feesAllTime)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('agenticWorld.leaderboard.fees24h')}</span>
                        <p className="font-mono font-semibold">{formatUSD(p.fees24h)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('agenticWorld.leaderboard.mcap')}</span>
                        <p className="font-mono font-semibold">{formatUSD(p.mcap)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('agenticWorld.leaderboard.change1d')}</span>
                        <ChangeCell value={p.change_1d} />
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('agenticWorld.leaderboard.change7d')}</span>
                        <ChangeCell value={p.change_7d} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Data Source Footer */}
            <div className="mt-6 text-center text-xs text-muted-foreground">
              <p>{t('agenticWorld.leaderboard.dataSource')} • {t('agenticWorld.leaderboard.updatedEvery')}</p>
            </div>
          </>
        )}

        {/* Comments */}
        <EntityComments entityId="agentic-leaderboard" entityType="agentic" />
      </div>
    </div>
  );
}
