export type EdgeAdviceMode = 'trade' | 'invest' | 'hybrid';
export type EdgeRiskProfile = 'conservative' | 'balanced' | 'aggressive';
export type EdgeHorizon = 'short_term' | 'medium_term' | 'long_term';
export type InvestorResponseTemplate =
  | 'allocation_split'
  | 'cash_buffer_first'
  | 'capital_preservation'
  | 'retirement_plan'
  | 'btc_accumulation'
  | 'salary_bucket'
  | 'yield_safety'
  | 'crypto_core_diversification';

export interface InvestorEdgeCasePolicy {
  id: string;
  forcedMode: EdgeAdviceMode;
  riskProfile?: EdgeRiskProfile;
  horizon?: EdgeHorizon;
  responseTemplate: InvestorResponseTemplate;
  notes: string[];
  preferSimplePath: boolean;
}

interface InvestorEdgeCaseRule extends InvestorEdgeCasePolicy {
  patterns: RegExp[];
}

const INVESTOR_EDGE_CASE_RULES: InvestorEdgeCaseRule[] = [
  {
    id: 'btc-eth-allocation-split',
    forcedMode: 'invest',
    riskProfile: 'balanced',
    horizon: 'long_term',
    responseTemplate: 'allocation_split',
    preferSimplePath: true,
    notes: [
      'Treat this as a long-term allocation split, not a pair trade.',
      'Compare the role of BTC vs ETH in a starter portfolio.',
      'Do not use long/short, entry, or stop language.',
    ],
    patterns: [
      /qu[eé]\s+porcentaje.*bitcoin.*ethereum/i,
      /qu[eé]\s+porcentaje.*btc.*eth/i,
      /\b(bitcoin|btc)\s+vs\s+(ethereum|eth)\b/i,
    ],
  },
  {
    id: 'cash-vs-invested-balance',
    forcedMode: 'invest',
    riskProfile: 'conservative',
    horizon: 'long_term',
    responseTemplate: 'cash_buffer_first',
    preferSimplePath: true,
    notes: [
      'Frame the answer around liquidity, emergency buffer, and deployable capital.',
      'This is a savings/allocation question, not market timing.',
    ],
    patterns: [
      /cash\s+vs\s+invertid/i,
      /cash\s+vs\s+invertir/i,
      /cu[aá]nto.*cash/i,
      /cu[aá]nto.*invertid/i,
    ],
  },
  {
    id: 'crypto-core-diversification',
    forcedMode: 'invest',
    riskProfile: 'balanced',
    horizon: 'long_term',
    responseTemplate: 'crypto_core_diversification',
    preferSimplePath: true,
    notes: [
      'Answer as diversification across major crypto holdings.',
      'Do not turn this into a directional trade on ETH or SOL.',
    ],
    patterns: [
      /c[oó]mo\s+diversific\w*.*ethereum.*solana.*bitcoin/i,
      /diversific\w*.*eth.*sol.*btc/i,
      /entre\s+ethereum,\s*solana\s+y\s+bitcoin/i,
    ],
  },
  {
    id: 'fear-of-loss',
    forcedMode: 'invest',
    riskProfile: 'conservative',
    horizon: 'long_term',
    responseTemplate: 'capital_preservation',
    preferSimplePath: true,
    notes: [
      'Prioritize capital preservation, cash buffer, and simplicity.',
      'Assume the user should size risk down until trust and tolerance improve.',
    ],
    patterns: [
      /miedo\s+de\s+perder/i,
      /perder\s+mi\s+dinero/i,
      /no\s+quiero\s+perder/i,
    ],
  },
  {
    id: 'retire-with-crypto',
    forcedMode: 'invest',
    riskProfile: 'balanced',
    horizon: 'long_term',
    responseTemplate: 'retirement_plan',
    preferSimplePath: true,
    notes: [
      'Treat this as a retirement accumulation plan, not a hero trade.',
      'Diversification and survivability matter more than max upside.',
    ],
    patterns: [
      /jubilarme.*crypto/i,
      /crypto.*jubilarme/i,
      /retiro.*crypto/i,
      /10\s+a[nñ]os.*crypto/i,
    ],
  },
  {
    id: 'accumulate-bitcoin',
    forcedMode: 'invest',
    riskProfile: 'balanced',
    horizon: 'long_term',
    responseTemplate: 'btc_accumulation',
    preferSimplePath: true,
    notes: [
      'Focus on accumulation strategy, not tactical long/short.',
      'Prefer DCA, staggered entries, and dry powder.',
    ],
    patterns: [
      /estrategia.*acumular\s+bitcoin/i,
      /acumular\s+bitcoin/i,
      /acumular\s+btc/i,
      /dca\s+en\s+bitcoin/i,
    ],
  },
  {
    id: 'salary-contribution',
    forcedMode: 'invest',
    riskProfile: 'conservative',
    horizon: 'long_term',
    responseTemplate: 'salary_bucket',
    preferSimplePath: true,
    notes: [
      'State a contribution-rate rule in prose, then output a 100% invested-bucket portfolio.',
      'Do not return a portfolio that sums to the salary percentage itself.',
    ],
    patterns: [
      /qu[eé]\s+porcentaje.*sueldo/i,
      /qu[eé]\s+porcentaje.*salario/i,
      /mi\s+sueldo.*invert/i,
      /salary.*invest/i,
    ],
  },
  {
    id: 'dca-bitcoin',
    forcedMode: 'invest',
    riskProfile: 'balanced',
    horizon: 'long_term',
    responseTemplate: 'btc_accumulation',
    preferSimplePath: true,
    notes: [
      'Treat DCA as accumulation policy with a risk-managed reserve.',
      'No short-term trading language.',
    ],
    patterns: [
      /conviene\s+hacer\s+dca\s+en\s+bitcoin/i,
      /\bdca\b.*bitcoin/i,
      /\bdca\b.*btc/i,
    ],
  },
  {
    id: 'lido-staking-safety',
    forcedMode: 'invest',
    riskProfile: 'conservative',
    horizon: 'long_term',
    responseTemplate: 'yield_safety',
    preferSimplePath: true,
    notes: [
      'Answer with smart-contract, validator, and liquid-staking complexity in mind.',
      'Keep ETH staking as a sleeve, not the whole portfolio.',
    ],
    patterns: [
      /segur\w*.*lido/i,
      /lido.*staking.*ethereum/i,
      /lido.*eth/i,
    ],
  },
];

export function matchInvestorEdgeCasePolicy(question: string): InvestorEdgeCasePolicy | null {
  const normalized = question.trim();
  if (!normalized) return null;

  for (const rule of INVESTOR_EDGE_CASE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      const { patterns: _patterns, ...policy } = rule;
      return policy;
    }
  }

  return null;
}
