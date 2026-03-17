import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuctionTutorialState, AuctionTutorialStep } from '../types/game';
import {
  getCurrentStep,
  getTranslatedStep,
  getTutorialProgress,
  advanceTutorialStep,
} from '../data/auctionTutorial';
import { ChevronRight, BookOpen, Lightbulb, X, Gavel, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuctionTutorialProps {
  tutorialState: AuctionTutorialState;
  onUpdateState: (state: AuctionTutorialState) => void;
  onPlaceBid?: (maxPrice: number, totalSpend: number) => void;
  onAdvanceBlock?: () => void;
  onComplete?: () => void;
  onDismiss?: () => void;
}

export function AuctionTutorial({
  tutorialState,
  onUpdateState,
  onPlaceBid,
  onAdvanceBlock,
  onComplete,
  onDismiss,
}: AuctionTutorialProps) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'es';

  const [bidMaxPrice, setBidMaxPrice] = useState(8);
  const [bidTotalSpend, setBidTotalSpend] = useState(40);
  const [showHighlight, setShowHighlight] = useState(false);

  const currentStep = getCurrentStep(tutorialState);
  const progress = getTutorialProgress(tutorialState);

  useEffect(() => {
    // Animate highlight effect
    if (currentStep?.highlightElement) {
      setShowHighlight(true);
      const timer = setTimeout(() => setShowHighlight(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [currentStep?.highlightElement]);

  if (!tutorialState.isActive || tutorialState.completed || !currentStep) {
    return null;
  }

  const { title, description } = getTranslatedStep(currentStep, language);

  const handleNext = () => {
    const newState = advanceTutorialStep(tutorialState);
    onUpdateState(newState);

    if (newState.completed && onComplete) {
      onComplete();
    }
  };

  const handleBid = () => {
    if (onPlaceBid) {
      onPlaceBid(bidMaxPrice, bidTotalSpend);
    }
    handleNext();
  };

  const handleAdvance = () => {
    if (onAdvanceBlock) {
      onAdvanceBlock();
    }
    handleNext();
  };

  const getPositionClasses = (position: AuctionTutorialStep['position']) => {
    switch (position) {
      case 'top':
        return 'bottom-full mb-4';
      case 'bottom':
        return 'top-full mt-4';
      case 'left':
        return 'right-full mr-4';
      case 'right':
        return 'left-full ml-4';
      case 'center':
      default:
        return 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
    }
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 z-40 animate-in fade-in" />

      {/* Tutorial card */}
      <div
        className={cn(
          'z-50 w-full max-w-md animate-in zoom-in-95',
          currentStep.position === 'center'
            ? 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4'
            : 'absolute',
          getPositionClasses(currentStep.position)
        )}
      >
        <Card className="bg-gradient-to-br from-indigo-900 to-purple-900 border-2 border-indigo-400/50 shadow-2xl shadow-indigo-500/20">
          <CardContent className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-500/30 rounded-lg">
                  <BookOpen className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                  <span className="text-xs text-indigo-300">
                    {language === 'en' ? 'Auction Tutorial' : 'Tutorial de Subastas'}
                  </span>
                  <h3 className="font-bold text-lg">{title}</h3>
                </div>
              </div>
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Progress */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {language === 'en' ? 'Step' : 'Paso'} {tutorialState.currentStep + 1}/{tutorialState.steps.length}
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5 bg-indigo-900" />
            </div>

            {/* Description */}
            <div className="p-3 bg-black/20 rounded-lg">
              <p className="text-sm whitespace-pre-line leading-relaxed">{description}</p>
            </div>

            {/* Bid form for practice step */}
            {currentStep.showBidForm && (
              <div className="p-3 bg-indigo-800/30 rounded-lg space-y-3 border border-indigo-500/30">
                <div className="flex items-center gap-2 text-sm text-indigo-300">
                  <Lightbulb className="w-4 h-4" />
                  {language === 'en' ? 'Try this bid:' : 'Prueba esta puja:'}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {language === 'en' ? 'Max Price' : 'Precio Máx.'}
                    </Label>
                    <Input
                      type="number"
                      value={bidMaxPrice}
                      onChange={(e) => setBidMaxPrice(Number(e.target.value))}
                      className="h-9 bg-black/30 border-indigo-500/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {language === 'en' ? 'Total Spend' : 'Gasto Total'}
                    </Label>
                    <Input
                      type="number"
                      value={bidTotalSpend}
                      onChange={(e) => setBidTotalSpend(Number(e.target.value))}
                      className="h-9 bg-black/30 border-indigo-500/30"
                    />
                  </div>
                </div>
                {currentStep.suggestedBid && (
                  <div className="text-xs text-muted-foreground">
                    {language === 'en' ? 'Suggested:' : 'Sugerido:'} {currentStep.suggestedBid.maxPrice} / {currentStep.suggestedBid.totalSpend}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-2">
              {currentStep.action === 'next' && (
                <Button onClick={handleNext} className="bg-indigo-500 hover:bg-indigo-600">
                  {tutorialState.currentStep === tutorialState.steps.length - 2
                    ? (language === 'en' ? 'Finish' : 'Terminar')
                    : (language === 'en' ? 'Continue' : 'Continuar')}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}

              {currentStep.action === 'bid' && (
                <Button onClick={handleBid} className="bg-green-500 hover:bg-green-600">
                  <Gavel className="w-4 h-4 mr-2" />
                  {language === 'en' ? 'Place Bid' : 'Colocar Puja'}
                </Button>
              )}

              {currentStep.action === 'advance' && (
                <Button onClick={handleAdvance} className="bg-amber-500 hover:bg-amber-600 text-black">
                  <Play className="w-4 h-4 mr-2" />
                  {language === 'en' ? 'Execute Block' : 'Ejecutar Bloque'}
                </Button>
              )}

              {currentStep.action === 'complete' && (
                <Button onClick={handleNext} className="bg-green-500 hover:bg-green-600">
                  {language === 'en' ? 'Start Trading!' : '¡Empezar a Tradear!'}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Element highlight effect */}
      {currentStep.highlightElement && showHighlight && (
        <style>{`
          [data-tutorial="${currentStep.highlightElement}"] {
            position: relative;
            z-index: 45;
            animation: tutorialPulse 2s ease-in-out infinite;
          }
          @keyframes tutorialPulse {
            0%, 100% { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.5); }
            50% { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0.3); }
          }
        `}</style>
      )}
    </>
  );
}

// Button to start tutorial
export function StartAuctionTutorialButton({
  onStart,
  hasCompleted,
}: {
  onStart: () => void;
  hasCompleted: boolean;
}) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'es';

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onStart}
      className="border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10"
    >
      <BookOpen className="w-4 h-4 mr-2" />
      {hasCompleted
        ? (language === 'en' ? 'Review Tutorial' : 'Revisar Tutorial')
        : (language === 'en' ? 'Learn Auctions' : 'Aprender Subastas')}
    </Button>
  );
}
