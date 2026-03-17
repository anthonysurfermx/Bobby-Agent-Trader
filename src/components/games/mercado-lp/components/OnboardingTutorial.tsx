import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ChevronRight, ChevronLeft, X, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

interface TutorialStep {
  id: string;
  position: 'center' | 'top' | 'bottom' | 'left' | 'right';
}

const tutorialSteps: TutorialStep[] = [
  { id: 'welcome', position: 'center' },
  { id: 'inventory', position: 'right' },
  { id: 'pools', position: 'left' },
  { id: 'swap', position: 'top' },
  { id: 'fees', position: 'center' },
  { id: 'mission', position: 'center' },
];

interface OnboardingTutorialProps {
  onComplete: () => void;
  onSkip: () => void;
}

export const OnboardingTutorial = ({ onComplete, onSkip }: OnboardingTutorialProps) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const step = tutorialSteps[currentStep];
  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;

  useEffect(() => {
    // Animate in
    setTimeout(() => setIsVisible(true), 100);
  }, []);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  // Position styles: centrado en pantalla para todos los pasos
  const getPositionStyles = () => {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  };

  return (
    <div className={`fixed inset-0 z-[100] transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Tutorial Card */}
      <Card
        className={`absolute z-20 w-[400px] max-w-[90vw] pixel-card bg-card border-2 border-primary/50 shadow-2xl transition-all duration-300 ${
          isVisible ? 'scale-100' : 'scale-95'
        }`}
        style={getPositionStyles()}
      >
        {/* Header simple */}
        <div className="bg-gradient-to-r from-primary/20 to-secondary/20 p-4 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{t('mercadoLP.onboarding.header.title')}</p>
            <p className="font-bold">{t('mercadoLP.onboarding.header.subtitle')}</p>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSkip}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div>
            <h3 className="text-lg font-bold mb-2">
              {t(`mercadoLP.onboarding.steps.${step.id}.title`)}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(`mercadoLP.onboarding.steps.${step.id}.description`)}
            </p>
          </div>

          {/* Action callout */}
          {t(`mercadoLP.onboarding.steps.${step.id}.action`, { defaultValue: '' }) && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
              <p className="text-xs font-semibold text-primary">{t('mercadoLP.onboarding.mission')}</p>
              <p className="text-sm">
                {t(`mercadoLP.onboarding.steps.${step.id}.action`)}
              </p>
            </div>
          )}

          {/* Nota */}
          {t(`mercadoLP.onboarding.steps.${step.id}.tip`, { defaultValue: '' }) && (
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">{t('mercadoLP.onboarding.note')}</p>
              <p>{t(`mercadoLP.onboarding.steps.${step.id}.tip`)}</p>
            </div>
          )}

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('mercadoLP.onboarding.progress', { current: currentStep + 1, total: tutorialSteps.length })}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('mercadoLP.onboarding.buttons.previous')}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-muted-foreground"
            >
              {t('mercadoLP.onboarding.buttons.skip')}
            </Button>

            <Button
              size="sm"
              onClick={handleNext}
              className="gap-1 bg-primary hover:bg-primary/90"
            >
              {currentStep === tutorialSteps.length - 1 ? (
                <>
                  {t('mercadoLP.onboarding.buttons.start')}
                  <Sparkles className="h-4 w-4" />
                </>
              ) : (
                <>
                  {t('mercadoLP.onboarding.buttons.next')}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Step indicators */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
        {tutorialSteps.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentStep(index)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
              index === currentStep
                ? 'bg-primary w-6'
                : index < currentStep
                ? 'bg-primary/60'
                : 'bg-muted-foreground/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
