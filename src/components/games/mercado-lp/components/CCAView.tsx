import { useState, useEffect } from 'react';
import { useGame } from '@/components/games/mercado-lp/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ConfettiBurst } from './ConfettiBurst';
import { AuctionBlockTimeline } from './AuctionBlockTimeline';
import { AuctionOnboarding } from './AuctionOnboarding';
import { ClearingAnimation, ClearingDiagram } from './ClearingAnimation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AuctionBid } from '@/components/games/mercado-lp/types/game';
import { useMercadoSound } from '@/hooks/useMercadoSound';
import {
  GraduationCapIcon,
  LightbulbIcon,
  AuctioneerIcon,
  BoltIcon,
  BoxIcon,
  CoinsIcon,
  QuestionIcon,
  PixelHelpCircle,
  PixelBeaker,
  PixelTrendingUp,
  PixelAward,
  PixelMoney,
  PixelMoneyBag,
  TokenIcon,
} from './icons/GameIcons';
import { MissionsCard } from './MissionsCard';

const AUCTION_ONBOARDING_KEY = 'mercado_lp_auction_onboarding_complete';

export const CCAView = () => {
  const { t } = useTranslation();
  const { player, auction, placeBid, advanceAuctionBlock, startAuction, resetAuction } = useGame();
  const [selectedBlock, setSelectedBlock] = useState<number>(1);
  const [maxPrice, setMaxPrice] = useState('');
  const [totalSpend, setTotalSpend] = useState('');
  const [confettiKey, setConfettiKey] = useState(0);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [playerTotalWon, setPlayerTotalWon] = useState(0);
  const [playerAvgPrice, setPlayerAvgPrice] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pendingAuctionStart, setPendingAuctionStart] = useState(false);
  const [showClearingAnimation, setShowClearingAnimation] = useState(false);
  const [clearingAnimationData, setClearingAnimationData] = useState<{
    bids: { name: string; maxPrice: number; spend: number; isPlayer?: boolean }[];
    tokensAvailable: number;
    clearingPrice: number;
  } | null>(null);
  const [isPracticeMode, setIsPracticeMode] = useState(false);

  // Sound effects
  const { play: playBidSound } = useMercadoSound('bid');

  // Check if onboarding was completed
  const hasCompletedOnboarding = () => {
    return localStorage.getItem(AUCTION_ONBOARDING_KEY) === 'true';
  };

  // Handle onboarding completion
  const handleOnboardingComplete = () => {
    localStorage.setItem(AUCTION_ONBOARDING_KEY, 'true');
    setShowOnboarding(false);

    // If we were waiting to start an auction, start it now
    if (pendingAuctionStart) {
      startAuction();
      toast.success(t('mercadoLP.cca.toasts.started'));
      setConfettiKey(prev => prev + 1);
      setPendingAuctionStart(false);
    }
  };

  // Handle onboarding skip
  const handleOnboardingSkip = () => {
    localStorage.setItem(AUCTION_ONBOARDING_KEY, 'true');
    setShowOnboarding(false);

    // If we were waiting to start an auction, start it now
    if (pendingAuctionStart) {
      startAuction();
      toast.success(t('mercadoLP.cca.toasts.started'));
      setConfettiKey(prev => prev + 1);
      setPendingAuctionStart(false);
    }
  };

  // Verificar si la subasta terminó para mostrar resultados
  useEffect(() => {
    if (!auction) return;

    if (!auction.active && auction.currentBlock > auction.blocksCount) {
      calculateResults();
    }
  }, [auction?.active, auction?.currentBlock]);

  const calculateResults = () => {
    if (!auction) return;

    let totalTokens = 0;
    let totalCost = 0;

    auction.blocks.forEach(block => {
      const playerBid = block.bids.find(b => b.bidderId === 'player');
      if (playerBid?.tokensWon) {
        totalTokens += playerBid.tokensWon;
        totalCost += playerBid.tokensWon * (playerBid.averagePrice || 0);
      }
    });

    setPlayerTotalWon(totalTokens);
    setPlayerAvgPrice(totalTokens > 0 ? totalCost / totalTokens : 0);
    setShowResultsModal(true);
    setConfettiKey(prev => prev + 1);
  };

  const handlePlaceBid = () => {
    if (!auction || !maxPrice || !totalSpend) {
      toast.error(t('mercadoLP.cca.errors.missing'));
      return;
    }

    const max = parseFloat(maxPrice);
    const spend = parseFloat(totalSpend);

    if (isNaN(max) || isNaN(spend) || max <= 0 || spend <= 0) {
      toast.error(t('mercadoLP.cca.errors.amount'));
      return;
    }

    const pesoBalance = player.inventory['peso'] || 0;
    if (spend > pesoBalance) {
      toast.error(t('mercadoLP.cca.errors.balance'));
      return;
    }

    const currentBlock = auction.blocks.find(b => b.blockNumber === selectedBlock);
    if (!currentBlock) return;

    // Validar que el precio máximo sea razonable
    if (max < currentBlock.minPrice) {
      toast.error(t('mercadoLP.cca.errors.minPrice', { price: currentBlock.minPrice.toFixed(2) }));
      return;
    }

    const bid: AuctionBid = {
      id: `bid-${Date.now()}`,
      bidderId: 'player',
      bidderName: 'Tú',
      maxPrice: max,
      totalSpend: spend,
    };

    // Contar ofertas previas del jugador
    const playerPreviousBids = auction.blocks.reduce((count, block) => {
      return count + block.bids.filter(b => b.bidderId === 'player').length;
    }, 0);

    placeBid(selectedBlock, bid);

    // Play sound
    playBidSound();

    // Feedback educativo mejorado
    if (playerPreviousBids === 0) {
      toast.success(t('mercadoLP.cca.toasts.firstBid'), { duration: 4000 });
    } else {
      toast.success(t('mercadoLP.cca.toasts.bidPlaced', { block: selectedBlock }));
    }

    setConfettiKey(prev => prev + 1);

    // Reset form
    setMaxPrice('');
    setTotalSpend('');
  };

  const handleStartAuction = () => {
    // Show onboarding if user hasn't completed it yet
    if (!hasCompletedOnboarding()) {
      setPendingAuctionStart(true);
      setShowOnboarding(true);
      return;
    }

    startAuction();
    toast.success(t('mercadoLP.cca.toasts.started'));
    setConfettiKey(prev => prev + 1);
  };

  const handleAdvanceBlock = () => {
    if (!auction || !auction.active) return;

    if (auction.currentBlock >= auction.blocksCount) {
      toast.info(t('mercadoLP.cca.toasts.ended'));
      return;
    }

    // Get current block data before advancing
    const blockToExecute = auction.blocks.find(b => b.blockNumber === auction.currentBlock);

    if (blockToExecute && blockToExecute.bids.length > 0) {
      // Prepare data for clearing animation
      const animationBids = blockToExecute.bids.map(bid => ({
        name: bid.bidderName,
        maxPrice: bid.maxPrice,
        spend: bid.totalSpend,
        isPlayer: bid.bidderId === 'player',
      }));

      setClearingAnimationData({
        bids: animationBids,
        tokensAvailable: blockToExecute.tokensAvailable,
        clearingPrice: blockToExecute.currentPrice,
      });
      setShowClearingAnimation(true);
    } else {
      // No bids, just advance
      advanceAuctionBlock();
      toast.success(t('mercadoLP.cca.toasts.blockRun', { block: auction.currentBlock }));
    }
  };

  const handleClearingAnimationComplete = () => {
    setShowClearingAnimation(false);
    setClearingAnimationData(null);

    if (!auction) return;

    advanceAuctionBlock();
    toast.success(t('mercadoLP.cca.toasts.blockRun', { block: auction.currentBlock }));

    // Si era el último bloque, mostrar resultados
    if (auction.currentBlock >= auction.blocksCount) {
      setTimeout(() => calculateResults(), 500);
    }
  };

  const handleResetAuction = () => {
    resetAuction();
    setShowResultsModal(false);
    toast.success(t('mercadoLP.cca.toasts.reset'));
  };

  if (!auction) {
    return (
      <div className="space-y-4">
        {/* Banner educativo del nivel */}
        <Card className="pixel-card p-4 bg-gradient-to-r from-primary/10 to-emerald-500/5 border-primary/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <GraduationCapIcon size={24} className="text-primary" />
            </div>
            <div className="space-y-3 flex-1">
              <h3 className="font-bold text-base">{t('mercadoLP.cca.banner.title')}</h3>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {t('mercadoLP.cca.banner.body')}
              </p>

              {/* Visual diagram of how clearing works */}
              <ClearingDiagram />

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card/60 px-3 py-2 rounded">
                <LightbulbIcon size={14} className="text-amber-500 shrink-0" />
                <span>{t('mercadoLP.cca.banner.concept')}</span>
              </div>

              {/* Botón a la vida real */}
              <a
                href="https://cca.uniswap.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600 text-white text-sm font-medium rounded-lg transition-all hover:scale-105"
              >
                <PixelTrendingUp size={16} />
                {t('mercadoLP.cca.banner.realLife', { defaultValue: 'Ir a la vida real' })}
              </a>
            </div>
          </div>
        </Card>

        {/* Practice Mode Toggle */}
        <Card className="pixel-card p-2 sm:p-3 bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-violet-500/20">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <PixelBeaker size={18} className="text-violet-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium truncate">
                  {t('mercadoLP.cca.practiceMode.title', { defaultValue: 'Modo Práctica' })}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                  {t('mercadoLP.cca.practiceMode.description', { defaultValue: 'Experimenta sin gastar tus tokens reales' })}
                </p>
              </div>
            </div>
            <Button
              variant={isPracticeMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsPracticeMode(!isPracticeMode)}
              className={`shrink-0 text-xs sm:text-sm ${isPracticeMode ? 'bg-violet-500 hover:bg-violet-600' : ''}`}
            >
              {isPracticeMode
                ? t('mercadoLP.cca.practiceMode.active', { defaultValue: '✓ Activo' })
                : t('mercadoLP.cca.practiceMode.activate', { defaultValue: 'Activar' })}
            </Button>
          </div>
          {isPracticeMode && (
            <div className="mt-2 p-1.5 sm:p-2 bg-violet-500/10 rounded text-[10px] sm:text-xs text-violet-700 dark:text-violet-300">
              🧪 {t('mercadoLP.cca.practiceMode.hint', { defaultValue: 'Los resultados no afectarán tu inventario real. ¡Perfecto para aprender!' })}
            </div>
          )}
        </Card>

        <MissionsCard />

        <Card className="pixel-card p-4 sm:p-6 text-center space-y-3 sm:space-y-4">
          <div className="w-14 h-14 sm:w-20 sm:h-20 mx-auto rounded-xl sm:rounded-2xl bg-violet-100 flex items-center justify-center">
            <AuctioneerIcon size={32} className="text-violet-600 sm:hidden" />
            <AuctioneerIcon size={48} className="text-violet-600 hidden sm:block" />
          </div>
          <div>
            <h2 className="text-base sm:text-xl font-bold mb-1 sm:mb-2">{t('mercadoLP.cca.noAuction.title')}</h2>
            <p className="text-muted-foreground text-xs sm:text-sm mb-3 sm:mb-4 px-2">
              {t('mercadoLP.cca.noAuction.body')}
            </p>
          </div>
          <Button
            onClick={handleStartAuction}
            className="pixel-button text-sm sm:text-lg"
            size="lg"
          >
            <BoltIcon size={18} className="mr-1 sm:mr-2 shrink-0" />
            {t('mercadoLP.cca.noAuction.start')}
          </Button>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2 px-2">
            {t('mercadoLP.cca.noAuction.note')}
          </p>
        </Card>
      </div>
    );
  }

  const currentBlock = auction.blocks.find(b => b.blockNumber === selectedBlock);
  const playerBudget = player.inventory['peso'] || 0;
  const estimatedTokens = currentBlock && maxPrice && totalSpend
    ? Math.min(parseFloat(totalSpend) / parseFloat(maxPrice), currentBlock.tokensAvailable)
    : 0;

  return (
    <div className="space-y-4">
      <ConfettiBurst trigger={confettiKey} />

      <MissionsCard />

      <div className="pixel-card p-3 sm:p-4 md:p-6 bg-card border rounded-lg shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">{t('mercadoLP.cca.labels.title')}</p>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2 truncate">
              <AuctioneerIcon size={18} className="text-primary shrink-0" />
              <span className="truncate">{t('mercadoLP.cca.labels.subtitle')}</span>
            </h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
              {t('mercadoLP.cca.labels.token', { emoji: auction.tokenOffered.emoji, symbol: auction.tokenOffered.symbol })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="pixel-button h-8 w-8 shrink-0 hidden sm:inline-flex"
            title={t('mercadoLP.cca.labels.helpTitle')}
            onClick={() => setShowHelpModal(true)}
          >
            <PixelHelpCircle size={16} />
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Timeline de bloques */}
          <AuctionBlockTimeline
            blocks={auction.blocks}
            currentBlock={auction.currentBlock}
            tokenEmoji={auction.tokenOffered.emoji}
            onBlockClick={setSelectedBlock}
            selectedBlock={selectedBlock}
          />

          {/* Controles de subasta */}
          <Card className="pixel-card p-3 sm:p-4 bg-primary/10">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sm:justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <BoltIcon size={18} className="text-primary shrink-0 sm:hidden" />
                <BoltIcon size={24} className="text-primary shrink-0 hidden sm:block" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold truncate">
                    {auction.active
                      ? t('mercadoLP.cca.labels.progress', { defaultValue: 'Subasta en progreso' })
                      : t('mercadoLP.cca.labels.ended', { defaultValue: 'Subasta terminada' })}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    {t('mercadoLP.cca.labels.blockProgress', { current: auction.currentBlock, total: auction.blocksCount, defaultValue: `Bloque ${auction.currentBlock} de ${auction.blocksCount}` })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                {auction.active && auction.currentBlock <= auction.blocksCount && (
                  <Button
                    onClick={handleAdvanceBlock}
                    className="pixel-button text-xs sm:text-sm flex-1 sm:flex-none"
                    variant="default"
                  >
                    ▶️ {t('mercadoLP.cca.labels.ctaAdvance')}
                  </Button>
                )}
                <Button
                  onClick={handleResetAuction}
                  className="pixel-button text-xs sm:text-sm flex-1 sm:flex-none"
                  variant="secondary"
                >
                  🔄 <span className="hidden sm:inline">{t('mercadoLP.cca.labels.ctaReset')}</span><span className="sm:hidden">Reset</span>
                </Button>
              </div>
            </div>
          </Card>

          {/* Info del bloque seleccionado */}
          {currentBlock && (
            <Card className="pixel-card p-3 sm:p-4 bg-gradient-to-b from-primary/10 to-purple-500/5">
              <h3 className="font-bold text-xs sm:text-sm mb-2 sm:mb-3 flex items-center gap-2">
                <BoxIcon size={16} className="text-primary shrink-0" />
                <span className="truncate">{t('mercadoLP.cca.labels.blockDetails', { block: selectedBlock, defaultValue: `Bloque ${selectedBlock} - Detalles` })}</span>
              </h3>

              <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div className="pixel-card bg-card/80 p-2 sm:p-3 text-center">
                  <div className="text-[10px] sm:text-xs text-muted-foreground">{t('mercadoLP.cca.labels.tokensAvailable', { defaultValue: 'Tokens disponibles' })}</div>
                  <div className="flex justify-center my-1">
                    <TokenIcon tokenId={auction.tokenOffered.id} size={24} className="sm:hidden" />
                    <TokenIcon tokenId={auction.tokenOffered.id} size={32} className="hidden sm:block" />
                  </div>
                  <div className="text-sm sm:text-lg font-bold">{currentBlock.tokensAvailable}</div>
                </div>

                <div className="pixel-card bg-card/80 p-2 sm:p-3 text-center">
                  <div className="text-[10px] sm:text-xs text-muted-foreground">{t('mercadoLP.cca.labels.currentPrice', { defaultValue: 'Precio actual' })}</div>
                  <div className="flex justify-center my-1">
                    <PixelMoney size={24} className="sm:hidden" />
                    <PixelMoney size={32} className="hidden sm:block" />
                  </div>
                  <div className="text-sm sm:text-lg font-bold">${currentBlock.currentPrice.toFixed(2)}</div>
                </div>
              </div>

              {/* Ofertas existentes en este bloque */}
              {currentBlock.bids.length > 0 && (
                <div className="pixel-card bg-card/60 p-3 space-y-2">
                  <div className="text-xs font-semibold">{t('mercadoLP.cca.bidsInBlock.title', { defaultValue: 'Ofertas en este bloque:' })}</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {currentBlock.bids.map(bid => (
                      <div
                        key={bid.id}
                        className="flex justify-between text-xs pixel-card bg-muted/50 p-2"
                      >
                        <span className={bid.bidderId === 'player' ? 'font-bold text-primary' : ''}>
                          {bid.bidderName}
                        </span>
                        <span>
                          {t('mercadoLP.cca.bidsInBlock.max', { defaultValue: 'Max' })}: ${bid.maxPrice.toFixed(2)} | {t('mercadoLP.cca.bidsInBlock.spend', { defaultValue: 'Gasto' })}: ${bid.totalSpend.toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Formulario de oferta */}
          <TooltipProvider>
            <Card className="pixel-card p-3 sm:p-4 space-y-2 sm:space-y-3">
              <h3 className="font-bold text-xs sm:text-sm flex items-center gap-2 flex-wrap">
                <CoinsIcon size={16} className="text-amber-500 shrink-0" />
                <span>{t('mercadoLP.cca.bidForm.title', { defaultValue: 'Coloca tu oferta' })}</span>
                {isPracticeMode && (
                  <span className="text-[10px] sm:text-xs bg-violet-500/20 text-violet-600 px-1.5 sm:px-2 py-0.5 rounded">
                    🧪 {t('mercadoLP.cca.practiceMode.badge', { defaultValue: 'Práctica' })}
                  </span>
                )}
              </h3>

              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  {t('mercadoLP.cca.bidForm.maxPriceLabel', { defaultValue: 'Precio máximo por token ($/token)' })}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[250px] p-3">
                      <p className="font-semibold text-sm mb-1">
                        {t('mercadoLP.cca.tooltips.maxPrice.title', { defaultValue: '¿Qué es el precio máximo?' })}
                      </p>
                      <p className="text-xs">
                        {t('mercadoLP.cca.tooltips.maxPrice.body', { defaultValue: 'Es lo máximo que estás dispuesto a pagar. Si el precio de equilibrio es menor, ¡pagarás menos!' })}
                      </p>
                      <div className="mt-2 p-2 bg-green-500/10 rounded text-xs">
                        💡 {t('mercadoLP.cca.tooltips.maxPrice.tip', { defaultValue: 'Ejemplo: Si pones $10 pero el precio final es $7, solo pagas $7' })}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input
                  type="number"
                  placeholder={t('mercadoLP.cca.bidForm.maxPricePlaceholder', { defaultValue: 'Ej: 10' })}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="pixel-border"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('mercadoLP.cca.bidForm.maxPriceHint', { defaultValue: 'Solo pagarás el precio de equilibrio, no necesariamente tu máximo.' })}
                </p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  {t('mercadoLP.cca.bidForm.spendLabel', { defaultValue: 'Gasto total (PESO)' })}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[250px] p-3">
                      <p className="font-semibold text-sm mb-1">
                        {t('mercadoLP.cca.tooltips.spend.title', { defaultValue: '¿Cuánto gastar?' })}
                      </p>
                      <p className="text-xs">
                        {t('mercadoLP.cca.tooltips.spend.body', { defaultValue: 'Es tu presupuesto para esta ronda. Se usará para calcular cuántos tokens puedes ganar.' })}
                      </p>
                      <div className="mt-2 p-2 bg-blue-500/10 rounded text-xs flex items-center gap-1">
                        <PixelMoneyBag size={16} />
                        {t('mercadoLP.cca.tooltips.spend.tip', { defaultValue: 'Si gastas $50 y el precio es $5, ganarías 10 tokens' })}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input
                  type="number"
                  placeholder={t('mercadoLP.cca.bidForm.spendPlaceholder', { defaultValue: 'Ej: 100' })}
                  value={totalSpend}
                  onChange={(e) => setTotalSpend(e.target.value)}
                  className="pixel-border"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('mercadoLP.cca.bidForm.budgetHint', { defaultValue: 'Tu presupuesto:' })} {playerBudget.toFixed(2)} PESO
                </p>
              </div>

              {estimatedTokens > 0 && (
                <div className="pixel-card bg-muted p-2 text-xs">
                  <p className="font-semibold">{t('mercadoLP.cca.bidForm.estimate', { defaultValue: 'Estimación:' })}</p>
                  <p>{t('mercadoLP.cca.bidForm.couldWin', { defaultValue: 'Podrías ganar' })} ~{estimatedTokens.toFixed(1)} {auction.tokenOffered.symbol}</p>
                  <p className="text-muted-foreground mt-1">
                    {t('mercadoLP.cca.bidForm.dependsOn', { defaultValue: '(Depende del precio final de equilibrio)' })}
                  </p>
                </div>
              )}

              <Button
                onClick={handlePlaceBid}
                className="w-full pixel-button text-sm sm:text-base"
                disabled={!maxPrice || !totalSpend || selectedBlock < auction.currentBlock}
              >
                {selectedBlock < auction.currentBlock
                  ? t('mercadoLP.cca.bidForm.blockExecuted', { defaultValue: 'Bloque ya ejecutado' })
                  : t('mercadoLP.cca.bidForm.placeBid', { defaultValue: '¡Ofertar en este bloque! 🔨' })}
              </Button>
            </Card>
          </TooltipProvider>

          {/* Resumen de tus ofertas */}
          <Card className="pixel-card p-4 bg-card">
            <h3 className="font-bold mb-2 flex items-center gap-2">
              <span>📊</span> {t('mercadoLP.cca.yourBids.title', { defaultValue: 'Tus ofertas activas' })}
            </h3>
            <div className="space-y-2">
              {auction.blocks
                .filter(block => block.bids.some(b => b.bidderId === 'player'))
                .map(block => {
                  const playerBid = block.bids.find(b => b.bidderId === 'player');
                  return (
                    <div
                      key={block.id}
                      className="pixel-card bg-card p-2 flex justify-between items-center text-xs"
                    >
                      <div>
                        <span className="font-bold">{t('mercadoLP.cca.yourBids.block', { defaultValue: 'Bloque' })} {block.blockNumber}</span>
                        {block.executed && playerBid?.tokensWon && (
                          <span className="ml-2 text-green-600">
                            ✓ {t('mercadoLP.cca.yourBids.won', { amount: playerBid.tokensWon.toFixed(1), defaultValue: `Ganaste ${playerBid.tokensWon.toFixed(1)} tokens` })}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div>{t('mercadoLP.cca.bidsInBlock.max', { defaultValue: 'Max' })}: ${playerBid?.maxPrice.toFixed(2)}</div>
                        <div className="text-muted-foreground">
                          {t('mercadoLP.cca.bidsInBlock.spend', { defaultValue: 'Gasto' })}: ${playerBid?.totalSpend.toFixed(0)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              {auction.blocks.filter(b => b.bids.some(bid => bid.bidderId === 'player')).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {t('mercadoLP.cca.yourBids.empty', { defaultValue: 'No tienes ofertas aún. ¡Coloca tu primera oferta arriba!' })}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="pixel-card p-4 bg-card">
        <h3 className="font-bold mb-2 flex items-center gap-2">
          <LightbulbIcon size={18} className="text-amber-500" />
          {t('mercadoLP.cca.strategy.title', { defaultValue: 'Estrategia del Subastero' })}
        </h3>
        <p className="text-sm text-muted-foreground">
          <strong>{t('mercadoLP.cca.strategy.tipLabel', { defaultValue: 'Tip:' })}</strong> {t('mercadoLP.cca.strategy.tipBody', { defaultValue: 'Ofertar en bloques tempranos suele darte mejor precio promedio. Los bloques avanzados se vuelven más competidos y caros. Distribuye tu presupuesto inteligentemente entre varios bloques.' })}
        </p>
      </Card>

      {/* Modal de ayuda */}
      <Dialog open={showHelpModal} onOpenChange={setShowHelpModal}>
        <DialogContent className="pixel-card max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QuestionIcon size={20} className="text-blue-500" />
              {t('mercadoLP.cca.helpModal.title', { defaultValue: '¿Qué es una Subasta Continua (CCA)?' })}
            </DialogTitle>
            <DialogDescription className="text-sm space-y-2">
              <p>
                {t('mercadoLP.cca.helpModal.intro', { defaultValue: 'Las Continuous Clearing Auctions distribuyen tokens en bloques a lo largo del tiempo. Esto incentiva participación temprana y descubrimiento justo de precios.' })}
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>{t('mercadoLP.cca.helpModal.point1', { defaultValue: 'Cada bloque vende una porción de tokens' })}</li>
                <li>{t('mercadoLP.cca.helpModal.point2', { defaultValue: 'Pones precio máximo y gasto total' })}</li>
                <li>{t('mercadoLP.cca.helpModal.point3', { defaultValue: 'Al ejecutarse, pagas el precio de equilibrio (no tu máximo)' })}</li>
                <li>{t('mercadoLP.cca.helpModal.point4', { defaultValue: 'Bloques tempranos = precios más bajos' })}</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                {t('mercadoLP.cca.helpModal.footer', { defaultValue: 'Inspirado en Uniswap v4 CCA hooks para lanzamientos justos de tokens.' })}
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button className="pixel-button" onClick={() => setShowHelpModal(false)}>
              {t('mercadoLP.cca.helpModal.ok', { defaultValue: 'Entendido' })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de resultados */}
      <Dialog open={showResultsModal} onOpenChange={setShowResultsModal}>
        <DialogContent className="pixel-card max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PixelAward size={24} className="text-yellow-600" />
              <span>¡Subasta completada!</span>
            </DialogTitle>
            <DialogDescription className="text-sm space-y-3">
              <div className="pixel-card bg-gradient-to-b from-primary/10 to-purple-500/5 p-4 space-y-2">
                <div className="text-center">
                  <div className="text-4xl mb-2">{auction.tokenOffered.emoji}</div>
                  <p className="font-bold text-lg">Resultados finales</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center pixel-card bg-card/80 p-2">
                    <span className="text-muted-foreground">Tokens ganados:</span>
                    <span className="font-bold text-lg">
                      {playerTotalWon.toFixed(1)} {auction.tokenOffered.symbol}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pixel-card bg-card/80 p-2">
                    <span className="text-muted-foreground">Precio promedio:</span>
                    <span className="font-bold">${playerAvgPrice.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center gap-2 justify-center mt-3 p-2 bg-green-100 rounded">
                    <PixelTrendingUp size={16} className="text-green-600" />
                    <span className="text-sm text-green-700">
                      ¡Aprendiste sobre subastas continuas!
                    </span>
                  </div>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              className="pixel-button"
              variant="secondary"
              onClick={() => {
                setShowResultsModal(false);
                handleResetAuction();
              }}
            >
              🔄 Nueva Subasta
            </Button>
            <Button className="pixel-button" onClick={() => setShowResultsModal(false)}>
              ¡Genial!
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auction Onboarding Tutorial */}
      {showOnboarding && (
        <AuctionOnboarding
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}

      {/* Clearing Animation - shows how the clearing process works */}
      {showClearingAnimation && clearingAnimationData && auction && (
        <ClearingAnimation
          bids={clearingAnimationData.bids}
          tokensAvailable={clearingAnimationData.tokensAvailable}
          tokenEmoji={auction.tokenOffered.emoji}
          clearingPrice={clearingAnimationData.clearingPrice}
          onComplete={handleClearingAnimationComplete}
        />
      )}
    </div>
  );
};
