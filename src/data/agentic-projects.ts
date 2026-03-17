// src/data/agentic-projects.ts

export type AgenticCategory = 'trading' | 'prediction' | 'yield' | 'infrastructure' | 'privacy' | 'analytics';
export type AgenticStatus = 'active' | 'beta' | 'development';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface AgenticProject {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  category: AgenticCategory;
  logo_url?: string;
  website?: string;
  github_url?: string;
  twitter_url?: string;
  tags: string[];
  status: AgenticStatus;
  is_featured: boolean;
  highlights?: string[];
  risk_level?: RiskLevel;
}

export const AGENTIC_CATEGORIES: AgenticCategory[] = [
  'trading',
  'prediction',
  'yield',
  'infrastructure',
  'privacy',
  'analytics',
];

export const AGENTIC_PROJECTS: AgenticProject[] = [
  {
    id: 'bankrbot',
    name: 'BankrBot',
    description: 'Infraestructura financiera para agentes autónomos. Token launches, procesamiento de pagos, trading y automatización de yield.',
    longDescription: 'BankrBot es la infraestructura financiera más completa para agentes autónomos en el ecosistema OpenClaw. Permite a los agentes ejecutar operaciones financieras complejas: compra/venta/swap de tokens, consulta de portafolio, trading con apalancamiento, apuestas en Polymarket, deploy de tokens ERC20, y estrategias de trading automatizadas. Es el skill financiero más utilizado del ecosistema.',
    category: 'infrastructure',
    website: 'https://bankr.bot',
    github_url: 'https://github.com/BankrBot/openclaw-skills',
    twitter_url: 'https://x.com/bankaborot',
    tags: ['OpenClaw', 'DeFi', 'Trading', 'Yield', 'Polymarket', 'ERC20'],
    status: 'active',
    is_featured: true,
    highlights: [
      'Skill financiero #1 del ecosistema OpenClaw',
      'Soporte para trading, yield, NFTs y token deployment',
      'Integración nativa con Polymarket',
      'Automatización de estrategias de trading',
    ],
    risk_level: 'high',
  },
  {
    id: 'openclaw-trading',
    name: 'OpenClaw Trading Assistant',
    description: 'Agente de trading AI con integración Hyperliquid. Monitoreo en tiempo real, señales inteligentes y ejecución sub-segundo.',
    longDescription: 'A diferencia de bots convencionales que dependen de estrategias rígidas como RSI crossovers, el Trading Assistant de OpenClaw es un sistema self-learning y flexible. Entrega 5 tipos de señales cruciales e incorpora 5 capas de protección contra pérdidas masivas. Integración directa con Hyperliquid L1 para ejecución sub-segundo en perpetuales (crypto) y spot (sintéticos de acciones/commodities).',
    category: 'trading',
    github_url: 'https://github.com/molt-bot/openclaw-trading-assistant',
    tags: ['Hyperliquid', 'Perpetuales', 'AI Trading', 'Self-learning', 'Signals'],
    status: 'active',
    is_featured: true,
    highlights: [
      'Ejecución sub-segundo via Hyperliquid L1',
      '5 tipos de señales + 5 capas de protección',
      'Sistema self-learning (no reglas rígidas)',
      'Soporta perpetuales y sintéticos spot',
    ],
    risk_level: 'high',
  },
  {
    id: 'orderly-sdk',
    name: 'Orderly Network Agent SDK',
    description: 'SDK que permite a agentes AI tradear perpetuales DeFi con solo 3 líneas de código. APIs agent-first.',
    longDescription: 'Lanzado en febrero 2026, este SDK revoluciona cómo los agentes AI interactúan con mercados DeFi de perpetuales. Elimina la complejidad de firmas criptográficas y presenta APIs human-readable diseñadas específicamente para agentes autónomos, no para interfaces manuales. Enfoque "agent-first" que prioriza integraciones programáticas sobre workflows UI.',
    category: 'infrastructure',
    website: 'https://orderly.network',
    twitter_url: 'https://x.com/OrderlyNetwork',
    tags: ['Perpetuales', 'SDK', 'Agent-first', 'DeFi Perps', 'API'],
    status: 'active',
    is_featured: true,
    highlights: [
      'Trading de perpetuales con 3 líneas de código',
      'APIs diseñadas para agentes, no humanos',
      'Sin firmas criptográficas complejas',
      'Repositorio público para desarrolladores',
    ],
    risk_level: 'medium',
  },
  {
    id: 'polymarket-ai',
    name: 'Polymarket AI Trader',
    description: 'Automatización de trading en mercados de predicción. Análisis de sentimiento en tiempo real para posiciones Yes/No.',
    longDescription: 'Agentes que monitorean feeds de noticias globales y sentimiento en redes sociales en tiempo real para automatizar posiciones en Polymarket, el mercado de predicción descentralizado más grande del mundo. Reducen el lag humano y permiten extraer ganancias de mispricings que normalmente solo capturan bots institucionales.',
    category: 'prediction',
    tags: ['Polymarket', 'Predicción', 'Sentimiento', 'NLP', 'News Trading'],
    status: 'active',
    is_featured: false,
    highlights: [
      'Monitoreo de noticias y sentimiento en tiempo real',
      'Automatización de posiciones Yes/No en Polymarket',
      'Reducción de lag humano vs bots institucionales',
      'Análisis NLP de redes sociales',
    ],
    risk_level: 'high',
  },
  {
    id: 'clanker',
    name: 'Clanker',
    description: 'Permite a agentes desplegar tokens ERC20 en Base y otras cadenas EVM automáticamente via SDK.',
    longDescription: 'Clanker es un skill de OpenClaw que automatiza el deployment de tokens ERC20 en Base y otras cadenas EVM compatibles. Los agentes pueden crear, configurar y lanzar tokens de forma autónoma usando el Clanker SDK, democratizando el acceso a la creación de tokens sin necesidad de conocimiento técnico profundo de Solidity.',
    category: 'infrastructure',
    github_url: 'https://github.com/clanker-sdk',
    tags: ['ERC20', 'Base', 'Token Launch', 'EVM', 'Smart Contracts'],
    status: 'active',
    is_featured: false,
    highlights: [
      'Deploy de tokens ERC20 automatizado',
      'Soporte multi-chain EVM (Base, Ethereum, etc.)',
      'SDK para integración con agentes',
      'Sin necesidad de Solidity',
    ],
    risk_level: 'medium',
  },
  {
    id: 'veil-cash',
    name: 'Veil Cash',
    description: 'Transacciones privadas y blindadas en Base usando Zero-Knowledge proofs para agentes financieros.',
    longDescription: 'Veil Cash proporciona privacidad financiera para agentes autónomos mediante transacciones blindadas en la red Base utilizando pruebas de conocimiento cero (ZK proofs). Permite que los agentes ejecuten operaciones financieras sin exponer montos, direcciones o patrones de trading a observadores externos.',
    category: 'privacy',
    tags: ['ZK Proofs', 'Privacidad', 'Base', 'Shielded', 'Confidential'],
    status: 'beta',
    is_featured: false,
    highlights: [
      'Transacciones blindadas via ZK proofs',
      'Privacidad en red Base',
      'Protección de patrones de trading',
      'Integración con ecosistema OpenClaw',
    ],
    risk_level: 'medium',
  },
  {
    id: 'endaoment',
    name: 'Endaoment',
    description: 'Donaciones onchain a organizaciones benéficas via agentes. Soporte para Base, Ethereum y Optimism.',
    longDescription: 'Endaoment facilita donaciones caritativas onchain a través de agentes autónomos. Soporta múltiples cadenas (Base, Ethereum, Optimism) y permite a los agentes gestionar portfolios filantrópicos, optimizar deducciones fiscales y automatizar donaciones recurrentes a organizaciones verificadas.',
    category: 'yield',
    website: 'https://endaoment.org',
    tags: ['Donaciones', 'Onchain', 'Multi-chain', 'Filantropía', 'Base'],
    status: 'active',
    is_featured: false,
    highlights: [
      'Donaciones onchain multi-chain',
      'Organizaciones verificadas',
      'Automatización de donaciones recurrentes',
      'Soporte Base, Ethereum, Optimism',
    ],
    risk_level: 'low',
  },
  {
    id: 'alpha-arena',
    name: 'Alpha Arena',
    description: 'Competencias de trading AI por temporadas. Leaderboards, rankings y estrategias competitivas entre agentes.',
    longDescription: 'Alpha Arena organiza competencias de trading entre agentes AI por temporadas. Los agentes compiten en leaderboards basados en rendimiento real, creando un ecosistema competitivo que impulsa la innovación en estrategias de trading algorítmico. Las mejores prácticas y estrategias ganadoras se documentan y comparten con la comunidad.',
    category: 'trading',
    tags: ['Competencia', 'Leaderboard', 'Algorítmico', 'Rankings', 'Temporadas'],
    status: 'active',
    is_featured: false,
    highlights: [
      'Competencias de trading por temporadas',
      'Leaderboards basados en rendimiento real',
      'Documentación de estrategias ganadoras',
      'Comunidad competitiva de agentes AI',
    ],
    risk_level: 'high',
  },
  {
    id: 'zapper-agent',
    name: 'Zapper Agent',
    description: 'Tracking de portafolio y gestión de posiciones DeFi. Monitoreo multi-chain automatizado.',
    longDescription: 'El skill Zapper para OpenClaw automatiza el tracking de portafolios DeFi multi-chain. Los agentes pueden monitorear posiciones, alertar sobre cambios significativos en precios o liquidez, y ejecutar rebalanceos automáticos. Integra datos de múltiples protocolos DeFi para dar una vista unificada del portafolio.',
    category: 'analytics',
    github_url: 'https://github.com/BankrBot/openclaw-skills/tree/main/zapper',
    tags: ['Portfolio', 'Multi-chain', 'DeFi Tracking', 'Rebalanceo', 'Alertas'],
    status: 'active',
    is_featured: false,
    highlights: [
      'Tracking multi-chain automatizado',
      'Alertas de precios y liquidez',
      'Rebalanceo automático de portafolio',
      'Vista unificada multi-protocolo',
    ],
    risk_level: 'low',
  },
  {
    id: 'nexustrade',
    name: 'NexusTrade',
    description: 'Plataforma de trading algorítmico potenciada por AI. Estrategias personalizadas sin código.',
    longDescription: 'NexusTrade es una plataforma que permite crear estrategias de trading algorítmico usando AI, sin necesidad de escribir código. A diferencia de enfoques simplistas con OpenClaw, NexusTrade ofrece un framework robusto con backtesting, gestión de riesgo y ejecución en múltiples exchanges. Enfocado en traders que quieren ir más allá de bots básicos.',
    category: 'trading',
    website: 'https://nexustrade.io',
    twitter_url: 'https://x.com/nexustrade_io',
    tags: ['Algorítmico', 'No-code', 'Backtesting', 'Multi-exchange', 'Risk Management'],
    status: 'active',
    is_featured: false,
    highlights: [
      'Creación de estrategias sin código',
      'Backtesting con datos históricos',
      'Gestión de riesgo integrada',
      'Ejecución multi-exchange',
    ],
    risk_level: 'medium',
  },
  {
    id: 'stock-market-pro',
    name: 'Stock Market Pro',
    description: 'Skill de análisis bursátil con Yahoo Finance. Cotizaciones, fundamentales, charts con RSI/MACD/BB/VWAP/ATR y tendencias ASCII.',
    longDescription: 'Stock Market Pro es un skill de ClawHub que convierte a tu agente OpenClaw en un analista bursátil completo. Integrado con Yahoo Finance (yfinance), ofrece cotizaciones en tiempo real, análisis fundamental, visualizaciones de tendencias en ASCII y charts de alta resolución con indicadores técnicos avanzados: RSI, MACD, Bandas de Bollinger, VWAP y ATR. Ideal para agentes que necesitan tomar decisiones de trading informadas.',
    category: 'analytics',
    website: 'https://clawhub.ai/kys42/stock-market-pro',
    tags: ['Yahoo Finance', 'Análisis Técnico', 'RSI', 'MACD', 'Bollinger Bands', 'ClawHub'],
    status: 'active',
    is_featured: false,
    highlights: [
      'Cotizaciones en tiempo real via Yahoo Finance',
      'Charts con RSI, MACD, Bollinger Bands, VWAP, ATR',
      'Visualizaciones ASCII en terminal',
      'Análisis fundamental de acciones',
    ],
    risk_level: 'low',
  },
];
