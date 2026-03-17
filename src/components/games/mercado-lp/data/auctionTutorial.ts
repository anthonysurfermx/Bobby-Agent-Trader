import { AuctionTutorialStep, AuctionTutorialState, Auction, Token } from '../types/game';

/**
 * Tutorial steps for the auction system
 */
export const auctionTutorialSteps: AuctionTutorialStep[] = [
  {
    id: 'welcome',
    title: '¡Bienvenido a las Subastas!',
    description: 'Las subastas de tipo "Continuous Clearing Auction" (CCA) son una forma justa de distribuir tokens nuevos. En lugar de "primero en llegar", todos ofertan y el precio se determina colectivamente.',
    position: 'center',
    action: 'next',
  },
  {
    id: 'blocks-explained',
    title: 'Subastas por Bloques',
    description: 'La subasta se divide en 5 bloques. Cada bloque tiene una cantidad fija de tokens disponibles. Puedes ofertar en cualquier bloque, pero los bloques anteriores suelen tener mejores precios.',
    highlightElement: 'auction-blocks',
    position: 'bottom',
    action: 'next',
  },
  {
    id: 'bid-mechanics',
    title: 'Cómo Ofertar',
    description: 'Para cada bloque, defines: 1) Precio máximo que estás dispuesto a pagar por token, y 2) Cantidad total a gastar. Cuanto mayor sea tu precio máximo, más probabilidad de ganar tokens.',
    highlightElement: 'bid-form',
    position: 'left',
    action: 'next',
  },
  {
    id: 'clearing-price',
    title: 'Precio de Liquidación',
    description: 'Cuando el bloque cierra, se calcula el "precio de liquidación" - el precio más bajo al que se venden todos los tokens. Si tu precio máximo es mayor o igual, ¡ganas tokens! Y pagas el precio de liquidación, no tu máximo.',
    highlightElement: 'clearing-info',
    position: 'top',
    action: 'next',
  },
  {
    id: 'practice-bid',
    title: '¡Hora de Practicar!',
    description: 'Vamos a colocar tu primera oferta. Ingresa un precio máximo de 8 pesos y un gasto total de 40 pesos. Esto te daría hasta 5 tokens si el precio de liquidación es 8 o menos.',
    highlightElement: 'bid-form',
    position: 'left',
    action: 'bid',
    showBidForm: true,
    suggestedBid: { maxPrice: 8, totalSpend: 40 },
  },
  {
    id: 'advance-block',
    title: 'Avanzar al Siguiente Bloque',
    description: '¡Excelente! Ahora vamos a avanzar al siguiente bloque para ver cómo se ejecuta tu oferta. Haz clic en "Ejecutar Bloque" para procesar las ofertas.',
    highlightElement: 'advance-button',
    position: 'bottom',
    action: 'advance',
  },
  {
    id: 'results',
    title: 'Resultados de la Subasta',
    description: 'El bloque se ha ejecutado. Puedes ver el precio de liquidación y cuántos tokens ganaste. Si ganaste tokens, estos se agregan automáticamente a tu inventario.',
    highlightElement: 'auction-results',
    position: 'top',
    action: 'next',
  },
  {
    id: 'strategy-tips',
    title: 'Consejos Estratégicos',
    description: '💡 Tips:\n• Ofertar temprano (bloques 1-2) suele dar mejores precios\n• Un precio máximo muy bajo puede dejarte sin tokens\n• Un precio muy alto asegura tokens pero pagas más\n• Distribuye tu capital entre varios bloques para diversificar',
    position: 'center',
    action: 'next',
  },
  {
    id: 'complete',
    title: '¡Tutorial Completado!',
    description: '¡Felicidades! Ya sabes cómo funcionan las subastas CCA. Esta subasta de práctica continuará para que experimentes. En subastas reales, podrás ganar tokens de nuevos proyectos. ¡Buena suerte!',
    position: 'center',
    action: 'complete',
  },
];

/**
 * English translations for tutorial steps
 */
export const auctionTutorialStepsEn: Record<string, { title: string; description: string }> = {
  welcome: {
    title: 'Welcome to Auctions!',
    description: 'Continuous Clearing Auctions (CCA) are a fair way to distribute new tokens. Instead of "first come, first served", everyone bids and the price is determined collectively.',
  },
  'blocks-explained': {
    title: 'Auctions by Blocks',
    description: 'The auction is divided into 5 blocks. Each block has a fixed amount of tokens available. You can bid on any block, but earlier blocks usually have better prices.',
  },
  'bid-mechanics': {
    title: 'How to Bid',
    description: 'For each block, you define: 1) Maximum price you\'re willing to pay per token, and 2) Total amount to spend. The higher your max price, the more likely you are to win tokens.',
  },
  'clearing-price': {
    title: 'Clearing Price',
    description: 'When the block closes, the "clearing price" is calculated - the lowest price at which all tokens are sold. If your max price is equal or higher, you win tokens! And you pay the clearing price, not your maximum.',
  },
  'practice-bid': {
    title: 'Time to Practice!',
    description: 'Let\'s place your first bid. Enter a max price of 8 pesos and total spend of 40 pesos. This would give you up to 5 tokens if the clearing price is 8 or less.',
  },
  'advance-block': {
    title: 'Advance to Next Block',
    description: 'Excellent! Now let\'s advance to the next block to see how your bid executes. Click "Execute Block" to process the bids.',
  },
  results: {
    title: 'Auction Results',
    description: 'The block has been executed. You can see the clearing price and how many tokens you won. If you won tokens, they\'re automatically added to your inventory.',
  },
  'strategy-tips': {
    title: 'Strategy Tips',
    description: '💡 Tips:\n• Bidding early (blocks 1-2) usually gives better prices\n• A very low max price might leave you without tokens\n• A very high price ensures tokens but you pay more\n• Distribute your capital across multiple blocks to diversify',
  },
  complete: {
    title: 'Tutorial Complete!',
    description: 'Congratulations! You now know how CCA auctions work. This practice auction will continue so you can experiment. In real auctions, you can win tokens from new projects. Good luck!',
  },
};

/**
 * Create a practice auction for the tutorial
 */
export const createPracticeAuction = (practiceToken: Token): Auction => {
  const blocksCount = 5;
  const totalSupply = 50;
  const tokensPerBlock = totalSupply / blocksCount;
  const startPrice = 5;

  // Add some NPC bids to make it realistic
  const npcBids = [
    { id: 'npc-1', bidderId: 'npc-1', bidderName: 'Doña María', maxPrice: 7, totalSpend: 28 },
    { id: 'npc-2', bidderId: 'npc-2', bidderName: 'El Güero', maxPrice: 9, totalSpend: 45 },
    { id: 'npc-3', bidderId: 'npc-3', bidderName: 'Don Pepe', maxPrice: 6, totalSpend: 24 },
  ];

  return {
    id: 'tutorial-auction',
    tokenOffered: practiceToken,
    totalSupply,
    blocksCount,
    tokensPerBlock,
    blocks: Array.from({ length: blocksCount }, (_, i) => ({
      id: `tutorial-block-${i + 1}`,
      blockNumber: i + 1,
      tokensAvailable: tokensPerBlock,
      currentPrice: startPrice + i,
      minPrice: startPrice,
      bids: i === 0 ? npcBids : [],
      executed: false,
    })),
    currentBlock: 1,
    startPrice,
    active: true,
    createdBy: 'tutorial',
  };
};

/**
 * Practice token for tutorial
 */
export const tutorialToken: Token = {
  id: 'tutorial-token',
  name: 'TutoCoin',
  symbol: 'TUTO',
  emoji: '📚',
  color: '#8B5CF6',
  isBaseToken: false,
};

/**
 * Initialize tutorial state
 */
export const initAuctionTutorial = (): AuctionTutorialState => ({
  isActive: true,
  currentStep: 0,
  steps: auctionTutorialSteps,
  completed: false,
  practiceAuction: createPracticeAuction(tutorialToken),
});

/**
 * Advance to next tutorial step
 */
export const advanceTutorialStep = (state: AuctionTutorialState): AuctionTutorialState => {
  const nextStep = state.currentStep + 1;

  if (nextStep >= state.steps.length) {
    return {
      ...state,
      completed: true,
      isActive: false,
    };
  }

  return {
    ...state,
    currentStep: nextStep,
  };
};

/**
 * Get current step
 */
export const getCurrentStep = (state: AuctionTutorialState): AuctionTutorialStep | null => {
  if (!state.isActive || state.completed) return null;
  return state.steps[state.currentStep] || null;
};

/**
 * Check if action matches current step requirement
 */
export const isActionRequired = (
  state: AuctionTutorialState,
  action: 'next' | 'bid' | 'advance' | 'complete'
): boolean => {
  const currentStep = getCurrentStep(state);
  return currentStep?.action === action;
};

/**
 * Get translated step content
 */
export const getTranslatedStep = (
  step: AuctionTutorialStep,
  language: 'es' | 'en'
): { title: string; description: string } => {
  if (language === 'en' && auctionTutorialStepsEn[step.id]) {
    return auctionTutorialStepsEn[step.id];
  }
  return { title: step.title, description: step.description };
};

/**
 * Calculate tutorial progress percentage
 */
export const getTutorialProgress = (state: AuctionTutorialState): number => {
  if (state.completed) return 100;
  return Math.round((state.currentStep / state.steps.length) * 100);
};
