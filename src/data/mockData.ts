export const mockStartups = [
  {
    id: "1",
    name: "CryptoLend MX",
    logo: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=100&h=100&fit=crop&crop=center",
    description: "Plataforma de préstamos descentralizados que permite a usuarios mexicanos acceder a crédito usando crypto como colateral, con tasas competitivas y sin intermediarios bancarios tradicionales.",
    foundedYear: 2022,
    founders: ["María González", "Carlos Ruiz", "Ana López"],
    website: "https://cryptolend.mx",
    tvl: "$2.3M",
    users: "1,200",
    tags: ["DeFi", "Lending", "Collateral"],
    longDescription: "CryptoLend MX revoluciona el acceso al crédito en México mediante una plataforma descentralizada que elimina intermediarios tradicionales. Los usuarios pueden obtener préstamos instantáneos usando sus criptomonedas como garantía, con tasas de interés competitivas determinadas algorítmicamente. La plataforma soporta múltiples tipos de colateral incluyendo BTC, ETH y tokens ERC-20, ofreciendo flexibilidad tanto a prestamistas como prestatarios. Con smart contracts auditados y un sistema de liquidación automática, CryptoLend MX garantiza la seguridad de los fondos mientras democratiza el acceso al capital financiero.",
    socialLinks: {
      twitter: "https://twitter.com/cryptolendmx",
      linkedin: "https://linkedin.com/company/cryptolendmx",
      telegram: "https://t.me/cryptolendmx"
    },
    metrics: {
      totalLoans: "450",
      avgLoanSize: "$5,200",
      liquidationRate: "2.3%"
    }
  },
  {
    id: "2", 
    name: "AztecSwap",
    logo: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=100&h=100&fit=crop&crop=center",
    description: "DEX automatizado que facilita el intercambio de tokens con pools de liquidez optimizados para el mercado mexicano, incluyendo pares MXN-crypto únicos.",
    foundedYear: 2023,
    founders: ["Roberto Hernández", "Sofía Martínez"],
    website: "https://aztecswap.io",
    tvl: "$850K",
    users: "850",
    tags: ["DEX", "AMM", "Liquidity"],
    longDescription: "AztecSwap es el primer DEX automatizado diseñado específicamente para el mercado mexicano. Utiliza un modelo de Market Maker Automatizado (AMM) que optimiza la liquidez para pares de trading únicos como MXN/ETH, MXN/BTC y otros tokens locales. La plataforma ofrece farming de liquidez con recompensas atractivas, swaps con slippage mínimo y una interfaz intuitiva en español. Los usuarios pueden participar como proveedores de liquidez y ganar fees de transacción, mientras que los traders disfrutan de intercambios instantáneos sin necesidad de libros de órdenes tradicionales.",
    socialLinks: {
      twitter: "https://twitter.com/aztecswap",
      discord: "https://discord.gg/aztecswap"
    },
    metrics: {
      dailyVolume: "$125K",
      totalTrades: "12,450",
      liquidityPairs: "28"
    }
  },
  {
    id: "3",
    name: "PesoStable",
    logo: "https://images.unsplash.com/photo-1516245834210-c4c142787335?w=100&h=100&fit=crop&crop=center",
    description: "Stablecoin respaldada por pesos mexicanos que permite pagos DeFi instantáneos y de bajo costo, conectando el peso tradicional con DeFi.",
    foundedYear: 2021,
    founders: ["Diego Morales", "Lucía Fernández", "Manuel Torres", "Carla Jiménez"],
    website: "https://pesostable.com",
    tvl: "$5.7M",
    users: "3,400",
    tags: ["Stablecoin", "Payments", "MXN"],
    longDescription: "PesoStable es la primera stablecoin totalmente respaldada por pesos mexicanos, diseñada para ser el puente entre el sistema financiero tradicional y DeFi. Cada token MXNS está respaldado 1:1 por pesos mexicanos en cuentas bancarias auditadas regularmente. La plataforma permite transferencias instantáneas a costo prácticamente nulo, pagos a comercios, y integración con protocolos DeFi para yield farming y lending. Con licencias regulatorias completas y auditorías mensuales de reservas, PesoStable ofrece la estabilidad del peso con la innovación de blockchain.",
    socialLinks: {
      twitter: "https://twitter.com/pesostable",
      linkedin: "https://linkedin.com/company/pesostable",
      medium: "https://medium.com/@pesostable"
    },
    metrics: {
      circSupply: "5.7M MXNS",
      monthlyTxns: "45,000",
      avgTxnSize: "$127"
    }
  },
  {
    id: "4",
    name: "YieldFarm MX",
    logo: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=100&h=100&fit=crop&crop=center",
    description: "Protocolo de yield farming optimizado para tokens mexicanos, ofreciendo estrategias automatizadas de inversión DeFi con retornos competitivos.",
    foundedYear: 2022,
    founders: ["Fernando Jiménez", "Isabella Torres"],
    website: "https://yieldfarm.mx",
    tvl: "$1.8M",
    users: "920",
    tags: ["Yield Farming", "Auto-strategies", "DeFi"],
    longDescription: "YieldFarm MX democratiza las estrategias de inversión DeFi complejas mediante protocolos automatizados que optimizan rendimientos para usuarios mexicanos. La plataforma utiliza algoritmos avanzados para rebalancear automáticamente las posiciones entre diferentes protocolos, maximizando el APY mientras minimiza el riesgo. Los usuarios pueden depositar sus tokens y el protocolo se encarga de encontrar las mejores oportunidades de yield en tiempo real, desde lending hasta liquidity providing y staking rewards.",
    socialLinks: {
      twitter: "https://twitter.com/yieldfarm_mx",
      telegram: "https://t.me/yieldfarm_mx",
      github: "https://github.com/yieldfarm-mx"
    },
    metrics: {
      avgAPY: "18.5%",
      totalHarvests: "2,340",
      strategies: "12"
    }
  },
  {
    id: "5",
    name: "BlockRemit",
    logo: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=100&h=100&fit=crop&crop=center",
    description: "Plataforma de remesas descentralizada que conecta México con el mundo, ofreciendo transferencias instantáneas y de bajo costo usando blockchain.",
    foundedYear: 2023,
    founders: ["Miguel Ángel Valdez", "Paola Guerrero", "Andrés Muñoz"],
    website: "https://blockremit.io",
    tvl: "$4.2M",
    users: "2,800",
    tags: ["Remittances", "Cross-border", "Payments"],
    longDescription: "BlockRemit revoluciona el mercado de remesas entre México y Estados Unidos utilizando blockchain para eliminar intermediarios costosos. La plataforma permite enviar dinero de forma instantánea con comisiones hasta 80% menores que los métodos tradicionales. Los usuarios pueden enviar desde USD, EUR o cryptos y el receptor puede recibir en pesos mexicanos directamente en su cuenta bancaria o wallet digital. Con partnerships con casas de cambio locales y compliance regulatorio completo, BlockRemit hace las transferencias internacionales accesibles para millones de familias mexicanas.",
    socialLinks: {
      twitter: "https://twitter.com/blockremit",
      linkedin: "https://linkedin.com/company/blockremit",
      telegram: "https://t.me/blockremit"
    },
    metrics: {
      monthlyVolume: "$4.2M",
      avgSavings: "78%",
      countries: "15"
    }
  }
];

export const mockBlogPosts = [
  {
    id: "1",
    title: "El auge de DeFi en Latinoamérica",
    author: "Elena Rodriguez",
    date: "2024-07-15",
    publishedAt: "15 de Julio, 2024",
    readTime: "5 min",
    category: "DeFi",
    excerpt: "Un análisis del crecimiento exponencial de las finanzas descentralizadas en la región y su impacto en la inclusión financiera.",
    tags: ["DeFi", "Latinoamérica", "Tendencias"],
    content: "Un análisis del crecimiento exponencial de las finanzas descentralizadas en la región.",
    image: "https://images.unsplash.com/photo-1642104704074-907c0698b98d?w=400&h=200&fit=crop"
  },
  {
    id: "2",
    title: "Cómo las DAOs están transformando la gobernanza",
    author: "Javier Pérez",
    date: "2024-07-10",
    publishedAt: "10 de Julio, 2024",
    readTime: "7 min",
    category: "Gobernanza",
    excerpt: "Exploramos cómo las organizaciones autónomas descentralizadas están revolucionando la toma de decisiones en el ecosistema crypto.",
    tags: ["DAOs", "Gobernanza", "Blockchain"],
    content: "Exploramos cómo las organizaciones autónomas descentralizadas están revolucionando la toma de decisiones.",
    image: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=200&fit=crop"
  },
  {
    id: "3",
    title: "NFTs: Más allá del arte digital",
    author: "Sofía Mendoza",
    date: "2024-07-05",
    publishedAt: "5 de Julio, 2024",
    readTime: "4 min",
    category: "NFTs",
    excerpt: "Descubre las diversas aplicaciones de los tokens no fungibles, desde coleccionables hasta identidad digital y casos de uso empresariales.",
    tags: ["NFTs", "Arte Digital", "Casos de Uso"],
    content: "Descubre las diversas aplicaciones de los tokens no fungibles, desde coleccionables hasta identidad digital.",
    image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=200&fit=crop"
  },
  {
    id: "4",
    title: "El impacto de la regulación en el ecosistema Crypto",
    author: "Ricardo Castro",
    date: "2024-06-28",
    publishedAt: "28 de Junio, 2024",
    readTime: "6 min",
    category: "Regulación",
    excerpt: "Un vistazo a las leyes que están moldeando el futuro de las criptomonedas en México y el mundo, y su impacto en la adopción.",
    tags: ["Regulación", "Criptomonedas", "Leyes"],
    content: "Un vistazo a las leyes que están moldeando el futuro de las criptomonedas en México y el mundo.",
    image: "https://images.unsplash.com/photo-1589994965851-a8f479c573a9?w=400&h=200&fit=crop"
  },
  {
    id: "5",
    title: "Staking: Una guía completa para principiantes",
    author: "Ana García",
    date: "2024-06-20",
    publishedAt: "20 de Junio, 2024",
    readTime: "8 min",
    category: "Staking",
    excerpt: "Todo lo que necesitas saber sobre staking: desde los conceptos básicos hasta las estrategias avanzadas para maximizar tus rendimientos.",
    tags: ["Staking", "Yield", "Guía"],
    content: "Todo lo que necesitas saber sobre staking: desde los conceptos básicos hasta las estrategias avanzadas.",
    image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop"
  }
];

export const mockEvents = [
  {
    id: "1",
    title: "DeFi México Meetup - Ciudad de México",
    type: "Meetup",
    date: "2024-08-15",
    time: "18:00",
    location: "Polanco, CDMX",
    description: "Únete a nuestra comunidad para discutir las últimas tendencias en DeFi y networking con otros entusiastas.",
    isUpcoming: true
  },
  {
    id: "2",
    title: "Workshop: Construyendo tu primera DApp",
    type: "Workshop",
    date: "2024-08-22",
    time: "10:00",
    location: "Guadalajara, JAL",
    description: "Taller práctico para desarrolladores que quieren aprender a crear aplicaciones descentralizadas.",
    isUpcoming: true
  },
  {
    id: "3",
    title: "Conferencia Anual DeFi México 2024",
    type: "Conferencia",
    date: "2024-09-10",
    time: "09:00",
    location: "Centro de Convenciones, CDMX",
    description: "El evento más importante del ecosistema DeFi mexicano con speakers internacionales.",
    isUpcoming: true
  }
];

export const mockStats = [
  {
    title: "Startups Registradas",
    value: "15",
    description: "Proyectos activos en el ecosistema",
    trend: { value: "+12%", isPositive: true }
  },
  {
    title: "Comunidades Activas",
    value: "5",
    description: "Grupos y comunidades registradas",
    trend: { value: "+25%", isPositive: true }
  },
  {
    title: "Eventos Realizados",
    value: "24",
    description: "Meetups y conferencias organizadas",
    trend: { value: "+8%", isPositive: true }
  },
  {
    title: "Miembros Comunidad",
    value: "12,350",
    description: "Desarrolladores y entusiastas",
    trend: { value: "+25%", isPositive: true }
  },
  {
    title: "TVL Total",
    value: "$18.2M",
    description: "Capital total bloqueado",
    trend: { value: "+15%", isPositive: true }
  }
];

// Re-export communities
export { mockCommunities } from "./communities";