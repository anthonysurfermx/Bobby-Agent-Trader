import { useState } from 'react';
import { useGame } from '@/components/games/mercado-lp/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ConfettiBurst } from './ConfettiBurst';
import { LiquidityBasket } from './LiquidityBasket';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMercadoSound } from '@/hooks/useMercadoSound';
import {
  GraduationCapIcon,
  LightbulbIcon,
  ProviderIcon,
  ChartIcon,
  QuestionIcon,
  TokenIcon,
} from './icons/GameIcons';
import { MissionsCard } from './MissionsCard';
import { useTranslation } from 'react-i18next';

export const LiquidityView = () => {
  const { pools, player, addLiquidity, removeLiquidity } = useGame();
  const [selectedPool, setSelectedPool] = useState(pools[0]?.id || '');
  const [amountA, setAmountA] = useState('');
  const [confettiKey, setConfettiKey] = useState(0);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [lpSuccess, setLpSuccess] = useState(false);
  const { t } = useTranslation();

  // Sound effects
  const { play: playAddLiquiditySound } = useMercadoSound('add-liquidity');
  const { play: playRemoveLiquiditySound } = useMercadoSound('remove-liquidity');

  const currentPool = pools.find(p => p.id === selectedPool);
  const currentPosition = player.lpPositions.find(p => p.poolId === selectedPool);

  const calculateRequiredB = (inputA: string) => {
    if (!currentPool || !inputA) return '';
    const ratio = currentPool.reserveB / currentPool.reserveA;
    return (parseFloat(inputA) * ratio).toFixed(2);
  };

  const calculatedAmountB = calculateRequiredB(amountA);

  const handleAddLiquidity = () => {
    if (!currentPool || !amountA) {
      toast.error(t('mercadoLP.liquidity.errors.missing'));
      return;
    }

    const a = parseFloat(amountA);
    const b = parseFloat(calculatedAmountB);

    if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0) {
      toast.error(t('mercadoLP.liquidity.errors.amount'));
      return;
    }

    if ((player.inventory[currentPool.tokenA.id] || 0) < a) {
      toast.error(t('mercadoLP.liquidity.errors.balanceA', { symbol: currentPool.tokenA.symbol }));
      return;
    }

    if ((player.inventory[currentPool.tokenB.id] || 0) < b) {
      toast.error(t('mercadoLP.liquidity.errors.balanceB', { symbol: currentPool.tokenB.symbol }));
      return;
    }

    const isFirstLP = player.lpPositions.length === 0;
    addLiquidity(selectedPool, a, b);

    // Play sound
    playAddLiquiditySound();

    // Feedback educativo mejorado
    if (isFirstLP) {
      toast.success(t('mercadoLP.liquidity.toasts.first'), { duration: 4000 });
    } else {
      toast.success(t('mercadoLP.liquidity.toasts.opened'));
    }

    setConfettiKey(prev => prev + 1);
    setLpSuccess(true);
    setTimeout(() => setLpSuccess(false), 600);
    setAmountA('');
  };

  const handleRemoveLiquidity = () => {
    if (!currentPosition) {
      toast.error(t('mercadoLP.liquidity.errors.noPosition'));
      return;
    }

    const feesEarned = currentPosition.feesEarned.tokenA + currentPosition.feesEarned.tokenB;
    removeLiquidity(selectedPool, currentPosition.sharePercent);

    // Play sound
    playRemoveLiquiditySound();

    if (feesEarned > 0) {
      toast.success(t('mercadoLP.liquidity.toasts.closedFees', { fees: feesEarned.toFixed(2) }));
    } else {
      toast.success(t('mercadoLP.liquidity.toasts.closed'));
    }
    setConfettiKey(prev => prev + 1);
  };

  const canAddLiquidity = currentPool && amountA && parseFloat(amountA) > 0 &&
    (player.inventory[currentPool.tokenA.id] || 0) >= parseFloat(amountA) &&
    (player.inventory[currentPool.tokenB.id] || 0) >= parseFloat(calculatedAmountB);

  return (
    <div className="space-y-4">
      <ConfettiBurst trigger={confettiKey} />

      {/* Banner educativo del nivel */}
      {player.lpPositions.length === 0 && (
        <Card className="pixel-card p-4 bg-gradient-to-r from-primary/10 to-emerald-500/5 border-primary/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <GraduationCapIcon size={24} className="text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-base">{t('mercadoLP.liquidity.banner.title')}</h3>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {t('mercadoLP.liquidity.banner.body')}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card/60 px-3 py-2 rounded">
                <LightbulbIcon size={14} className="text-amber-500 shrink-0" />
                <span>{t('mercadoLP.liquidity.banner.concept')}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      <MissionsCard />

      <div className="pixel-card p-3 sm:p-4 md:p-5 bg-card border rounded-lg shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">
              {t('mercadoLP.liquidity.labels.title')}
            </p>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2 truncate">
              <ProviderIcon size={18} className="text-primary shrink-0" />
              <span className="truncate">{t('mercadoLP.liquidity.labels.subtitle')}</span>
            </h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="pixel-button h-8 w-8 shrink-0 hidden sm:inline-flex"
            title={t('mercadoLP.liquidity.labels.how')}
            onClick={() => setShowHelpModal(true)}
          >
            <HelpCircle className="w-4 h-4" />
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Visual del puesto */}
          {currentPool && (
            <LiquidityBasket
              tokenA={currentPool.tokenA}
              tokenB={currentPool.tokenB}
              amountA={currentPool.reserveA}
              amountB={currentPool.reserveB}
              previewAmountA={amountA ? currentPool.reserveA + parseFloat(amountA) : undefined}
              previewAmountB={calculatedAmountB ? currentPool.reserveB + parseFloat(calculatedAmountB) : undefined}
            />
          )}
          <div>
            <Label className="text-xs text-muted-foreground">{t('mercadoLP.liquidity.labels.selectPool')}</Label>
            <Select value={selectedPool} onValueChange={(val) => { setSelectedPool(val); setAmountA(''); }}>
              <SelectTrigger className="pixel-border">
                <SelectValue placeholder={t('mercadoLP.liquidity.labels.selectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {pools.map(pool => (
                  <SelectItem key={pool.id} value={pool.id}>
                    <span className="flex items-center gap-1">
                      <TokenIcon tokenId={pool.tokenA.id} size={16} /> {pool.tokenA.symbol} / <TokenIcon tokenId={pool.tokenB.id} size={16} /> {pool.tokenB.symbol}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {currentPool && (
            <>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('mercadoLP.liquidity.labels.inputA', {
                      emoji: currentPool.tokenA.emoji,
                      symbol: currentPool.tokenA.symbol,
                    })}
                  </Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={amountA}
                    onChange={(e) => setAmountA(e.target.value)}
                    className="pixel-border"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('mercadoLP.liquidity.labels.have', {
                      amount: (player.inventory[currentPool.tokenA.id] || 0).toFixed(2),
                    })}
                  </p>
                </div>

                <div className="flex justify-center">
                  <div className="text-2xl">+</div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('mercadoLP.liquidity.labels.needB', {
                      emoji: currentPool.tokenB.emoji,
                      symbol: currentPool.tokenB.symbol,
                    })}
                  </Label>
                  <div className={`pixel-card bg-muted p-3 flex items-center justify-between ${lpSuccess ? 'animate-success' : ''}`}>
                    <TokenIcon tokenId={currentPool.tokenB.id} size={32} />
                    <span className="text-xl font-bold">{calculatedAmountB || '0.00'}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('mercadoLP.liquidity.labels.have', {
                      amount: (player.inventory[currentPool.tokenB.id] || 0).toFixed(2),
                    })}
                  </p>
                  {!amountA && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      {t('mercadoLP.liquidity.labels.needHint')}
                    </p>
                  )}
                </div>
              </div>

              <div className="pixel-card bg-muted p-3 text-xs space-y-2">
                <p className="font-semibold">{t('mercadoLP.liquidity.labels.how')}</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  {(t('mercadoLP.liquidity.labels.howList', { returnObjects: true }) as string[]).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              <Button
                onClick={handleAddLiquidity}
                className="w-full pixel-button text-sm sm:text-lg"
                size="lg"
                disabled={!canAddLiquidity}
              >
                {canAddLiquidity ? t('mercadoLP.liquidity.labels.open') : t('mercadoLP.liquidity.labels.fillAmounts')}
              </Button>

              {currentPosition && (
                <>
                  <div className="border-t border-border pt-4 mt-4">
                    <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                      <ChartIcon size={18} className="text-primary" />
                      {t('mercadoLP.liquidity.labels.positionTitle')}
                    </h3>
                    <div className="pixel-card bg-muted/50 p-3 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span>{t('mercadoLP.liquidity.labels.share')}</span>
                        <span className="font-bold">{currentPosition.sharePercent.toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t('mercadoLP.liquidity.labels.feesA', { emoji: currentPool.tokenA.emoji })}</span>
                        <span className="font-bold">{currentPosition.feesEarned.tokenA.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t('mercadoLP.liquidity.labels.feesB', { emoji: currentPool.tokenB.emoji })}</span>
                        <span className="font-bold">{currentPosition.feesEarned.tokenB.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-border">
                        <span>{t('mercadoLP.liquidity.labels.feesTotal')}</span>
                        <span className="font-bold text-primary">
                          {(currentPosition.feesEarned.tokenA + currentPosition.feesEarned.tokenB).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={handleRemoveLiquidity}
                      className="w-full pixel-button mt-3"
                      variant="secondary"
                    >
                      {t('mercadoLP.liquidity.labels.close')}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <Card className="pixel-card p-4 bg-card">
        <h3 className="font-bold mb-2 flex items-center gap-2">
          <LightbulbIcon size={18} className="text-amber-500" />
          {t('mercadoLP.liquidity.labels.tipTitle')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('mercadoLP.liquidity.labels.tipBody')}
        </p>
      </Card>

      <Dialog open={showHelpModal} onOpenChange={setShowHelpModal}>
        <DialogContent className="pixel-card max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QuestionIcon size={20} className="text-blue-500" />
              {t('mercadoLP.liquidity.labels.modal.title')}
            </DialogTitle>
            <DialogDescription className="text-sm space-y-2">
              <p>{t('mercadoLP.liquidity.labels.modal.body1')}</p>
              <ul className="list-disc list-inside space-y-1">
                {(t('mercadoLP.liquidity.labels.modal.list', { returnObjects: true }) as string[]).map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                {t('mercadoLP.liquidity.labels.modal.note')}
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button className="pixel-button" onClick={() => setShowHelpModal(false)}>
              {t('mercadoLP.liquidity.labels.modal.ok')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
