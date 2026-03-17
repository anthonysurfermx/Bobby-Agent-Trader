import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Calendar, Globe, Users, FileText, Plus, Clock, CheckCircle, XCircle, Briefcase, Star, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { useProposals } from "@/hooks/useProposals";
import { useAuth } from "@/hooks/useAuth";
import { useFollowedWallets } from "@/hooks/useFollowedWallets";
import { polymarketService, type AgentMetrics } from "@/services/polymarket.service";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { toast } from "sonner";

function formatUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function UserDashboard() {
  const navigate = useNavigate();
  const { isEditor, role } = useUserRole();
  const { user } = useAuth();
  const { proposals, loading } = useProposals({
    userId: user?.id,
    autoFetch: true
  });

  const { wallets: followedWallets, loading: walletsLoading, unfollow, followsRemaining, followLimit } = useFollowedWallets();
  const [walletMetrics, setWalletMetrics] = useState<Record<string, AgentMetrics>>({});
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    if (followedWallets.length === 0) return;
    setMetricsLoading(true);
    Promise.all(
      followedWallets.map(async (w) => {
        const m = await polymarketService.getAgentMetrics(w.wallet_address);
        return { address: w.wallet_address, metrics: m };
      })
    ).then((results) => {
      const map: Record<string, AgentMetrics> = {};
      results.forEach(r => { map[r.address] = r.metrics; });
      setWalletMetrics(map);
    }).finally(() => setMetricsLoading(false));
  }, [followedWallets]);

  const proposalCards = [
    {
      title: "Proponer Comunidad",
      description: "Añade una comunidad DeFi a la plataforma",
      icon: Globe,
      path: "/user/comunidades/nueva",
      color: "from-blue-500 to-cyan-500",
    },
    {
      title: "Proponer Evento",
      description: "Crea un nuevo evento para la comunidad",
      icon: Calendar,
      path: "/user/eventos/nuevo",
      color: "from-purple-500 to-pink-500",
    },
    {
      title: "Proponer Startup",
      description: "Registra tu startup en el ecosistema",
      icon: Building2,
      path: "/user/startups/nueva",
      color: "from-green-500 to-emerald-500",
    },
    {
      title: "Proponer Referente",
      description: "Nomina a un referente DeFi en México",
      icon: Users,
      path: "/user/referentes/nuevo",
      color: "from-orange-500 to-red-500",
    },
    {
      title: "Publicar Trabajo Web3",
      description: "Publica una oferta de trabajo en el ecosistema",
      icon: Briefcase,
      path: "/user/trabajos/nuevo",
      color: "from-amber-500 to-yellow-500",
    },
  ];

  // Solo editores pueden crear blog posts
  if (isEditor) {
    proposalCards.push({
      title: "Crear Blog Post",
      description: "Escribe un nuevo artículo para el blog",
      icon: FileText,
      path: "/user/blog/nuevo",
      color: "from-indigo-500 to-blue-500",
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {isEditor ? "Panel de Editor" : "Panel de Usuario"}
        </h1>
        <p className="text-muted-foreground">
          {isEditor
            ? "Gestiona tus propuestas y crea contenido para el blog"
            : "Contribuye al ecosistema DeFi México con tus propuestas"}
        </p>
      </div>

      {/* Role Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        Rol: {role === 'editor' ? 'Editor' : 'Usuario'}
      </div>

      {/* Followed Wallets */}
      <Card className="border-cyan-200 dark:border-cyan-800/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500" />
                Followed Wallets
              </CardTitle>
              <CardDescription>
                Polymarket wallets you're tracking ({followedWallets.length}/{followLimit} free)
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/agentic-world/polymarket')}
            >
              <Plus className="w-4 h-4 mr-1" />
              Find Wallets
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {walletsLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading wallets...
            </div>
          ) : followedWallets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No followed wallets yet</p>
              <p className="text-sm mt-2">
                Analyze a wallet in the{' '}
                <button
                  onClick={() => navigate('/agentic-world/polymarket')}
                  className="text-cyan-500 hover:underline"
                >
                  Polymarket Agent Radar
                </button>
                {' '}and click Follow
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {followedWallets.map((w) => {
                const m = walletMetrics[w.wallet_address];
                return (
                  <div
                    key={w.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">
                          {w.label || shortAddr(w.wallet_address)}
                        </span>
                        {w.label && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {shortAddr(w.wallet_address)}
                          </span>
                        )}
                      </div>
                      {metricsLoading ? (
                        <div className="flex items-center gap-1 mt-1">
                          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Loading...</span>
                        </div>
                      ) : m ? (
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>Portfolio: <span className="font-medium text-foreground">{formatUsd(m.portfolioValue)}</span></span>
                          <span>
                            PnL:{' '}
                            <span className={`font-medium ${m.profitPnL != null && m.profitPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {m.profitPnL != null ? `${m.profitPnL >= 0 ? '+' : ''}${formatUsd(m.profitPnL)}` : 'N/A'}
                            </span>
                          </span>
                          <span>{m.openPositions} positions</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => navigate(`/agentic-world/consensus?wallet=${w.wallet_address}`)}
                        title="Analyze"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600"
                        onClick={async () => {
                          try {
                            await unfollow(w.wallet_address);
                            toast.success('Wallet unfollowed');
                          } catch {
                            toast.error('Failed to unfollow');
                          }
                        }}
                        title="Unfollow"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Proposals Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {proposalCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="group hover:shadow-lg transition-all duration-300 cursor-pointer border-2 hover:border-primary/50">
                <CardHeader>
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => navigate(card.path)}
                    className="w-full"
                    variant="outline"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Crear Propuesta
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* My Proposals Section */}
      <Card>
        <CardHeader>
          <CardTitle>Mis Propuestas</CardTitle>
          <CardDescription>
            Historial de tus propuestas y su estado actual
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Cargando propuestas...</p>
            </div>
          ) : proposals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No tienes propuestas aún</p>
              <p className="text-sm mt-2">Crea tu primera propuesta usando las tarjetas de arriba</p>
            </div>
          ) : (
            <div className="space-y-4">
              {proposals.map((proposal) => {
                const typeIcons = {
                  community: Globe,
                  event: Calendar,
                  startup: Building2,
                  referent: Users,
                  blog: FileText,
                  course: FileText,
                  job: Briefcase
                };
                const TypeIcon = typeIcons[proposal.content_type] || FileText;

                const statusConfig = {
                  pending: { icon: Clock, label: 'Pendiente', color: 'bg-yellow-500' },
                  approved: { icon: CheckCircle, label: 'Aprobada', color: 'bg-green-500' },
                  rejected: { icon: XCircle, label: 'Rechazada', color: 'bg-red-500' }
                };
                const status = statusConfig[proposal.status];
                const StatusIcon = status.icon;

                return (
                  <div
                    key={proposal.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <TypeIcon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">
                          {proposal.content_data.name || proposal.content_data.title || 'Sin título'}
                        </h4>
                        <p className="text-sm text-muted-foreground capitalize">
                          {proposal.content_type === 'community' ? 'Comunidad' :
                           proposal.content_type === 'event' ? 'Evento' :
                           proposal.content_type === 'startup' ? 'Startup' :
                           proposal.content_type === 'referent' ? 'Referente' :
                           proposal.content_type === 'blog' ? 'Blog' :
                           proposal.content_type === 'job' ? 'Trabajo' : 'Curso'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={proposal.status === 'approved' ? 'default' : proposal.status === 'rejected' ? 'destructive' : 'secondary'}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {status.label}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground ml-4">
                      {new Date(proposal.created_at).toLocaleDateString('es-MX')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                ¿Cómo funciona el proceso?
              </p>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                1. Crea tu propuesta con la información solicitada<br/>
                2. El equipo de DeFi México revisará tu propuesta<br/>
                3. Recibirás una notificación cuando sea aprobada o si requiere cambios<br/>
                {isEditor && "4. Como editor, también puedes crear blog posts directamente"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
