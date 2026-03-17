import { NPCTrader } from '@/components/games/mercado-lp/types/game';

export const initialNPCs: NPCTrader[] = [
  {
    id: 'maria',
    name: 'Doña María',
    avatar: '👵',
    personality: 'comprador',
    preferredTokens: ['mango'],
    catchphrase: '¡Mis nietos aman el mango!',
    lastTradeTime: 0,
  },
  {
    id: 'guero',
    name: 'El Güero',
    avatar: '🤠',
    personality: 'especulador',
    preferredTokens: ['*'],
    catchphrase: 'Aquí el negocio está en saber cuándo...',
    lastTradeTime: 0,
  },
  {
    id: 'pepe',
    name: 'Don Pepe',
    avatar: '👴',
    personality: 'casual',
    preferredTokens: ['*'],
    catchphrase: 'Nomás pasaba por aquí...',
    lastTradeTime: 0,
  },
  {
    id: 'chikis',
    name: 'La Chikis',
    avatar: '💃',
    personality: 'especulador',
    preferredTokens: ['*'],
    catchphrase: '¡Esto se va a poner viral!',
    lastTradeTime: 0,
  },
];
