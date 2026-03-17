import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Shield, 
  DollarSign, 
  Clock, 
  Filter, 
  Eye,
  ChevronDown,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Activity
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

// Datos estáticos de GBM
const gbmFunds = [
  {
    id: 'gbmcash',
    name: 'GBMCASH - Liquidez en dólares',
    platform: 'GBM',
    apy: 4.70,
    currency: 'USD',
    risk: 'Alto',
    type: 'Renta Fija',
    horizon: 'Corto plazo',
    tvl: '150M',
    description: 'Fondo con liquidez diaria en dólares'
  },
  {
    id: 'gbmf2',
    name: 'GBMF2 - Fondo de liquidez',
    platform: 'GBM',
    apy: 3.5,
    currency: 'MXN',
    risk: 'Bajo',
    type: 'Liquidez',
    horizon: 'Corto plazo',
    tvl: '2.3B',
    description: 'Fondo de liquidez para el mercado mexicano'
  },
  {
    id: 'gbmdeuda',
    name: 'GBMDEUDA - Instrumentos de deuda',
    platform: 'GBM',
    apy: 5.2,
    currency: 'MXN',
    risk: 'Medio',
    type: 'Renta Fija',
    horizon: 'Mediano plazo',
    tvl: '890M',
    description: 'Inversión en instrumentos de deuda gubernamental y corporativa'
  },
  {
    id: 'gbmglobal',
    name: 'GBMGLOBAL - Mercados globales',
    platform: 'GBM',
    apy: 6.8,
    currency: 'USD',
    risk: 'Alto',
    type: 'Renta Variable',
    horizon: 'Largo plazo',
    tvl: '340M',
    description: 'Diversificación en mercados desarrollados y emergentes'
  }
];

// Datos mock de DeFi (normalmente vendría de Vaults.fyi API)
const defiVaults = [
  {
    id: 'aave-usdc',
    name: 'AAVE USDC Lending',
    platform: 'Aave',
    apy: 3.45,
    currency: 'USDC',
    risk: 'Bajo',
    type: 'Lending',
    horizon: 'Flexible',
    tvl: '1.2B',
    description: 'Préstamos descentralizados con USDC'
  },
  {
    id: 'morpho-weth',
    name: 'Morpho WETH Vault',
    platform: 'Morpho',
    apy: 4.2,
    currency: 'WETH',
    risk: 'Medio',
    type: 'Yield Farming',
    horizon: 'Flexible',
    tvl: '456M',
    description: 'Optimización automática de rendimientos'
  },
  {
    id: 'yearn-usdt',
    name: 'Yearn USDT Strategy',
    platform: 'Yearn',
    apy: 5.8,
    currency: 'USDT',
    risk: 'Medio',
    type: 'Strategy',
    horizon: 'Flexible',
    tvl: '89M',
    description: 'Estrategia automatizada multi-protocolo'
  },
  {
    id: 'compound-dai',
    name: 'Compound DAI Pool',
    platform: 'Compound',
    apy: 2.9,
    currency: 'DAI',
    risk: 'Bajo',
    type: 'Lending',
    horizon: 'Flexible',
    tvl: '234M',
    description: 'Pool de préstamos con DAI estable'
  }
];

const InvestmentOpportunitiesPage = () => {
  const [viewMode, setViewMode] = useState<'comparison' | 'traditional' | 'defi'>('comparison');
  const [filters, setFilters] = useState({
    currency: 'all',
    risk: 'all',
    platform: 'all',
    minApy: [0]
  });

  // Combinar datos para vista comparativa
  const allOpportunities = [...gbmFunds, ...defiVaults];

  // Filtrar oportunidades
  const filteredOpportunities = useMemo(() => {
    return allOpportunities.filter(item => {
      if (filters.currency !== 'all' && item.currency !== filters.currency) return false;
      if (filters.risk !== 'all' && item.risk !== filters.risk) return false;
      if (filters.platform !== 'all' && item.platform !== filters.platform) return false;
      if (item.apy < filters.minApy[0]) return false;
      return true;
    });
  }, [filters, allOpportunities]);

  // Estadísticas
  const stats = useMemo(() => {
    const bestFintech = Math.max(...gbmFunds.map(f => f.apy));
    const bestDefi = Math.max(...defiVaults.map(f => f.apy));
    const avgUsd = allOpportunities
      .filter(o => ['USD', 'USDC', 'USDT', 'DAI'].includes(o.currency))
      .reduce((acc, curr) => acc + curr.apy, 0) / 
      allOpportunities.filter(o => ['USD', 'USDC', 'USDT', 'DAI'].includes(o.currency)).length;
    
    return {
      bestFintech,
      bestDefi,
      avgUsd,
      totalOpportunities: allOpportunities.length
    };
  }, []);

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
        {/* Métricas Clave */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Mejor APY Fintech"
            value={`${stats.bestFintech.toFixed(2)}%`}
            description="GBM Global"
            icon={TrendingUp}
            trend={{ value: "2.3%", isPositive: true }}
          />
          <StatsCard
            title="Mejor APY DeFi"
            value={`${stats.bestDefi.toFixed(2)}%`}
            description="Yearn Strategy"
            icon={DollarSign}
            trend={{ value: "1.8%", isPositive: true }}
          />
          <StatsCard
            title="Promedio USD"
            value={`${stats.avgUsd.toFixed(2)}%`}
            description="Instrumentos en dólares"
            icon={Shield}
          />
          <StatsCard
            title="Total Oportunidades"
            value={stats.totalOpportunities.toString()}
            description="Opciones disponibles"
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
                    <SelectItem value="WETH">WETH</SelectItem>
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
                  max={10}
                  min={0}
                  step={0.1}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Plataforma</label>
                <Select value={filters.platform} onValueChange={(v) => setFilters(f => ({ ...f, platform: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="GBM">GBM</SelectItem>
                    <SelectItem value="Aave">Aave</SelectItem>
                    <SelectItem value="Morpho">Morpho</SelectItem>
                    <SelectItem value="Yearn">Yearn</SelectItem>
                    <SelectItem value="Compound">Compound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Tabla Principal */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>
                {viewMode === 'comparison' && 'Comparativa Completa'}
                {viewMode === 'traditional' && 'Fintech Tradicional'}
                {viewMode === 'defi' && 'DeFi Protocols'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                      return (
                        <TableRow key={opportunity.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                opportunity.platform === 'GBM' ? 'bg-blue-500 text-white' : 'bg-primary text-primary-foreground'
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
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4 mr-1" />
                              Detalles
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Disclaimer */}
        <Card className="mt-8 border-yellow-200 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="space-y-2">
                <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">
                  Aviso Importante
                </h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Esta información es solo para fines educativos. Los rendimientos pasados no garantizan rendimientos futuros. 
                  Siempre consulta con un asesor financiero antes de tomar decisiones de inversión. Para conectar con APIs en tiempo real 
                  y funcionalidad completa, necesitas activar la integración con Supabase.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InvestmentOpportunitiesPage;