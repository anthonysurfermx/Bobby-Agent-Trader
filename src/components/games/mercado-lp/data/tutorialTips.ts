import { TutorialTip } from '@/components/games/mercado-lp/types/game';

export const tutorialTips: TutorialTip[] = [
  {
    id: 'first_swap',
    trigger: 'first_swap_attempt',
    character: '🤠',
    message: '¡Órale! Mira cómo el precio cambia según cuánto lleves. Entre más compres, más caro sale cada fruta.',
    position: 'bottom',
    shown: false,
  },
  {
    id: 'high_slippage',
    trigger: 'first_high_slippage',
    character: '👵',
    message: '¡Aguas! Estás comprando tanto que el precio se va a las nubes. Mejor hazlo en partes.',
    position: 'bottom',
    shown: false,
  },
  {
    id: 'lp_attempt',
    trigger: 'first_lp_attempt',
    character: '👴',
    message: 'Para poner tu puesto necesitas traer las DOS frutas. Así funciona el mercado, compa.',
    position: 'top',
    shown: false,
  },
  {
    id: 'fees_earned',
    trigger: 'first_fees_earned',
    character: '💃',
    message: '¡Mira! Ya ganaste tus primeras propinas. Cada vez que alguien cambia frutas en tu puesto, tú ganas.',
    position: 'top',
    shown: false,
  },
  {
    id: 'il_warning',
    trigger: 'first_impermanent_loss',
    character: '🤠',
    message: 'Mientras no estabas, el precio se movió. Tu puesto ahora tiene diferente mezcla de frutas.',
    position: 'top',
    shown: false,
  },
  {
    id: 'token_creation',
    trigger: 'first_token_create',
    character: '💃',
    message: 'Crear tu fruta es fácil, pero necesitas un mercado. Sin liquidez, nadie puede comprar tu fruta.',
    position: 'top',
    shown: false,
  },
];
