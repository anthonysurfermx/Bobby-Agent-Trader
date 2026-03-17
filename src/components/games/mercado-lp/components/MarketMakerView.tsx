import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Token, Pool, MarketMakerStats, AdvancedPoolHook } from '../types/game';
import {
  advancedHooks,
  getHookBenefits,
  calculateMarketMakerScore,
  getMarketMakerTitle,
} from '../data/marketMakerMode';
import {
  Crown,
  Zap,
  Shield,
  Target,
  TrendingUp,
  Settings,
  CheckCircle2,
  Lock,
  Sparkles,
  BarChart3,
  Droplets,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarketMakerViewProps {
  playerLevel: number;
  tokens: Token[];
  pools: Pool[];
  marketMakerStats: MarketMakerStats;
  onCreateAdvancedPool?: (tokenA: Token, tokenB: Token, hook: AdvancedPoolHook, amounts: [number, number]) => void;
}

const hookIcons: Record<string, React.ReactNode> = {
  'volatility-oracle': <BarChart3 className="w-5 h-5" />,
  'limit-order-hook': <Target className="w-5 h-5" />,
  'concentrated-lp': <Zap className="w-5 h-5" />,
  'auto-rebalance': <Settings className="w-5 h-5" />,
  'flash-loan-guard': <Shield className="w-5 h-5" />,
  'mev-share': <Sparkles className="w-5 h-5" />,
};

export function MarketMakerView({
  playerLevel,
  tokens,
  pools,
  marketMakerStats,
  onCreateAdvancedPool,
}: MarketMakerViewProps) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'es';

  const [selectedTokenA, setSelectedTokenA] = useState<string>('');
  const [selectedTokenB, setSelectedTokenB] = useState<string>('');
  const [selectedHook, setSelectedHook] = useState<string>('');
  const [amountA, setAmountA] = useState(100);
  const [amountB, setAmountB] = useState(100);

  const score = calculateMarketMakerScore(marketMakerStats);
  const title = getMarketMakerTitle(score);
  const isLevel6 = playerLevel >= 6;

  const availableHooks = advancedHooks.filter(h => playerLevel >= h.unlockLevel);
  const lockedHooks = advancedHooks.filter(h => playerLevel < h.unlockLevel);

  const handleCreatePool = () => {
    const tokenA = tokens.find(t => t.id === selectedTokenA);
    const tokenB = tokens.find(t => t.id === selectedTokenB);
    const hook = advancedHooks.find(h => h.id === selectedHook);

    if (tokenA && tokenB && hook && onCreateAdvancedPool) {
      onCreateAdvancedPool(tokenA, tokenB, hook, [amountA, amountB]);
    }
  };

  if (!isLevel6) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md text-center p-8">
          <Lock className="w-16 h-16 mx-auto text-slate-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">
            {language === 'en' ? 'Market Maker Mode Locked' : 'Modo Market Maker Bloqueado'}
          </h2>
          <p className="text-muted-foreground mb-4">
            {language === 'en'
              ? 'Reach Level 6 (4000 XP) to unlock advanced pool hooks and become a Market Maker.'
              : 'Alcanza el Nivel 6 (4000 XP) para desbloquear hooks avanzados y convertirte en Market Maker.'}
          </p>
          <Badge variant="outline" className="text-lg px-4 py-2">
            {language === 'en' ? 'Level' : 'Nivel'} {playerLevel} / 6
          </Badge>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-4">
      {/* Header */}
      <div className="text-center space-y-1 sm:space-y-2">
        <Badge variant="outline" className="mb-1 sm:mb-2 text-[10px] sm:text-xs bg-gradient-to-r from-violet-500/20 to-purple-500/20">
          {language === 'en' ? 'Level 6' : 'Nivel 6'}
        </Badge>
        <h1 className="text-xl sm:text-3xl font-bold flex items-center justify-center gap-2 sm:gap-3">
          <Crown className="w-5 h-5 sm:w-8 sm:h-8 text-purple-400 shrink-0" />
          <span className="truncate">{language === 'en' ? 'Market Maker Mode' : 'Modo Market Maker'}</span>
        </h1>
        <p className="text-xs sm:text-base text-muted-foreground max-w-md mx-auto px-2">
          {language === 'en'
            ? 'Create pools with advanced hooks. Customize your strategy and maximize returns.'
            : 'Crea pools con hooks avanzados. Personaliza tu estrategia y maximiza rendimientos.'}
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Stats overview */}
        <Card className="bg-gradient-to-br from-violet-900/40 to-purple-900/40 border-purple-500/30">
          <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm sm:text-lg truncate">
                {language === 'en' ? 'Your Stats' : 'Tus Estadísticas'}
              </CardTitle>
              <Badge className="bg-purple-500 text-[10px] sm:text-xs shrink-0">{title.icon} {score}</Badge>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              {language === 'en' ? title.titleEn : title.title}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:gap-3 p-3 sm:p-6 pt-0 sm:pt-0">
            <div className="p-2 sm:p-3 bg-black/20 rounded-lg text-center">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 text-blue-400" />
              <div className="font-bold text-sm sm:text-base">{Math.round(marketMakerStats.totalVolumeProvided)}</div>
              <div className="text-[9px] sm:text-[10px] text-muted-foreground">
                {language === 'en' ? 'Volume' : 'Volumen'}
              </div>
            </div>
            <div className="p-2 sm:p-3 bg-black/20 rounded-lg text-center">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 text-amber-400" />
              <div className="font-bold text-sm sm:text-base">{marketMakerStats.totalFeesEarned.toFixed(1)}</div>
              <div className="text-[9px] sm:text-[10px] text-muted-foreground">Fees</div>
            </div>
            <div className="p-2 sm:p-3 bg-black/20 rounded-lg text-center">
              <Droplets className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 text-cyan-400" />
              <div className="font-bold text-sm sm:text-base">{marketMakerStats.poolsCreated}</div>
              <div className="text-[9px] sm:text-[10px] text-muted-foreground">Pools</div>
            </div>
            <div className="p-2 sm:p-3 bg-black/20 rounded-lg text-center">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 text-green-400" />
              <div className="font-bold text-sm sm:text-base">{Math.round(marketMakerStats.averageUtilization * 100)}%</div>
              <div className="text-[9px] sm:text-[10px] text-muted-foreground">
                {language === 'en' ? 'Utilization' : 'Util.'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pool creation */}
        <Card className="lg:col-span-2">
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-sm sm:text-base">
              {language === 'en' ? 'Create Advanced Pool' : 'Crear Pool Avanzado'}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {language === 'en'
                ? 'Select tokens and an advanced hook for your pool'
                : 'Selecciona tokens y un hook avanzado para tu pool'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6 pt-0 sm:pt-0">
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <div className="space-y-1 sm:space-y-2">
                <label className="text-xs sm:text-sm font-medium">Token A</label>
                <Select value={selectedTokenA} onValueChange={setSelectedTokenA}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'Select token' : 'Seleccionar token'} />
                  </SelectTrigger>
                  <SelectContent>
                    {tokens.map(token => (
                      <SelectItem key={token.id} value={token.id} disabled={token.id === selectedTokenB}>
                        <span className="flex items-center gap-2">
                          <span>{token.emoji}</span>
                          <span>{token.symbol}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{language === 'en' ? 'Amount' : 'Cantidad'}</span>
                    <span>{amountA}</span>
                  </div>
                  <Slider
                    value={[amountA]}
                    onValueChange={([v]) => setAmountA(v)}
                    min={10}
                    max={500}
                    step={10}
                  />
                </div>
              </div>

              <div className="space-y-1 sm:space-y-2">
                <label className="text-xs sm:text-sm font-medium">Token B</label>
                <Select value={selectedTokenB} onValueChange={setSelectedTokenB}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'Select token' : 'Seleccionar token'} />
                  </SelectTrigger>
                  <SelectContent>
                    {tokens.map(token => (
                      <SelectItem key={token.id} value={token.id} disabled={token.id === selectedTokenA}>
                        <span className="flex items-center gap-2">
                          <span>{token.emoji}</span>
                          <span>{token.symbol}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{language === 'en' ? 'Amount' : 'Cantidad'}</span>
                    <span>{amountB}</span>
                  </div>
                  <Slider
                    value={[amountB]}
                    onValueChange={([v]) => setAmountB(v)}
                    min={10}
                    max={500}
                    step={10}
                  />
                </div>
              </div>
            </div>

            <Button
              className="w-full text-xs sm:text-sm"
              disabled={!selectedTokenA || !selectedTokenB || !selectedHook}
              onClick={handleCreatePool}
            >
              <Zap className="w-4 h-4 mr-1 sm:mr-2" />
              {language === 'en' ? 'Create Pool' : 'Crear Pool'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Hooks selection */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">
          {language === 'en' ? 'Advanced Hooks' : 'Hooks Avanzados'}
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {advancedHooks.map(hook => {
            const isAvailable = playerLevel >= hook.unlockLevel;
            const isSelected = selectedHook === hook.id;
            const benefits = getHookBenefits(hook.id, language);

            return (
              <Card
                key={hook.id}
                className={cn(
                  'cursor-pointer transition-all',
                  isSelected && 'ring-2 ring-purple-500',
                  !isAvailable && 'opacity-50 cursor-not-allowed'
                )}
                onClick={() => isAvailable && setSelectedHook(hook.id)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'p-2 rounded-lg',
                        isAvailable ? 'bg-purple-500/20' : 'bg-slate-700'
                      )}>
                        {hookIcons[hook.id] || <Zap className="w-5 h-5" />}
                      </div>
                      <div>
                        <h3 className="font-medium">{hook.name}</h3>
                        <span className="text-lg">{hook.icon}</span>
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-purple-400" />}
                    {!isAvailable && <Lock className="w-5 h-5 text-slate-500" />}
                  </div>

                  <p className="text-sm text-muted-foreground">{hook.description}</p>

                  {benefits.length > 0 && (
                    <ul className="space-y-1">
                      {benefits.map((benefit, i) => (
                        <li key={i} className="text-xs flex items-center gap-2 text-green-400">
                          <CheckCircle2 className="w-3 h-3" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  )}

                  {hook.feeRangeBps && (
                    <div className="text-xs text-muted-foreground">
                      Fee range: {hook.feeRangeBps[0] / 100}% - {hook.feeRangeBps[1] / 100}%
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
