// Sistema de Scoring Ponderado para Oportunidades de Inversión

export interface ScoringWeights {
  apy: number;      // Peso del APY (rendimiento)
  risk: number;     // Peso del riesgo
  liquidity: number; // Peso de la liquidez
  security: number;  // Peso de seguridad/regulación
}

export interface OpportunityScore {
  totalScore: number;
  apyScore: number;
  riskScore: number;
  liquidityScore: number;
  securityScore: number;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D';
  recommendation: string;
}

// Pesos por defecto (suman 100%)
export const DEFAULT_WEIGHTS: ScoringWeights = {
  apy: 0.40,      // 40%
  risk: 0.30,     // 30%
  liquidity: 0.20, // 20%
  security: 0.10   // 10%
};

/**
 * Calcula el score de una oportunidad de inversión
 */
export function calculateOpportunityScore(
  opportunity: {
    apy: number;
    risk: string;
    horizon: string;
    source: 'fintech' | 'defi';
    platform?: string;
  },
  weights: ScoringWeights = DEFAULT_WEIGHTS
): OpportunityScore {
  
  // 1. Score de APY (0-100)
  // Normalizar APY: 0% = 0 puntos, 20%+ = 100 puntos
  const apyScore = Math.min(100, (opportunity.apy / 20) * 100);
  
  // 2. Score de Riesgo (0-100)
  // Invertido: menor riesgo = mayor score
  const riskScore = getRiskScore(opportunity.risk);
  
  // 3. Score de Liquidez (0-100)
  const liquidityScore = getLiquidityScore(opportunity.horizon);
  
  // 4. Score de Seguridad (0-100)
  const securityScore = getSecurityScore(opportunity.source, opportunity.platform);
  
  // Calcular score total ponderado
  const totalScore = 
    (apyScore * weights.apy) +
    (riskScore * weights.risk) +
    (liquidityScore * weights.liquidity) +
    (securityScore * weights.security);
  
  // Determinar calificación
  const grade = getGrade(totalScore);
  
  // Generar recomendación
  const recommendation = generateRecommendation(
    totalScore, 
    opportunity.apy, 
    opportunity.risk,
    opportunity.source
  );
  
  return {
    totalScore: Math.round(totalScore),
    apyScore: Math.round(apyScore),
    riskScore: Math.round(riskScore),
    liquidityScore: Math.round(liquidityScore),
    securityScore: Math.round(securityScore),
    grade,
    recommendation
  };
}

/**
 * Calcula score basado en nivel de riesgo
 */
function getRiskScore(risk: string): number {
  const riskMap: Record<string, number> = {
    'Bajo': 100,
    'Medio': 60,
    'Moderado': 60,
    'Alto': 30,
    'Muy Alto': 10
  };
  return riskMap[risk] || 50;
}

/**
 * Calcula score basado en liquidez/horizonte
 */
function getLiquidityScore(horizon: string): number {
  const horizonLower = horizon.toLowerCase();
  
  if (horizonLower.includes('inmediata') || horizonLower.includes('diaria')) {
    return 100;
  } else if (horizonLower.includes('flexible')) {
    return 90;
  } else if (horizonLower.includes('corto')) {
    return 80;
  } else if (horizonLower.includes('semanal') || horizonLower.includes('7d')) {
    return 70;
  } else if (horizonLower.includes('mediano')) {
    return 50;
  } else if (horizonLower.includes('largo')) {
    return 30;
  } else if (horizonLower.includes('vencimiento')) {
    return 20;
  }
  
  return 50; // Default
}

/**
 * Calcula score de seguridad/regulación
 */
function getSecurityScore(source: 'fintech' | 'defi', platform?: string): number {
  if (source === 'fintech') {
    // Plataformas reguladas
    const regulatedPlatforms: Record<string, number> = {
      'Cetesdirecto': 100, // Gobierno
      'GBM': 90,          // CNBV
      'Kuspit': 85,       // CNBV
      'Fintual': 80,      // CNBV
      'Nu': 75,
      'Hey Banco': 75
    };
    
    return regulatedPlatforms[platform || ''] || 70;
  } else {
    // DeFi - basado en protocolo
    const defiSecurity: Record<string, number> = {
      'Aave': 80,      // Muy auditado
      'Compound': 75,  // Establecido
      'Yearn': 70,     // Confiable
      'Uniswap': 70,   // Líder DEX
      'Curve': 65,
      'Maker': 65
    };
    
    return defiSecurity[platform || ''] || 40;
  }
}

/**
 * Determina la calificación basada en el score total
 */
function getGrade(score: number): OpportunityScore['grade'] {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C+';
  if (score >= 40) return 'C';
  return 'D';
}

/**
 * Genera recomendación personalizada
 */
function generateRecommendation(
  score: number, 
  apy: number, 
  risk: string,
  source: 'fintech' | 'defi'
): string {
  if (score >= 80) {
    return '⭐ Excelente oportunidad con balance óptimo entre rendimiento y riesgo';
  } else if (score >= 70) {
    if (apy > 10) {
      return '✅ Buena opción para inversionistas con tolerancia al riesgo';
    } else {
      return '✅ Opción sólida y conservadora para preservar capital';
    }
  } else if (score >= 60) {
    if (risk === 'Alto') {
      return '⚠️ Considerar solo si tienes alta tolerancia al riesgo';
    } else {
      return '👍 Opción aceptable para diversificación';
    }
  } else if (score >= 50) {
    if (source === 'defi') {
      return '⚡ Requiere conocimiento técnico de DeFi';
    } else {
      return '💡 Evaluar alternativas con mejor rendimiento';
    }
  } else {
    return '❌ No recomendado - revisar otras opciones';
  }
}

/**
 * Calcula score para múltiples oportunidades y las ordena
 */
export function rankOpportunities(
  opportunities: Array<{
    id: string;
    apy: number;
    risk: string;
    horizon: string;
    source: 'fintech' | 'defi';
    platform?: string;
  }>,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): Array<{ opportunity: typeof opportunities[0]; score: OpportunityScore }> {
  return opportunities
    .map(opp => ({
      opportunity: opp,
      score: calculateOpportunityScore(opp, weights)
    }))
    .sort((a, b) => b.score.totalScore - a.score.totalScore);
}

/**
 * Obtiene el color para el badge de calificación
 */
export function getGradeColor(grade: OpportunityScore['grade']): string {
  const colors: Record<OpportunityScore['grade'], string> = {
    'A+': 'bg-emerald-500 text-white',
    'A': 'bg-green-500 text-white',
    'B+': 'bg-lime-500 text-white',
    'B': 'bg-yellow-500 text-white',
    'C+': 'bg-orange-500 text-white',
    'C': 'bg-red-500 text-white',
    'D': 'bg-gray-500 text-white'
  };
  return colors[grade];
}

/**
 * Calcula el perfil de riesgo sugerido basado en preferencias
 */
export function getSuggestedProfile(preferences: {
  age: number;
  investmentHorizon: 'corto' | 'mediano' | 'largo';
  riskTolerance: 'conservador' | 'moderado' | 'agresivo';
  hasExperience: boolean;
}): ScoringWeights {
  let weights = { ...DEFAULT_WEIGHTS };
  
  // Ajustar por edad
  if (preferences.age < 30) {
    weights.apy += 0.1;
    weights.risk -= 0.1;
  } else if (preferences.age > 50) {
    weights.risk += 0.1;
    weights.security += 0.05;
    weights.apy -= 0.15;
  }
  
  // Ajustar por tolerancia al riesgo
  if (preferences.riskTolerance === 'conservador') {
    weights.risk += 0.15;
    weights.security += 0.05;
    weights.apy -= 0.2;
  } else if (preferences.riskTolerance === 'agresivo') {
    weights.apy += 0.15;
    weights.risk -= 0.15;
  }
  
  // Ajustar por horizonte
  if (preferences.investmentHorizon === 'corto') {
    weights.liquidity += 0.1;
    weights.apy -= 0.1;
  } else if (preferences.investmentHorizon === 'largo') {
    weights.apy += 0.1;
    weights.liquidity -= 0.1;
  }
  
  // Normalizar para que sume 1
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  Object.keys(weights).forEach(key => {
    weights[key as keyof ScoringWeights] /= total;
  });
  
  return weights;
}