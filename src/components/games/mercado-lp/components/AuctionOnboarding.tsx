import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  ChevronRight,
  ChevronLeft,
  X,
  Gavel,
  Users,
  TrendingDown,
  Gift,
  Lightbulb,
} from 'lucide-react';

interface AuctionOnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface TutorialStep {
  id: string;
  icon: React.ReactNode;
  emoji: string;
  titleEs: string;
  titleEn: string;
  descriptionEs: string;
  descriptionEn: string;
  analogyEs: string;
  analogyEn: string;
  highlightElement?: string;
}

const tutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    icon: <Gavel className="w-8 h-8" />,
    emoji: '🏪',
    titleEs: '¡Bienvenido a la Subasta del Mercado!',
    titleEn: 'Welcome to the Market Auction!',
    descriptionEs: 'Imagina que llegaste temprano al mercado y hay una caja de mangos frescos que todos quieren. En lugar de pelearse, el vendedor dice: "Vamos a hacer esto justo para todos".',
    descriptionEn: 'Imagine you arrived early at the market and there\'s a box of fresh mangoes everyone wants. Instead of fighting, the vendor says: "Let\'s make this fair for everyone".',
    analogyEs: '🥭 Como cuando llega fruta fresca al mercado y todos quieren comprar',
    analogyEn: '🥭 Like when fresh fruit arrives at the market and everyone wants to buy',
  },
  {
    id: 'rounds',
    icon: <Users className="w-8 h-8" />,
    emoji: '📦',
    titleEs: 'La Subasta por Rondas',
    titleEn: 'The Auction in Rounds',
    descriptionEs: 'El vendedor divide los mangos en 5 cajas iguales. Cada ronda vende una caja. Tú y otros compradores (NPCs) escriben en secreto cuánto pagarían máximo por mango.',
    descriptionEn: 'The vendor divides the mangoes into 5 equal boxes. Each round sells one box. You and other buyers (NPCs) secretly write down the maximum you\'d pay per mango.',
    analogyEs: '📝 Como una subasta silenciosa donde nadie sabe lo que ofrecen los demás',
    analogyEn: '📝 Like a silent auction where nobody knows what others are bidding',
    highlightElement: 'auction-timeline',
  },
  {
    id: 'bid',
    icon: <TrendingDown className="w-8 h-8" />,
    emoji: '💰',
    titleEs: 'Tu Oferta: Precio y Presupuesto',
    titleEn: 'Your Bid: Price and Budget',
    descriptionEs: 'Escribes dos cosas: (1) el MÁXIMO que pagarías por mango, y (2) cuánto dinero total quieres gastar. Si pones $10 máximo y $50 de gasto, podrías ganar hasta 5 mangos.',
    descriptionEn: 'You write two things: (1) the MAXIMUM you\'d pay per mango, and (2) how much total money you want to spend. If you put $10 max and $50 spend, you could win up to 5 mangoes.',
    analogyEs: '💡 Tip: No tienes que gastar todo tu presupuesto - ¡el sistema te regresa lo que sobre!',
    analogyEn: '💡 Tip: You don\'t have to spend your whole budget - the system returns what\'s left over!',
    highlightElement: 'bid-form',
  },
  {
    id: 'clearing',
    icon: <Gift className="w-8 h-8" />,
    emoji: '⚖️',
    titleEs: 'El Precio Justo para Todos',
    titleEn: 'The Fair Price for Everyone',
    descriptionEs: 'Aquí está la magia: cuando se cierra la ronda, se calcula UN precio para todos. Si tu oferta es mayor o igual, ¡ganas! Y pagas el precio calculado, no tu máximo.',
    descriptionEn: 'Here\'s the magic: when the round closes, ONE price is calculated for everyone. If your bid is greater or equal, you win! And you pay the calculated price, not your maximum.',
    analogyEs: '🎯 Si ofreciste $10 pero el precio final es $7, ¡pagas solo $7!',
    analogyEn: '🎯 If you bid $10 but the final price is $7, you only pay $7!',
  },
  {
    id: 'strategy',
    icon: <Lightbulb className="w-8 h-8" />,
    emoji: '🧠',
    titleEs: 'Estrategia del Mercado',
    titleEn: 'Market Strategy',
    descriptionEs: 'Las primeras rondas suelen tener precios más bajos porque hay menos competencia. Los compradores listos distribuyen su dinero en varias rondas para conseguir mejor precio promedio.',
    descriptionEn: 'Early rounds usually have lower prices because there\'s less competition. Smart buyers distribute their money across several rounds to get a better average price.',
    analogyEs: '🌅 Es como llegar temprano al mercado - ¡los mejores precios son para los madrugadores!',
    analogyEn: '🌅 It\'s like arriving early at the market - the best prices are for early birds!',
  },
];

export function AuctionOnboarding({ onComplete, onSkip }: AuctionOnboardingProps) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'es';
  const [currentStep, setCurrentStep] = useState(0);

  const step = tutorialSteps[currentStep];
  const isLastStep = currentStep === tutorialSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const title = language === 'en' ? step.titleEn : step.titleEs;
  const description = language === 'en' ? step.descriptionEn : step.descriptionEs;
  const analogy = language === 'en' ? step.analogyEn : step.analogyEs;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/70 z-50 animate-in fade-in duration-300" />

      {/* Tutorial Card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/90 dark:to-orange-950/90 border-2 border-amber-400/50 shadow-2xl animate-in zoom-in-95 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-amber-200/50 dark:border-amber-800/50">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{step.emoji}</span>
              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {language === 'en' ? 'Auction Tutorial' : 'Tutorial de Subasta'}
              </span>
            </div>
            <button
              onClick={onSkip}
              className="p-1.5 rounded-full hover:bg-amber-200/50 dark:hover:bg-amber-800/50 transition-colors"
            >
              <X className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </button>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 py-3 bg-amber-100/50 dark:bg-amber-900/30">
            {tutorialSteps.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={cn(
                  'w-2.5 h-2.5 rounded-full transition-all duration-300',
                  index === currentStep
                    ? 'bg-amber-500 w-6'
                    : index < currentStep
                    ? 'bg-amber-400'
                    : 'bg-amber-200 dark:bg-amber-700'
                )}
              />
            ))}
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Icon and Title */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg">
                {step.icon}
              </div>
              <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100">
                {title}
              </h2>
            </div>

            {/* Description */}
            <p className="text-center text-amber-800 dark:text-amber-200 leading-relaxed">
              {description}
            </p>

            {/* Analogy Box */}
            <div className="flex items-start gap-3 p-4 bg-white/60 dark:bg-black/20 rounded-xl border border-amber-200 dark:border-amber-800">
              <span className="text-xl shrink-0">💡</span>
              <p className="text-sm text-amber-700 dark:text-amber-300 italic">
                {analogy}
              </p>
            </div>

            {/* Visual representation based on step */}
            {step.id === 'rounds' && (
              <div className="flex justify-center gap-2 py-2">
                {[1, 2, 3, 4, 5].map((num) => (
                  <div
                    key={num}
                    className="flex flex-col items-center gap-1 p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg"
                  >
                    <span className="text-lg">📦</span>
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      R{num}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {step.id === 'bid' && (
              <div className="grid grid-cols-2 gap-3 py-2">
                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg text-center">
                  <span className="text-2xl">💵</span>
                  <p className="text-xs font-medium text-green-700 dark:text-green-300 mt-1">
                    {language === 'en' ? 'Max Price' : 'Precio Máx'}
                  </p>
                  <p className="text-lg font-bold text-green-600">$10</p>
                </div>
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-center">
                  <span className="text-2xl">🏦</span>
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mt-1">
                    {language === 'en' ? 'Total Budget' : 'Gasto Total'}
                  </p>
                  <p className="text-lg font-bold text-blue-600">$50</p>
                </div>
              </div>
            )}

            {step.id === 'clearing' && (
              <div className="flex items-center justify-center gap-4 py-2">
                <div className="text-center">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {language === 'en' ? 'Your bid' : 'Tu oferta'}
                  </p>
                  <p className="text-xl font-bold text-amber-700">$10</p>
                </div>
                <span className="text-2xl">→</span>
                <div className="text-center p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {language === 'en' ? 'You pay' : 'Pagas'}
                  </p>
                  <p className="text-xl font-bold text-green-600">$7</p>
                </div>
                <span className="text-2xl">🎉</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-amber-200/50 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/50">
            <Button
              variant="ghost"
              onClick={handlePrev}
              disabled={isFirstStep}
              className="text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/50"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {language === 'en' ? 'Back' : 'Atrás'}
            </Button>

            <span className="text-sm text-amber-500">
              {currentStep + 1} / {tutorialSteps.length}
            </span>

            <Button
              onClick={handleNext}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
            >
              {isLastStep
                ? (language === 'en' ? 'Start Auction!' : '¡Comenzar Subasta!')
                : (language === 'en' ? 'Next' : 'Siguiente')}
              {!isLastStep && <ChevronRight className="w-4 h-4 ml-1" />}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
