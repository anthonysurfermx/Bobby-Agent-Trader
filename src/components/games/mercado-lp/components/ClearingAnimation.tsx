import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  PixelSparkles,
  PixelArrowRight,
  PixelCheck,
  PixelX,
  PixelMoney,
  PixelScale,
  PixelCheckCircle,
  PixelXCircle,
  PixelPerson,
  PixelParty,
  LightbulbIcon,
  PixelClock,
} from './icons/GameIcons';

interface Bid {
  name: string;
  maxPrice: number;
  spend: number;
  isPlayer?: boolean;
}

interface ClearingAnimationProps {
  bids: Bid[];
  tokensAvailable: number;
  tokenEmoji: string;
  onComplete: () => void;
  clearingPrice: number;
}

export function ClearingAnimation({
  bids,
  tokensAvailable,
  tokenEmoji,
  onComplete,
  clearingPrice,
}: ClearingAnimationProps) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'es';

  const [step, setStep] = useState(0);
  const [sortedBids, setSortedBids] = useState<(Bid & { won: boolean; tokensWon: number; actualCost: number })[]>([]);

  // Sort bids by maxPrice descending and calculate winners
  useEffect(() => {
    const sorted = [...bids].sort((a, b) => b.maxPrice - a.maxPrice);
    let remaining = tokensAvailable;

    const withResults = sorted.map(bid => {
      const canWin = bid.maxPrice >= clearingPrice;
      const maxTokens = bid.spend / clearingPrice;
      const tokensWon = canWin ? Math.min(maxTokens, remaining) : 0;
      remaining -= tokensWon;

      return {
        ...bid,
        won: tokensWon > 0,
        tokensWon,
        actualCost: tokensWon * clearingPrice,
      };
    });

    setSortedBids(withResults);
  }, [bids, tokensAvailable, clearingPrice]);

  // Auto-advance steps
  useEffect(() => {
    if (step < 4) {
      const timer = setTimeout(() => setStep(s => s + 1), 1500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const stepMessages = {
    es: [
      '📋 Ordenando ofertas de mayor a menor precio...',
      '⚖️ Calculando el precio de equilibrio...',
      `💰 Precio justo: $${clearingPrice.toFixed(2)} para TODOS`,
      '🎯 Asignando frutas a los ganadores...',
      '✅ ¡Listo! Mira quién ganó y cuánto pagó',
    ],
    en: [
      '📋 Sorting bids from highest to lowest...',
      '⚖️ Calculating the clearing price...',
      `💰 Fair price: $${clearingPrice.toFixed(2)} for EVERYONE`,
      '🎯 Allocating fruits to winners...',
      '✅ Done! See who won and how much they paid',
    ],
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <Card className="w-full max-w-2xl bg-gradient-to-br from-violet-900/95 to-purple-900/95 border-2 border-violet-400/50 shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-violet-500/30 text-center">
          <h2 className="text-xl font-bold text-white flex items-center justify-center gap-2">
            <PixelSparkles size={20} className="text-amber-400" />
            {language === 'en' ? 'How Clearing Works' : 'Cómo funciona el Clearing'}
          </h2>
          <p className="text-violet-200 text-sm mt-1">
            {stepMessages[language][step]}
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-violet-900">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
            style={{ width: `${((step + 1) / 5) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Bids visualization */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-violet-300 px-2">
              <span>{language === 'en' ? 'Bidder' : 'Ofertante'}</span>
              <span>{language === 'en' ? 'Max Price' : 'Precio Máx'}</span>
              <span>{language === 'en' ? 'Spend' : 'Gasto'}</span>
              <span>{language === 'en' ? 'Result' : 'Resultado'}</span>
            </div>

            {sortedBids.map((bid, index) => {
              const showResult = step >= 3;
              const isWinner = showResult && bid.won;
              const isLoser = showResult && !bid.won;

              return (
                <div
                  key={index}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg transition-all duration-500',
                    step >= 1 && 'bg-violet-800/50',
                    isWinner && 'bg-green-900/50 border border-green-500/50',
                    isLoser && 'bg-red-900/30 border border-red-500/30 opacity-60',
                    bid.isPlayer && 'ring-2 ring-amber-400/50'
                  )}
                  style={{
                    animationDelay: `${index * 100}ms`,
                  }}
                >
                  <span className={cn(
                    'font-medium text-sm flex items-center gap-1',
                    bid.isPlayer ? 'text-amber-300' : 'text-violet-200'
                  )}>
                    {bid.isPlayer ? <PixelPerson size={14} className="text-amber-300" /> : <PixelPerson size={14} className="text-violet-300" />}
                    {bid.name}
                  </span>

                  <span className={cn(
                    'text-sm font-mono',
                    step >= 2 && bid.maxPrice >= clearingPrice ? 'text-green-400' : 'text-violet-300',
                    step >= 2 && bid.maxPrice < clearingPrice && 'text-red-400 line-through'
                  )}>
                    ${bid.maxPrice.toFixed(2)}
                  </span>

                  <span className="text-sm text-violet-300 font-mono">
                    ${bid.spend.toFixed(0)}
                  </span>

                  <div className="w-24 text-right">
                    {step < 3 ? (
                      <span className="text-violet-400 text-xs">...</span>
                    ) : isWinner ? (
                      <div className="flex items-center gap-1 text-green-400 text-xs">
                        <PixelCheck size={12} className="text-green-400" />
                        <span>{bid.tokensWon.toFixed(1)} {tokenEmoji}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-red-400 text-xs">
                        <PixelX size={12} className="text-red-400" />
                        <span>{language === 'en' ? 'Lost' : 'Perdió'}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Clearing price highlight */}
          {step >= 2 && (
            <div className="flex items-center justify-center gap-3 p-4 bg-amber-500/20 border border-amber-500/50 rounded-xl animate-in zoom-in">
              <div className="text-center">
                <p className="text-amber-200 text-xs">
                  {language === 'en' ? 'Everyone pays the same:' : 'Todos pagan lo mismo:'}
                </p>
                <p className="text-3xl font-bold text-amber-400">${clearingPrice.toFixed(2)}</p>
                <p className="text-amber-200/70 text-xs mt-1">
                  {language === 'en'
                    ? 'Even if you bid higher!'
                    : '¡Aunque hayas ofertado más!'}
                </p>
              </div>
            </div>
          )}

          {/* Key insight for player */}
          {step >= 4 && (
            <div className="p-4 bg-green-900/30 border border-green-500/30 rounded-xl animate-in slide-in-from-bottom">
              {sortedBids.find(b => b.isPlayer && b.won) ? (
                <div className="flex items-start gap-3">
                  <PixelParty size={28} />
                  <div>
                    <p className="font-bold text-green-300">
                      {language === 'en' ? 'You won!' : '¡Ganaste!'}
                    </p>
                    <p className="text-sm text-green-200/80">
                      {(() => {
                        const playerBid = sortedBids.find(b => b.isPlayer);
                        if (!playerBid) return '';
                        const saved = (playerBid.maxPrice - clearingPrice) * playerBid.tokensWon;
                        return language === 'en'
                          ? `You bid $${playerBid.maxPrice.toFixed(2)} but only paid $${clearingPrice.toFixed(2)}. You saved $${saved.toFixed(2)}!`
                          : `Ofertaste $${playerBid.maxPrice.toFixed(2)} pero solo pagaste $${clearingPrice.toFixed(2)}. ¡Ahorraste $${saved.toFixed(2)}!`;
                      })()}
                    </p>
                  </div>
                </div>
              ) : sortedBids.find(b => b.isPlayer && !b.won) ? (
                <div className="flex items-start gap-3">
                  <LightbulbIcon size={28} className="text-amber-400" />
                  <div>
                    <p className="font-bold text-amber-300">
                      {language === 'en' ? 'Next time...' : 'La próxima vez...'}
                    </p>
                    <p className="text-sm text-amber-200/80">
                      {language === 'en'
                        ? `The clearing price was $${clearingPrice.toFixed(2)}. Bid at least that to win!`
                        : `El precio de equilibrio fue $${clearingPrice.toFixed(2)}. ¡Oferta al menos eso para ganar!`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <PixelScale size={28} className="text-violet-400" />
                  <div>
                    <p className="font-bold text-violet-300">
                      {language === 'en' ? 'Round complete!' : '¡Ronda completa!'}
                    </p>
                    <p className="text-sm text-violet-200/80">
                      {language === 'en'
                        ? 'Place a bid in the next round to participate.'
                        : 'Coloca una oferta en la siguiente ronda para participar.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-violet-500/30 flex justify-end">
          <Button
            onClick={onComplete}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
            disabled={step < 4}
          >
            {step < 4 ? (
              <span className="flex items-center gap-2">
                <PixelClock size={16} className="animate-spin" />
                {language === 'en' ? 'Processing...' : 'Procesando...'}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                {language === 'en' ? 'Continue' : 'Continuar'}
                <PixelArrowRight size={16} />
              </span>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// Mini diagram component for the educational banner
export function ClearingDiagram() {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'es';

  return (
    <div className="flex items-center justify-center gap-2 p-3 bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-xl border border-violet-500/20">
      {/* Step 1: Bids */}
      <div className="text-center">
        <div className="flex gap-1 justify-center mb-1">
          <PixelMoney size={18} />
          <PixelMoney size={18} />
          <PixelMoney size={18} />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {language === 'en' ? 'Everyone bids' : 'Todos ofertan'}
        </p>
      </div>

      <PixelArrowRight size={16} className="text-muted-foreground" />

      {/* Step 2: Price calculation */}
      <div className="text-center">
        <div className="flex justify-center mb-1">
          <PixelScale size={18} className="text-violet-400" />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {language === 'en' ? 'One price' : 'Un precio'}
        </p>
      </div>

      <PixelArrowRight size={16} className="text-muted-foreground" />

      {/* Step 3: Winners */}
      <div className="text-center">
        <div className="flex gap-1 justify-center mb-1">
          <PixelCheckCircle size={18} />
          <PixelCheckCircle size={18} />
          <span className="opacity-40"><PixelXCircle size={18} /></span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {language === 'en' ? 'Winners pay same' : 'Ganadores pagan igual'}
        </p>
      </div>
    </div>
  );
}
