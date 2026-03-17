import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Shield, 
  DollarSign, 
  Clock, 
  Filter, 
  Eye,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Loader2,
  RefreshCw,
  Database,
  Globe,
  Calculator
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import StatsCard from '@/components/ui/stats-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

// Servicios para datos reales
import { fintechService, type FintechFund } from '@/services/fintech.service';
import { vaultsService, type VaultData } from '@/services/vaults.service';

// Componentes
import APYCalculator from '@/components/calculators/APYCalculator';

// Tipos unificados para la comparativa
interface InvestmentOpportunity {
  id: string;
  name: string;
  platform: string;
  apy: number;
  currency: string;
  risk: string;
  type: string;
  horizon: string;
  tvl: string;
  description: string;
  source: 'fintech' | 'defi';
  url?: string;
}

const InvestmentOpportunitiesPage = () => {
  const [viewMode, setViewMode] = useState<'comparison' | 'traditional' | 'defi'>('comparison');
  const [filters, setFilters] = useState({
    currency: 'all',
    risk: 'all', 
    platform: 'all',
    minApy: [0]
  });
  
  // Estados para datos reales
  const [fintechFunds, setFintechFunds] = useState<FintechFund[]>([]);
  const [defiVaults, setDefiVaults] = useState<VaultData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFintech, setLoadingFintech] = useState(true);
  const [loadingDefi, setLoadingDefi] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showCalculator, setShowCalculator] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<InvestmentOpportunity | null>(null);

  // Cargar datos de fintech (Supabase)
  const loadFintechData = async () => {
    try {
      setLoadingFintech(true);
      console.log('🏦 Cargando datos fintech...');
      
      const { data, error } = await fintechService.getFunds();
      
      if (error) {
        console.error('❌ Error cargando fintech:', error);
        return;
      }
      
      if (data) {
        setFintechFunds(data);
        console.log(`✅ ${data.length} fondos fintech cargados`);
      }
    } catch (error) {
      console.error('❌ Error en loadFintechData:', error);
    } finally {
      setLoadingFintech(false);
    }
  };

  // Cargar datos de DeFi (Vaults.fyi API)
  const loadDefiData = async () => {
    try {
      setLoadingDefi(true);
      console.log('⚡ Cargando datos DeFi...');
      
      const { data, error } = await vaultsService.getVaults({ 
        min_apy: 1,
        limit: 20 
      });
      
      if (error) {
        console.warn('⚠️ Error API DeFi, usando datos mock:', error);
      }
      
      setDefiVaults(data || []);
      console.log(`✅ ${data?.length || 0} vaults DeFi cargados`);
    } catch (error) {
      console.error('❌ Error en loadDefiData:', error);
    } finally {
      setLoadingDefi(false);
    }
  };

  // Cargar estadísticas
  const loadStats = async () => {
    try {
      const [fintechStatsResult, defiStatsResult] = await Promise.all([
        fintechService.getFintechStats(),
        vaultsService.getVaultsStats()
      ]);

      const bestFintech = fintechFunds.length > 0 ? Math.max(...fintechFunds.map(f => f.apy)) : 0;
      const bestDefi = defiVaults.length > 0 ? Math.max(...defiVaults.map(v => v.apy)) : 0;
      
      // Calcular promedio USD/estables
      const stableAssets = ['USD', 'USDC', 'USDT', 'DAI', 'MXN'];
      const allOpportunities = transformAllData();
      const stableOpportunities = allOpportunities.filter(o => 
        stableAssets.includes(o.currency.toUpperCase())
      );
      const avgStable = stableOpportunities.length > 0 
        ? stableOpportunities.reduce((sum, o) => sum + o.apy, 0) / stableOpportunities.length
        : 0;

      setStats({
        bestFintech,
        bestDefi,
        avgStable,
        totalOpportunities: allOpportunities.length,
        fintechCount: fintechFunds.length,
        defiCount: defiVaults.length,
        fintechStats: fintechStatsResult.data,
        defiStats: defiStatsResult.data
      });
    } catch (error) {
      console.error('❌ Error cargando estadísticas:', error);
    }
  };

  // Cargar datos iniciales
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadFintechData(), loadDefiData()]);
      setLoading(false);
      setLastRefresh(new Date());
    };
    loadData();
  }, []);

  // Recalcular estadísticas cuando cambien los datos
  useEffect(() => {
    if (!loadingFintech && !loadingDefi) {
      loadStats();
    }
  }, [fintechFunds, defiVaults, loadingFintech, loadingDefi]);

  // Transformar datos fintech al formato unificado
  const transformFintechData = (): InvestmentOpportunity[] => {
    return fintechFunds.map(fund => ({
      id: fund.id,
      name: fund.name,
      platform: fund.platform,
      apy: fund.apy,
      currency: fund.currency,
      risk: fund.risk_level,
      type: fund.fund_type,
      horizon: fund.investment_horizon,
      tvl: fund.tvl || 'N/A',
      description: fund.description || '',
      source: 'fintech',
      url: fund.website_url
    }));
  };

  // Transformar datos DeFi al formato unificado
  const transformDefiData = (): InvestmentOpportunity[] => {
    return defiVaults.map(vault => ({
      id: vault.id,
      name: vault.name,
      platform: vault.protocol,
      apy: vault.apy,
      currency: vault.asset,
      risk: vault.risk_score ? getRiskFromScore(vault.risk_score) : 'Medio',
      type: capitalizeCategory(vault.category),
      horizon: 'Flexible',
      tvl: formatTVL(vault.tvl),
      description: `${vault.category} en ${vault.network}`,
      source: 'defi'
    }));
  };

  // Combinar todos los datos
  const transformAllData = (): InvestmentOpportunity[] => {
    return [...transformFintechData(), ...transformDefiData()];
  };

  // Utilidades
  const getRiskFromScore = (score: number): string => {
    if (score <= 3) return 'Bajo';
    if (score <= 7) return 'Medio';
    return 'Alto';
  };

  const capitalizeCategory = (category: string): string => {
    return category.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatTVL = (tvl: number): string => {
    if (tvl >= 1e9) return `${(tvl / 1e9).toFixed(1)}B`;
    if (tvl >= 1e6) return `${(tvl / 1e6).toFixed(1)}M`;
    if (tvl >= 1e3) return `${(tvl / 1e3).toFixed(1)}K`;
    return tvl.toString();
  };

  // Filtrar oportunidades según viewMode y filtros
  const filteredOpportunities = useMemo(() => {
    let opportunities: InvestmentOpportunity[] = [];
    
    switch (viewMode) {
      case 'traditional':
        opportunities = transformFintechData();
        break;
      case 'defi':
        opportunities = transformDefiData();
        break;
      default:
        opportunities = transformAllData();
    }

    // Aplicar filtros
    return opportunities.filter(item => {
      if (filters.currency !== 'all' && !item.currency.toLowerCase().includes(filters.currency.toLowerCase())) return false;
      if (filters.risk !== 'all' && item.risk !== filters.risk) return false;
      if (filters.platform !== 'all' && item.platform !== filters.platform) return false;
      if (item.apy < filters.minApy[0]) return false;
      return true;
    }).sort((a, b) => b.apy - a.apy); // Ordenar por APY descendente
  }, [viewMode, filters, fintechFunds, defiVaults]);

  // Funciones para filtros
  const handleRefresh = async () => {
    await Promise.all([loadFintechData(), loadDefiData()]);
    setLastRefresh(new Date());
  };

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'bajo': return 'text-emerald-500';
      case 'medio': return 'text-yellow-500';
      case 'alto': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  const getRiskIcon = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'bajo': return CheckCircle2;
      case 'medio': return AlertTriangle;
      case 'alto': return Activity;
      default: return Shield;
    }
  };

  const getSourceIcon = (source: 'fintech' | 'defi') => {
    return source === 'fintech' ? Database : Globe;
  };

  const getSourceColor = (source: 'fintech' | 'defi') => {
    return source === 'fintech' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando análisis de APY...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header Principal */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-dark opacity-50" />
        <div className="relative container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-4xl mx-auto"
          >
            <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
              Benchmarking de APY
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Compara los mejores rendimientos entre inversiones tradicionales y descentralizadas
            </p>
            
            <div className="flex items-center justify-center gap-4 mb-6">
              <Badge variant="outline" className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                Fintech: {loadingFintech ? '...' : fintechFunds.length}
              </Badge>
              <Badge variant="outline" className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                DeFi: {loadingDefi ? '...' : defiVaults.length}
              </Badge>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={loadingFintech || loadingDefi}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingFintech || loadingDefi ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
              <Dialog open={showCalculator} onOpenChange={setShowCalculator}>
                <DialogTrigger asChild>
                  <Button variant="default" size="sm">
                    <Calculator className="w-4 h-4 mr-2" />
                    Calculadora APY
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Calculadora de Rendimientos</DialogTitle>
                  </DialogHeader>
                  <APYCalculator 
                    defaultAPY={selectedOpportunity?.apy || stats?.bestFintech || 10}
                    defaultCurrency={selectedOpportunity?.currency || 'MXN'}
                  />
                </DialogContent>
              </Dialog>
            </div>
            
            {/* Toggle de Vista */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-fit mx-auto">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="comparison">Comparativa</TabsTrigger>
                <TabsTrigger value="traditional">Fintech</TabsTrigger>
                <TabsTrigger value="defi">DeFi</TabsTrigger>
              </TabsList>
            </Tabs>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Aviso Importante - Movido arriba para mayor visibilidad */}
        <Card className="mb-8 border-yellow-200 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="space-y-2">
                <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">
                  ⚠️ Aviso Importante - Lee antes de invertir
                </h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  <strong>Datos Fintech:</strong> Son estáticos y obtenidos de fuentes públicas. Los APYs pueden haber cambiado.<br/>
                  <strong>Datos DeFi:</strong> Son dinámicos pero provienen de protocolos no regulados con riesgos adicionales.<br/>
                  <strong>Importante:</strong> Los rendimientos pasados no garantizan rendimientos futuros. Esta herramienta es educativa y NO constituye asesoría financiera.
                  Siempre realiza tu propia investigación (DYOR) y consulta con un asesor financiero calificado antes de invertir.
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  Última actualización: {lastRefresh.toLocaleString('es-MX')} | Los datos pueden no estar actualizados
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Métricas Clave */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Mejor APY Fintech"
            value={`${stats?.bestFintech?.toFixed(2) || '0.00'}%`}
            description="Tradicional"
            icon={TrendingUp}
            trend={{ value: "Estático", isPositive: true }}
          />
          <StatsCard
            title="Mejor APY DeFi"
            value={`${stats?.bestDefi?.toFixed(2) || '0.00'}%`}
            description="Descentralizado"
            icon={DollarSign}
            trend={{ value: "Dinámico", isPositive: true }}
          />
          <StatsCard
            title="Promedio Estables"
            value={`${stats?.avgStable?.toFixed(2) || '0.00'}%`}
            description="USD/MXN/USDC/DAI"
            icon={Shield}
          />
          <StatsCard
            title="Total Oportunidades"
            value={stats?.totalOpportunities?.toString() || '0'}
            description={`${stats?.fintechCount || 0} Fintech + ${stats?.defiCount || 0} DeFi`}
            icon={Activity}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filtros Laterales */}
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-2 block">Tipo de Activo</label>
                <Select value={filters.currency} onValueChange={(v) => setFilters(f => ({ ...f, currency: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="MXN">MXN</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                    <SelectItem value="USDT">USDT</SelectItem>
                    <SelectItem value="DAI">DAI</SelectItem>
                    <SelectItem value="ETH">ETH</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Nivel de Riesgo</label>
                <Select value={filters.risk} onValueChange={(v) => setFilters(f => ({ ...f, risk: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="Bajo">Bajo</SelectItem>
                    <SelectItem value="Medio">Medio</SelectItem>
                    <SelectItem value="Alto">Alto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">APY Mínimo: {filters.minApy[0]}%</label>
                <Slider
                  value={filters.minApy}
                  onValueChange={(v) => setFilters(f => ({ ...f, minApy: v }))}
                  max={20}
                  min={0}
                  step={0.1}
                />
              </div>
            </CardContent>
          </Card>

          {/* Tabla Principal */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>
                  {viewMode === 'comparison' && 'Comparativa Completa'}
                  {viewMode === 'traditional' && 'Fintech Tradicional'}
                  {viewMode === 'defi' && 'DeFi Protocols'}
                </span>
                <div className="text-sm text-muted-foreground">
                  {filteredOpportunities.length} oportunidades
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fuente</TableHead>
                      <TableHead>Plataforma</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>APY</TableHead>
                      <TableHead>Activo</TableHead>
                      <TableHead>Riesgo</TableHead>
                      <TableHead>TVL</TableHead>
                      <TableHead>Plazo</TableHead>
                      <TableHead>Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOpportunities.map((opportunity) => {
                      const RiskIcon = getRiskIcon(opportunity.risk);
                      const SourceIcon = getSourceIcon(opportunity.source);
                      
                      return (
                        <TableRow key={opportunity.id}>
                          <TableCell>
                            <Badge className={getSourceColor(opportunity.source)}>
                              <SourceIcon className="w-3 h-3 mr-1" />
                              {opportunity.source === 'fintech' ? 'Fintech' : 'DeFi'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                opportunity.source === 'fintech' 
                                  ? 'bg-blue-500 text-white' 
                                  : 'bg-purple-500 text-white'
                              }`}>
                                {opportunity.platform.slice(0, 2).toUpperCase()}
                              </div>
                              <span className="font-medium">{opportunity.platform}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{opportunity.name}</div>
                              <div className="text-xs text-muted-foreground">{opportunity.type}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-bold text-lg text-primary">
                              {opportunity.apy.toFixed(2)}%
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{opportunity.currency}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className={`flex items-center gap-1 ${getRiskColor(opportunity.risk)}`}>
                              <RiskIcon className="w-4 h-4" />
                              <span className="text-sm font-medium">{opportunity.risk}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{opportunity.tvl}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{opportunity.horizon}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setSelectedOpportunity(opportunity);
                                  setShowCalculator(true);
                                }}
                              >
                                <Calculator className="w-4 h-4" />
                              </Button>
                              {opportunity.url && (
                                <Button variant="outline" size="sm" asChild>
                                  <a href={opportunity.url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {filteredOpportunities.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No se encontraron oportunidades con los filtros actuales
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
};

export default InvestmentOpportunitiesPage;