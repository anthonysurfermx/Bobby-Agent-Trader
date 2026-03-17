import { TutorialTip } from '@/components/games/mercado-lp/types/game';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ContextualTipProps {
  tip: TutorialTip;
  onDismiss: () => void;
}

export const ContextualTip = ({ tip, onDismiss }: ContextualTipProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
  }, []);

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 z-50 pixel-card bg-primary text-foreground/90 p-4 max-w-md shadow-2xl transition-all duration-300 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      } ${tip.position === 'top' ? 'top-24' : 'bottom-24'}`}
    >
      <button
        onClick={onDismiss}
        className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:scale-110 transition-transform"
      >
        <X className="w-4 h-4" />
      </button>
      
      <div className="flex items-start gap-3">
        <span className="text-3xl flex-shrink-0">{tip.character}</span>
        <div>
          <p className="text-xs leading-relaxed">{tip.message}</p>
        </div>
      </div>
    </div>
  );
};
