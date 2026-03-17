// src/pages/HomePage.tsx - Degen Pixel Terminal Design
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  PixelArrowRight,
  PixelRocket,
  PixelUsers,
  PixelCalendar,
  PixelMail,
  PixelSparkles,
  PixelLobster,
  PixelTrophy,
  PixelTarget,
  PixelZap,
} from '@/components/ui/pixel-icons';
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { communitiesService, type Community } from '@/services/communities.service';
import { eventsService, type Event } from '@/services/events.service';
import { jobsService, type Job } from '@/services/jobs.service';
import { blogService, type DomainPost } from '@/services/blog.service';
import { startupsService } from '@/services/startups.service';
import { defillamaService, type AIAgentProtocol, type TVLHistoryPoint } from '@/services/defillama.service';
import { useAuth } from '@/hooks/useAuth';
import { getTwitterAvatar } from '@/lib/utils';
import { ScrambleText } from '@/components/agentic/ScrambleText';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { Sparkles } from 'lucide-react';

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

// Terminal window header component
function TerminalHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border-b border-cyan-500/20">
      <div className="flex gap-1.5">
        <div className="w-2 h-2 rounded-full bg-red-500/60" />
        <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
        <div className="w-2 h-2 rounded-full bg-green-500/60" />
      </div>
      <span className="text-cyan-400 text-[10px] font-mono ml-1">{title}</span>
    </div>
  );
}

// Pixel bar decorators
function PixelBars({ count = 8, color = 'cyan' }: { count?: number; color?: string }) {
  const colors: Record<string, string[]> = {
    cyan: ['bg-cyan-400', 'bg-cyan-500', 'bg-cyan-600', 'bg-teal-500'],
    amber: ['bg-amber-400', 'bg-amber-500', 'bg-orange-500', 'bg-yellow-500'],
    green: ['bg-green-400', 'bg-emerald-500', 'bg-green-600', 'bg-teal-400'],
    violet: ['bg-violet-400', 'bg-purple-500', 'bg-violet-600', 'bg-indigo-500'],
  };
  const palette = colors[color] || colors.cyan;
  return (
    <div className="flex gap-[2px] mt-2" style={{ imageRendering: 'pixelated' as any }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${palette[i % palette.length]} opacity-60`}
          style={{ width: 4, height: 6 + Math.floor(Math.random() * 10) }}
        />
      ))}
    </div>
  );
}


export default function HomePage() {
  const { t } = useTranslation();
  const { user, isAdmin, hasRole } = useAuth();
  const [email, setEmail] = useState('');
  const [loadingNewsletter, setLoadingNewsletter] = useState(false);
  const [officialCommunities, setOfficialCommunities] = useState<Community[]>([]);
  const [loadingCommunities, setLoadingCommunities] = useState(true);
  const [featuredEvents, setFeaturedEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [featuredJobs, setFeaturedJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [recentPosts, setRecentPosts] = useState<DomainPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [hackathonCount, setHackathonCount] = useState(0);
  const [agentProtocols, setAgentProtocols] = useState<AIAgentProtocol[]>([]);
  const [tvlHistory, setTvlHistory] = useState<TVLHistoryPoint[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  const handleContributeClick = () => {
    if (!user) return '/login';
    if (isAdmin() || hasRole('editor')) return '/admin';
    return '/user';
  };

  const loadOfficialCommunities = async () => {
    try {
      setLoadingCommunities(true);
      const result = await communitiesService.getOfficial(6);
      if (result.data) {
        setOfficialCommunities(result.data);
      } else {
        setOfficialCommunities([]);
      }
    } catch {
      setOfficialCommunities([]);
    } finally {
      setLoadingCommunities(false);
    }
  };

  const loadFeaturedEvents = async () => {
    try {
      setLoadingEvents(true);
      const result = await eventsService.getFeatured(4);
      if (result.data) setFeaturedEvents(result.data);
      else setFeaturedEvents([]);
    } catch {
      setFeaturedEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadFeaturedJobs = async () => {
    try {
      setLoadingJobs(true);
      const result = await jobsService.getFeatured(4);
      if (result.data) setFeaturedJobs(result.data);
      else setFeaturedJobs([]);
    } catch {
      setFeaturedJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  };

  const loadRecentPosts = async () => {
    try {
      setLoadingPosts(true);
      const posts = await blogService.getRecent(3);
      setRecentPosts(posts);
    } catch {
      setRecentPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  };

  const loadHackathonCount = async () => {
    try {
      const data = await startupsService.getHackathonProjects();
      setHackathonCount(data?.length || 0);
    } catch {}
  };

  const loadAgentData = async () => {
    try {
      setLoadingAgents(true);
      const protocols = await defillamaService.getAIAgentProtocols();
      setAgentProtocols(protocols);
      // Load history separately so chart failure doesn't lose protocol data
      try {
        const history = await defillamaService.getTVLHistory(protocols, 90);
        setTvlHistory(history);
      } catch (historyErr) {
        console.warn('[HomePage] TVL history load failed:', historyErr);
        setTvlHistory([]);
      }
    } catch (err) {
      console.warn('[HomePage] Agent data load failed:', err);
      setAgentProtocols([]);
      setTvlHistory([]);
    } finally {
      setLoadingAgents(false);
    }
  };

  useEffect(() => {
    Promise.all([
      loadOfficialCommunities(),
      loadFeaturedEvents(),
      loadFeaturedJobs(),
      loadRecentPosts(),
      loadHackathonCount(),
      loadAgentData(),
    ]);
  }, []);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error(t('home.newsletter.error'));
      return;
    }
    setLoadingNewsletter(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success(t('home.newsletter.success'));
      setEmail('');
    } catch {
      toast.error(t('home.newsletter.error'));
    } finally {
      setLoadingNewsletter(false);
    }
  };

  // Compute aggregate TVL chart data (sum all protocols per day)
  const aggregateTVL = useMemo(() => {
    if (!tvlHistory.length) return [];
    return tvlHistory.map(point => {
      let total = 0;
      for (const [key, val] of Object.entries(point)) {
        if (key !== 'date' && key !== 'timestamp' && typeof val === 'number') {
          total += val;
        }
      }
      return { date: point.date, total };
    });
  }, [tvlHistory]);

  const totalTVL = useMemo(() => agentProtocols.reduce((sum, p) => sum + p.tvl, 0), [agentProtocols]);
  const activeProtocols = useMemo(() => agentProtocols.filter(p => p.tvl > 0).length, [agentProtocols]);

  const formatUSD = (val: number) => {
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  return (
    <div className="min-h-screen bg-black/95">
      {/* ░░░ HERO SECTION ░░░ */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-4 py-20 overflow-hidden">
        {/* Grid background */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(rgba(34,211,238,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.3) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="max-w-5xl mx-auto text-center space-y-8 relative z-10">
          {/* Terminal badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-black border border-cyan-500/30 font-mono">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-[11px] text-cyan-400 uppercase tracking-wider">
              <ScrambleText text={t('home.badge')} speed={25} iterations={10} />
            </span>
            <PixelSparkles className="text-cyan-400" size={14} />
          </div>

          {/* Main title - pixel/terminal style */}
          <h1 className="font-mono font-bold tracking-tight">
            <span className="block text-4xl md:text-6xl lg:text-7xl text-foreground">
              <ScrambleText text={t('home.hero.title')} speed={20} iterations={12} />
            </span>
            <span className="block text-4xl md:text-6xl lg:text-7xl mt-2 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-400 to-green-400">
              <ScrambleText text={t('home.hero.titleGradient')} speed={20} iterations={15} />
            </span>
          </h1>

          {/* Description */}
          <p className="text-base md:text-lg text-cyan-300/60 max-w-2xl mx-auto font-mono">
            {'> '}{t('home.hero.description')}
          </p>

          {/* CTA buttons - terminal style */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button
              size="lg"
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold uppercase tracking-wider px-8 border-0"
              asChild
            >
              <Link to="/startups">
                <PixelRocket className="mr-2" size={16} />
                {t('home.hero.exploreButton')}
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 font-mono uppercase tracking-wider px-8"
              asChild
            >
              <Link to={handleContributeClick()}>
                <PixelZap className="mr-2" size={16} />
                {t('home.hero.contributeButton')}
              </Link>
            </Button>
          </div>

          {/* Pixel bars decoration */}
          <div className="flex justify-center gap-1 pt-4" style={{ imageRendering: 'pixelated' as any }}>
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className={`${i % 3 === 0 ? 'bg-cyan-400' : i % 3 === 1 ? 'bg-teal-500' : 'bg-green-400'} opacity-40`}
                style={{ width: 3, height: 4 + Math.sin(i * 0.5) * 6 + 6 }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ░░░ AGENTIC WORLD HERO ░░░ */}
      <section className="py-16 px-4 relative overflow-hidden">
        {/* Subtle amber grid bg */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(245,158,11,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.4) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="max-w-5xl mx-auto relative z-10">
          {/* Terminal window */}
          <div className="border border-amber-500/30 bg-black/80">
            {/* Terminal header */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500/60" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                <div className="w-2 h-2 rounded-full bg-green-500/60" />
              </div>
              <span className="text-amber-400 text-[10px] font-mono ml-1">agentic_world.terminal</span>
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[9px] ml-auto font-mono">LIVE</Badge>
            </div>

            <div className="p-6 md:p-10 space-y-6">
              {/* Headline */}
              <div className="space-y-3">
                <h2 className="font-mono font-bold text-2xl md:text-4xl lg:text-5xl text-foreground leading-tight">
                  <ScrambleText text={t('home.agenticHero.title1')} speed={20} iterations={12} />
                </h2>
                <h2 className="font-mono font-bold text-2xl md:text-4xl lg:text-5xl text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 leading-tight">
                  <ScrambleText text={t('home.agenticHero.title2')} speed={20} iterations={15} />
                </h2>
                <p className="text-amber-300/50 text-sm md:text-base font-mono max-w-2xl">
                  {'> '}{t('home.agenticHero.description')}
                </p>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                <div className="border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="text-[10px] text-amber-400/60 font-mono uppercase">{t('home.agenticHero.totalTVL')}</div>
                  <div className="text-lg md:text-xl font-mono font-bold text-amber-300">
                    {loadingAgents ? '...' : <ScrambleText text={formatUSD(totalTVL)} speed={30} iterations={6} />}
                  </div>
                </div>
                <div className="border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="text-[10px] text-amber-400/60 font-mono uppercase">{t('home.agenticHero.protocols')}</div>
                  <div className="text-lg md:text-xl font-mono font-bold text-amber-300">
                    {loadingAgents ? '...' : <ScrambleText text={String(agentProtocols.length)} speed={30} iterations={6} />}
                  </div>
                </div>
                <div className="border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="text-[10px] text-amber-400/60 font-mono uppercase">{t('home.agenticHero.activeTVL')}</div>
                  <div className="text-lg md:text-xl font-mono font-bold text-amber-300">
                    {loadingAgents ? '...' : <ScrambleText text={String(activeProtocols)} speed={30} iterations={6} />}
                  </div>
                </div>
              </div>

              {/* Mini TVL Chart */}
              {aggregateTVL.length > 0 && (
                <div className="border border-amber-500/15 bg-black/40 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-amber-400/60 font-mono uppercase">{t('home.agenticHero.chartTitle')}</span>
                    <span className="text-[10px] text-amber-300/40 font-mono">Powered by DeFi Llama</span>
                  </div>
                  <div className="h-[160px] md:h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={aggregateTVL}>
                        <defs>
                          <linearGradient id="tvlGradientHome" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="date"
                          tick={{ fill: '#f59e0b80', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: string) => {
                            const d = new Date(v);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          }}
                          interval="preserveStartEnd"
                          minTickGap={50}
                        />
                        <YAxis
                          tick={{ fill: '#f59e0b80', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => formatUSD(v)}
                          width={55}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#000',
                            border: '1px solid rgba(245,158,11,0.3)',
                            borderRadius: '0',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                          }}
                          labelFormatter={(label: string) => {
                            const d = new Date(label);
                            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          }}
                          formatter={(value: number) => [formatUSD(value), 'Total TVL']}
                        />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          fill="url(#tvlGradientHome)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Loading state for chart */}
              {loadingAgents && (
                <div className="border border-amber-500/15 bg-black/40 p-4 h-[200px] flex items-center justify-center">
                  <div className="text-amber-400/40 text-sm font-mono animate-pulse">{'>'} {t('home.agenticHero.loading')}</div>
                </div>
              )}

              {/* CTA Button */}
              <div className="flex items-center gap-4 pt-2">
                <div className="relative group">
                  <div className="absolute -inset-[2px] rounded-sm bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 opacity-75 blur-[3px] group-hover:opacity-100 transition-opacity" style={{ animation: 'glow-spin-home 3s ease-in-out infinite' }} />
                  <Link
                    to="/agentic-world"
                    className="relative flex items-center gap-2.5 px-6 py-3.5 bg-gradient-to-r from-amber-900/80 to-amber-800/80 border border-amber-400/60 text-amber-300 hover:text-amber-100 text-sm font-bold font-mono tracking-wide transition-all hover:scale-[1.02] uppercase"
                  >
                    <Sparkles className="w-4 h-4" />
                    {t('home.agenticHero.cta', { defaultValue: 'ENTER AGENTIC WORLD' })}
                    <PixelArrowRight size={14} className="ml-1" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Glow animation */}
        <style>{`
          @keyframes glow-spin-home {
            0% { filter: hue-rotate(0deg) blur(3px); }
            50% { filter: hue-rotate(15deg) blur(4px); }
            100% { filter: hue-rotate(0deg) blur(3px); }
          }
        `}</style>
      </section>

      {/* ░░░ FEATURES GRID - Terminal Bento ░░░ */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Section header */}
          <div className="flex items-center gap-2 mb-8 font-mono">
            <span className="text-cyan-500 text-sm">{'>'}</span>
            <span className="text-cyan-400 text-sm uppercase tracking-wider">
              <ScrambleText text="ECOSYSTEM_MODULES" speed={25} iterations={8} />
            </span>
            <span className="w-2 h-2 bg-cyan-400 animate-pulse ml-1" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Startups - span 2 */}
            <div className="md:col-span-2 border border-cyan-500/20 bg-black/80 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5 transition-all">
              <TerminalHeader title="startups.module" />
              <div className="p-6 space-y-4">
                <div className="w-10 h-10 border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center">
                  <PixelRocket className="text-cyan-400" size={20} />
                </div>
                <h3 className="text-xl font-bold font-mono text-foreground">{t('home.features.startups.title')}</h3>
                <p className="text-cyan-300/50 text-sm font-mono">
                  {t('home.features.startups.description')}
                </p>
                <PixelBars count={12} color="cyan" />
                <Button variant="ghost" className="group text-cyan-400 hover:text-cyan-300 font-mono text-xs uppercase p-0 h-auto" asChild>
                  <Link to="/startups">
                    {'> '}{t('home.startups.viewAll')}
                    <PixelArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={14} />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Communities */}
            <div className="border border-cyan-500/20 bg-black/80 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5 transition-all">
              <TerminalHeader title="communities.module" />
              <div className="p-6 space-y-4">
                <div className="w-10 h-10 border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center">
                  <PixelUsers className="text-cyan-400" size={20} />
                </div>
                <h3 className="text-lg font-bold font-mono text-foreground">{t('home.features.communities.title')}</h3>
                <p className="text-cyan-300/50 text-sm font-mono line-clamp-2">
                  {t('home.features.communities.description')}
                </p>
                <PixelBars count={8} color="cyan" />
                <Button variant="ghost" className="group text-cyan-400 hover:text-cyan-300 font-mono text-xs uppercase p-0 h-auto" asChild>
                  <Link to="/comunidades">
                    {'> '}{t('home.communities.viewAll')}
                    <PixelArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={14} />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Events */}
            <div className="border border-cyan-500/20 bg-black/80 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5 transition-all">
              <TerminalHeader title="events.module" />
              <div className="p-6 space-y-4">
                <div className="w-10 h-10 border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center">
                  <PixelCalendar className="text-cyan-400" size={20} />
                </div>
                <h3 className="text-lg font-bold font-mono text-foreground">{t('home.features.events.title')}</h3>
                <p className="text-cyan-300/50 text-sm font-mono line-clamp-2">
                  {t('home.features.events.description')}
                </p>
                <PixelBars count={8} color="green" />
                <Button variant="ghost" className="group text-cyan-400 hover:text-cyan-300 font-mono text-xs uppercase p-0 h-auto" asChild>
                  <Link to="/eventos">
                    {'> '}{t('home.events.viewAll')}
                    <PixelArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={14} />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Jobs */}
            <div className="border border-amber-500/20 bg-black/80 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5 transition-all">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/60" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                  <div className="w-2 h-2 rounded-full bg-green-500/60" />
                </div>
                <span className="text-amber-400 text-[10px] font-mono ml-1">jobs.web3</span>
              </div>
              <div className="p-6 space-y-4">
                <div className="w-10 h-10 border border-amber-500/30 bg-amber-500/10 flex items-center justify-center">
                  <PixelTarget className="text-amber-400" size={20} />
                </div>
                <h3 className="text-lg font-bold font-mono text-foreground">{t('home.jobs.title')}</h3>
                <p className="text-amber-300/50 text-sm font-mono line-clamp-2">
                  {t('home.jobs.description')}
                </p>
                <PixelBars count={8} color="amber" />
                <Button variant="ghost" className="group text-amber-400 hover:text-amber-300 font-mono text-xs uppercase p-0 h-auto" asChild>
                  <Link to="/ecosistema/trabajos">
                    {'> '}{t('home.jobs.viewJobs')}
                    <PixelArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={14} />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Blog */}
            <div className="border border-violet-500/20 bg-black/80 hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/5 transition-all">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border-b border-violet-500/20">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/60" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                  <div className="w-2 h-2 rounded-full bg-green-500/60" />
                </div>
                <span className="text-violet-400 text-[10px] font-mono ml-1">blog.reports</span>
              </div>
              <div className="p-6 space-y-4">
                <div className="w-10 h-10 border border-violet-500/30 bg-violet-500/10 flex items-center justify-center">
                  <PixelSparkles className="text-violet-400" size={20} />
                </div>
                <h3 className="text-lg font-bold font-mono text-foreground">{t('home.blog.title')}</h3>
                <p className="text-violet-300/50 text-sm font-mono line-clamp-2">
                  {t('home.blog.description')}
                </p>
                <PixelBars count={8} color="violet" />
                <Button variant="ghost" className="group text-violet-400 hover:text-violet-300 font-mono text-xs uppercase p-0 h-auto" asChild>
                  <Link to="/blog">
                    {'> '}{t('home.blog.readArticles')}
                    <PixelArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={14} />
                  </Link>
                </Button>
              </div>
            </div>

            {/* MVPs Hackathon - span 2 */}
            <div className="md:col-span-2 border border-green-500/20 bg-black/80 hover:border-green-500/40 hover:shadow-lg hover:shadow-green-500/5 transition-all">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border-b border-green-500/20">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/60" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                  <div className="w-2 h-2 rounded-full bg-green-500/60" />
                </div>
                <span className="text-green-400 text-[10px] font-mono ml-1">hackathon.mvp</span>
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[9px] ml-auto font-mono">MVP</Badge>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 border border-green-500/30 bg-green-500/10 flex items-center justify-center">
                    <PixelTrophy className="text-green-400" size={20} />
                  </div>
                  {hackathonCount > 0 && (
                    <span className="text-green-400 font-mono text-2xl font-bold">
                      <ScrambleText text={String(hackathonCount)} speed={30} iterations={6} />
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold font-mono text-foreground">{t('home.hackathon.title')}</h3>
                <p className="text-green-300/50 text-sm font-mono">
                  {t('home.hackathon.description')}
                  {hackathonCount > 0 && <span className="text-green-400"> {t('home.hackathon.projectsRegistered', { count: hackathonCount })}</span>}
                </p>
                <PixelBars count={12} color="green" />
                <Button variant="ghost" className="group text-green-400 hover:text-green-300 font-mono text-xs uppercase p-0 h-auto" asChild>
                  <Link to="/hackathon-projects">
                    {'> '}{t('home.hackathon.viewProjects')}
                    <PixelArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={14} />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ░░░ FEATURED COMMUNITIES ░░░ */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2 font-mono">
              <span className="text-cyan-500 text-sm">{'>'}</span>
              <h2 className="text-xl md:text-2xl font-bold text-foreground uppercase tracking-wider">
                <ScrambleText text={t('home.communities.title')} speed={25} iterations={8} />
              </h2>
              <span className="w-2 h-2 bg-cyan-400 animate-pulse ml-1" />
            </div>
            <Button variant="outline" className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 font-mono text-xs uppercase" asChild>
              <Link to="/comunidades">{t('common.viewMore')}</Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {loadingCommunities ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="border border-cyan-500/20 bg-black/80 p-6 animate-pulse">
                  <div className="w-10 h-10 bg-cyan-500/10 mb-4" />
                  <div className="h-5 bg-cyan-500/10 mb-2 w-3/4" />
                  <div className="h-4 bg-cyan-500/5 w-full mb-3" />
                  <div className="h-3 bg-cyan-500/5 w-16" />
                </div>
              ))
            ) : officialCommunities.length > 0 ? (
              officialCommunities.slice(0, 3).map((community) => (
                <Link
                  key={community.id}
                  to={`/comunidades/${community.slug || community.id}`}
                  className="border border-cyan-500/20 bg-black/80 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5 transition-all group"
                >
                  <TerminalHeader title={`community.${(community.slug || community.name).slice(0, 12)}`} />
                  <div className="p-6 space-y-3">
                    {(() => {
                      const socialLinks = (community as any).links || community.social_links || {};
                      const imageUrl = (community as any).image_url || community.logo_url;
                      const twitterAvatar = getTwitterAvatar(socialLinks?.twitter);
                      const displayImage = imageUrl || twitterAvatar;

                      return displayImage ? (
                        <img
                          src={displayImage}
                          alt={community.name}
                          loading="lazy"
                          className="w-10 h-10 object-cover border border-cyan-500/30"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null;
                    })()}
                    <div className={`w-10 h-10 border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center ${((community as any).image_url || community.logo_url || getTwitterAvatar(((community as any).links || community.social_links)?.twitter)) ? 'hidden' : ''}`}>
                      <PixelUsers className="text-cyan-400" size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold font-mono text-foreground group-hover:text-cyan-400 transition-colors">
                        {community.name}
                      </h3>
                      <p className="text-cyan-300/40 text-xs font-mono line-clamp-2 mt-1">
                        {community.description}
                      </p>
                    </div>
                    <div className="flex items-center text-xs text-cyan-400/60 font-mono">
                      <PixelUsers className="mr-1" size={14} />
                      {community.member_count?.toLocaleString() || '0'} {t('home.communities.members')}
                    </div>
                    <PixelBars count={6} color="cyan" />
                  </div>
                </Link>
              ))
            ) : (
              <div className="col-span-full text-center py-12 border border-cyan-500/20 bg-black/80">
                <PixelUsers className="text-cyan-500/40 mx-auto mb-4" size={48} />
                <h3 className="text-lg font-mono text-cyan-400/60">{t('common.noCommunities')}</h3>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ░░░ EVENTS ░░░ */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2 font-mono">
              <span className="text-green-500 text-sm">{'>'}</span>
              <h3 className="text-xl md:text-2xl font-bold text-foreground uppercase tracking-wider">
                <ScrambleText text={t('home.events.title')} speed={25} iterations={8} />
              </h3>
              <span className="w-2 h-2 bg-green-400 animate-pulse ml-1" />
            </div>
            <Button variant="outline" className="border-green-500/30 text-green-400 hover:bg-green-500/10 font-mono text-xs uppercase" asChild>
              <Link to="/eventos">{t('common.viewMore')}</Link>
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {loadingEvents ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border border-green-500/20 bg-black/80 p-6 animate-pulse">
                  <div className="h-4 bg-green-500/10 w-20 mb-3" />
                  <div className="h-5 bg-green-500/10 w-3/4 mb-2" />
                  <div className="h-4 bg-green-500/5 w-full" />
                </div>
              ))
            ) : featuredEvents.length > 0 ? (
              featuredEvents.slice(0, 4).map((event) => (
                <Link
                  key={event.id}
                  to={`/eventos/${event.id}`}
                  className="block border border-green-500/20 bg-black/80 hover:border-green-500/40 hover:shadow-lg hover:shadow-green-500/5 transition-all group"
                >
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border-b border-green-500/20">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500/60" />
                      <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                      <div className="w-2 h-2 rounded-full bg-green-500/60" />
                    </div>
                    <span className="text-green-400 text-[10px] font-mono ml-1">
                      event.{event.event_type || 'live'}
                    </span>
                    <span className="text-green-300/40 text-[10px] font-mono ml-auto">
                      {event.start_date ? formatDate(event.start_date) : t('common.dateTBD')}
                    </span>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px] font-mono">
                        {event.event_type === 'presencial' ? t('common.presencial') :
                         event.event_type === 'online' ? t('common.online') : t('common.hibrido')}
                      </Badge>
                    </div>
                    <h3 className="text-base font-bold font-mono text-foreground group-hover:text-green-400 transition-colors line-clamp-2">
                      {event.title}
                    </h3>
                    <p className="text-green-300/40 text-xs font-mono line-clamp-2">
                      {event.description || t('events.description')}
                    </p>
                    <span className="text-green-400 text-[10px] font-mono uppercase group-hover:translate-x-1 transition-transform inline-flex items-center">
                      {'> '}{t('common.viewDetails')}
                      <PixelArrowRight className="ml-1" size={12} />
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="col-span-full text-center py-12 border border-green-500/20 bg-black/80">
                <PixelCalendar className="text-green-500/40 mx-auto mb-4" size={48} />
                <h4 className="font-mono text-green-400/60 mb-2">{t('common.upcomingEvents')}</h4>
                <p className="text-green-300/30 text-xs font-mono">{t('common.upcomingEventsDesc')}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ░░░ JOBS ░░░ */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2 font-mono">
              <span className="text-amber-500 text-sm">{'>'}</span>
              <h2 className="text-xl md:text-2xl font-bold text-foreground uppercase tracking-wider">
                <ScrambleText text={t('home.jobs.title')} speed={25} iterations={8} />
              </h2>
              <span className="w-2 h-2 bg-amber-400 animate-pulse ml-1" />
            </div>
            <Button variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 font-mono text-xs uppercase" asChild>
              <Link to="/ecosistema/trabajos">{t('common.viewMore')}</Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {loadingJobs ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border border-amber-500/20 bg-black/80 p-6 animate-pulse">
                  <div className="h-4 bg-amber-500/10 w-24 mb-3" />
                  <div className="h-5 bg-amber-500/10 w-3/4 mb-2" />
                  <div className="h-4 bg-amber-500/5 w-1/2" />
                </div>
              ))
            ) : featuredJobs.length > 0 ? (
              featuredJobs.slice(0, 4).map((job) => (
                <Link
                  key={job.id}
                  to="/ecosistema/trabajos"
                  className="block border border-amber-500/20 bg-black/80 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5 transition-all group"
                >
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500/60" />
                      <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                      <div className="w-2 h-2 rounded-full bg-green-500/60" />
                    </div>
                    <span className="text-amber-400 text-[10px] font-mono ml-1">job.{job.job_type || 'remote'}</span>
                    {job.is_featured && (
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[9px] font-mono ml-auto">
                        FEATURED
                      </Badge>
                    )}
                  </div>
                  <div className="p-5 space-y-3">
                    <h3 className="text-base font-bold font-mono text-foreground group-hover:text-amber-400 transition-colors line-clamp-1">
                      {job.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-amber-300/50 font-mono">
                      <span className="text-amber-400">{job.company}</span>
                      <span className="text-amber-500/30">|</span>
                      <span>{job.location}</span>
                    </div>
                    {job.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {job.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[10px] px-2 py-0.5 border border-amber-500/20 text-amber-400/60 font-mono">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              ))
            ) : (
              <div className="col-span-full text-center py-12 border border-amber-500/20 bg-black/80">
                <PixelTarget className="text-amber-500/40 mx-auto mb-4" size={48} />
                <h4 className="font-mono text-amber-400/60 mb-2">{t('home.jobs.comingSoon')}</h4>
                <p className="text-amber-300/30 text-xs font-mono">{t('home.jobs.comingSoonDesc')}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ░░░ BLOG ░░░ */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2 font-mono">
              <span className="text-violet-500 text-sm">{'>'}</span>
              <h2 className="text-xl md:text-2xl font-bold text-foreground uppercase tracking-wider">
                <ScrambleText text={t('home.blog.title')} speed={25} iterations={8} />
              </h2>
              <span className="w-2 h-2 bg-violet-400 animate-pulse ml-1" />
            </div>
            <Button variant="outline" className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10 font-mono text-xs uppercase" asChild>
              <Link to="/blog">{t('common.viewMore')}</Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {loadingPosts ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="border border-violet-500/20 bg-black/80 overflow-hidden animate-pulse">
                  <div className="h-36 bg-violet-500/5" />
                  <div className="p-5">
                    <div className="h-4 bg-violet-500/10 w-20 mb-3" />
                    <div className="h-5 bg-violet-500/10 w-3/4 mb-2" />
                    <div className="h-4 bg-violet-500/5 w-full" />
                  </div>
                </div>
              ))
            ) : recentPosts.length > 0 ? (
              recentPosts.map((post) => (
                <Link
                  key={post.id}
                  to={`/blog/${post.slug}`}
                  className="border border-violet-500/20 bg-black/80 overflow-hidden hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/5 transition-all group"
                >
                  {post.image_url && (
                    <div className="h-36 overflow-hidden border-b border-violet-500/20">
                      <img
                        src={post.image_url}
                        alt={post.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80 group-hover:opacity-100"
                      />
                    </div>
                  )}
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      {post.categories?.[0] && (
                        <Badge className="bg-violet-500/10 text-violet-400 border-violet-500/20 text-[10px] font-mono">
                          {post.categories[0]}
                        </Badge>
                      )}
                      {post.reading_time_minutes && (
                        <span className="text-[10px] text-violet-300/40 font-mono">{post.reading_time_minutes} min</span>
                      )}
                    </div>
                    <h3 className="text-base font-bold font-mono text-foreground group-hover:text-violet-400 transition-colors line-clamp-2">
                      {post.title}
                    </h3>
                    <p className="text-violet-300/40 text-xs font-mono line-clamp-2">
                      {post.excerpt}
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <div className="col-span-full text-center py-12 border border-violet-500/20 bg-black/80">
                <PixelSparkles className="text-violet-500/40 mx-auto mb-4" size={48} />
                <h4 className="font-mono text-violet-400/60 mb-2">{t('home.blog.comingSoon')}</h4>
                <p className="text-violet-300/30 text-xs font-mono">{t('home.blog.comingSoonDesc')}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ░░░ METRICS CTA ░░░ */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <Link
            to="/metricas"
            className="block border border-cyan-500/20 bg-black/80 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5 transition-all group"
          >
            <TerminalHeader title="metrics.dashboard" />
            <div className="flex flex-col md:flex-row items-center gap-6 p-6">
              <div className="w-14 h-14 border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center shrink-0">
                <PixelLobster className="text-cyan-400" size={28} />
              </div>
              <div className="text-center md:text-left flex-1">
                <h3 className="text-xl font-bold font-mono text-foreground group-hover:text-cyan-400 transition-colors mb-1">
                  {t('home.metrics.title')}
                </h3>
                <p className="text-cyan-300/40 text-sm font-mono">
                  {t('home.metrics.description')}
                </p>
              </div>
              <PixelArrowRight className="text-cyan-400 group-hover:translate-x-2 transition-transform" size={24} />
            </div>
          </Link>
        </div>
      </section>

      {/* ░░░ NEWSLETTER ░░░ */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto border border-cyan-500/20 bg-black/80 overflow-hidden">
          <TerminalHeader title="newsletter.subscribe" />
          <div className="p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold font-mono text-foreground mb-4">
              <ScrambleText text={t('home.newsletter.title')} speed={25} iterations={10} />
            </h2>
            <p className="text-cyan-300/40 text-sm font-mono mb-8 max-w-2xl mx-auto">
              {t('home.newsletter.description')}
            </p>
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <Input
                type="email"
                placeholder={t('home.newsletter.placeholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-black/60 border-cyan-500/30 text-cyan-300 placeholder:text-cyan-500/30 font-mono focus:border-cyan-400"
                required
              />
              <Button
                type="submit"
                disabled={loadingNewsletter}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold uppercase tracking-wider border-0"
              >
                {loadingNewsletter ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin mr-2" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    <PixelMail className="mr-2" size={16} />
                    {t('home.newsletter.button')}
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
