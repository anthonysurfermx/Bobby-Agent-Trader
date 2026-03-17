import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Cloud, Trophy, Gift, Shield, X } from 'lucide-react';

type PromptReason = 'level_up' | 'xp_milestone' | 'leaderboard' | 'nft_claim';

interface LoginPromptModalProps {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
  reason: PromptReason;
}

const promptContent: Record<PromptReason, { title: string; description: string; icon: React.ReactNode; benefits: string[] }> = {
  level_up: {
    title: '¡Felicidades, subiste de nivel!',
    description: 'Inicia sesión para guardar tu progreso en la nube y no perder tus logros.',
    icon: <span className="text-5xl">🎉</span>,
    benefits: [
      'Guarda tu progreso automáticamente',
      'Accede desde cualquier dispositivo',
      'Compite en el leaderboard global',
    ],
  },
  xp_milestone: {
    title: '¡Wow, 500 XP alcanzados!',
    description: 'Has acumulado mucha experiencia. ¿Quieres guardar tu progreso?',
    icon: <span className="text-5xl">⭐</span>,
    benefits: [
      'No pierdas tu XP acumulado',
      'Desbloquea logros exclusivos',
      'Sincroniza entre dispositivos',
    ],
  },
  leaderboard: {
    title: '¿Quieres aparecer en el ranking?',
    description: 'Inicia sesión para competir con otros jugadores y mostrar tu puntuación.',
    icon: <Trophy className="w-12 h-12 text-yellow-500" />,
    benefits: [
      'Aparece en el Top 50 global',
      'Muestra tus logros a otros',
      'Compite por el primer lugar',
    ],
  },
  nft_claim: {
    title: '¡Has desbloqueado un NFT!',
    description: 'Inicia sesión para reclamar tu NFT exclusivo de Mercado LP.',
    icon: <Gift className="w-12 h-12 text-purple-500" />,
    benefits: [
      'Reclama tu NFT gratuito',
      'Coleccionable único en blockchain',
      'Prueba de tu maestría DeFi',
    ],
  },
};

export const LoginPromptModal = ({ open, onClose, onLogin, reason }: LoginPromptModalProps) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const content = promptContent[reason];

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem(`mercado_lp_hide_login_prompt_${reason}`, 'true');
    }
    onClose();
  };

  const handleLogin = () => {
    onLogin();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Cerrar</span>
        </button>

        <DialogHeader className="text-center pt-4">
          <div className="flex justify-center mb-4">
            {content.icon}
          </div>
          <DialogTitle className="text-xl">{content.title}</DialogTitle>
          <DialogDescription className="text-base">
            {content.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted rounded-lg p-4 space-y-3">
            {content.benefits.map((benefit, index) => (
              <div key={index} className="flex items-center gap-3 text-sm">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-xs text-primary">✓</span>
                </div>
                <span>{benefit}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <Button onClick={handleLogin} className="w-full gap-2">
              <Cloud className="w-4 h-4" />
              Iniciar sesión
            </Button>
            <Button variant="ghost" onClick={handleClose} className="w-full text-muted-foreground">
              Continuar sin cuenta
            </Button>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer justify-center">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded border-muted-foreground/50"
            />
            No mostrar de nuevo para este evento
          </label>
        </div>

        <div className="text-center text-xs text-muted-foreground border-t pt-4">
          <Shield className="w-3 h-3 inline mr-1" />
          Tu progreso local se mantendrá hasta que inicies sesión
        </div>
      </DialogContent>
    </Dialog>
  );
};
