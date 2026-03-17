import { useState, Fragment } from 'react';
import { CHART_COLORS } from './DefiChartTheme';

interface Skill {
  name: string;
  description: string;
}

interface Platform {
  name: string;
  type: 'CEX' | 'DEX';
  launch: string;
  chains: string;
  mcp: boolean;
  skills: Skill[];
  integration: string[];
  highlight?: boolean;
}

const PLATFORMS: Platform[] = [
  {
    name: 'Binance',
    type: 'CEX',
    launch: 'Mar 2026',
    chains: 'BNB Chain',
    mcp: true,
    integration: ['MCP', 'Cursor', 'Claude Desktop', 'OpenClaw'],
    skills: [
      { name: 'Binance Spot Skill', description: 'Real-time market data (order book, price, depth, candlesticks) + trade execution (OCO/OPO/OTOCO)' },
      { name: 'Query Address Info', description: 'Wallet holdings breakdown, valuation, 24h changes, concentration insights, whale tracking' },
      { name: 'Query Token Info', description: 'Token metadata: symbol, chain, price, liquidity, holders, trading activities' },
      { name: 'Crypto Market Rank', description: 'Aggregated rankings: trends, hot searches, smart money inflows, meme narratives, trader PnL' },
      { name: 'Meme Rush', description: 'Meme token tracking across lifecycle stages (newly launched, migrating, migrated) + narrative mapping' },
      { name: 'Trading Signal', description: 'Smart money buy/sell signals with trigger price, current price, maxGain, exitRate, signal status' },
      { name: 'Query Token Audit', description: 'Contract risk detection: mintability, freeze functions, ownership privileges, trading restrictions' },
    ],
  },
  {
    name: 'OKX OnchainOS',
    type: 'CEX',
    launch: 'Mar 3, 2026',
    chains: '60+ chains',
    mcp: true,
    integration: ['MCP', 'AI Skills', 'REST API', 'Claude Code', 'Cursor'],
    highlight: true,
    skills: [
      { name: 'Wallet', description: 'Query balances, broadcast transactions, retrieve history across 20+ chains' },
      { name: 'Trade', description: 'Smart routing across 500+ DEXs for optimal swap execution and pricing' },
      { name: 'Market', description: 'Real-time on-chain data: tokens, trades, transfers, accounts across 60+ networks' },
      { name: 'Payments', description: 'x402 protocol for AI-native pay-per-use micropayments, zero gas on X Layer' },
      { name: 'DApp Connect', description: 'SDK to integrate OKX Wallet into any dApp for ecosystem access' },
    ],
  },
  {
    name: 'Bitget Wallet',
    type: 'CEX',
    launch: 'Feb 27, 2026',
    chains: '9 chains',
    mcp: true,
    integration: ['MCP Server', 'CLI', 'OpenClaw', 'Manus', 'Claude'],
    skills: [
      { name: 'Token Info Queries', description: 'Detailed data about any cryptocurrency token via natural language' },
      { name: 'Candlestick Market Data', description: 'Historical and real-time price charting across supported chains' },
      { name: 'Transaction Statistics', description: 'On-chain transaction metrics and pattern analysis' },
      { name: 'Gainers/Losers Rankings', description: 'Top-performing and underperforming assets identification' },
      { name: 'Liquidity Pool Metrics', description: 'DEX pool analytics across 110+ integrated protocols' },
      { name: 'Contract Security Checks', description: 'Smart contract safety evaluation and verification status' },
      { name: 'Swap Routing Quotes', description: 'Optimal trading paths calculated across 110+ DEX protocols' },
    ],
  },
  {
    name: 'Uniswap',
    type: 'DEX',
    launch: 'Feb 21, 2026',
    chains: '12+ chains',
    mcp: false,
    integration: ['CLI', 'Python', 'TypeScript', 'GitHub'],
    skills: [
      { name: 'v4-security-foundations', description: 'Security patterns for Uniswap v4 hooks, prevents agent-introduced vulnerabilities' },
      { name: 'configurator', description: 'Pool configuration, parameter setup, treasury pool initialization' },
      { name: 'deployer', description: 'Smart contract deployment workflows, agent-driven infrastructure provisioning' },
      { name: 'viem-integration', description: 'Ethereum client integration layer, foundational for all on-chain agent ops' },
      { name: 'swap-integration', description: 'Token swap execution, autonomous trading, real-time treasury rebalancing' },
      { name: 'liquidity-planner', description: 'LP position strategy, agent-managed yield optimization' },
      { name: 'swap-planner', description: 'Multi-step swap routing, cost-efficient cross-token path calculation' },
    ],
  },
  {
    name: 'BANKR',
    type: 'DEX',
    launch: 'Active',
    chains: 'EVM + Solana',
    mcp: true,
    integration: ['OpenClaw', 'Claude', 'X/Farcaster', 'ERC-8004'],
    skills: [
      { name: 'bankr', description: 'Launch tokens, earn from every trade, fund agents. Built-in wallet with hallucination guards + TX verification' },
      { name: 'siwa', description: 'Sign-In With Agent (SIWA) auth for ERC-8004 agents. Message signing via Bankr wallets + ERC-8128 route protection' },
      { name: 'bankr-signals', description: 'Transaction-verified trading signals on Base. Register as provider, publish trades with TX hash proof' },
      { name: 'botchan', description: 'On-chain agent messaging on Base. Explore agents, post to feeds, send DMs, store data via Net Protocol' },
      { name: 'endaoment', description: 'Charitable donations on-chain. Look up 501(c)(3) orgs by EIN, donate crypto, deploy DAF entities' },
      { name: 'ens-primary-name', description: 'ENS name management. Set primary names, update avatars, manage reverse resolution L1/L2' },
      { name: 'erc-8004', description: 'On-chain agent identity registry. ERC-721 NFTs representing agent identities with trust scores' },
      { name: 'onchainkit', description: 'React components for on-chain UX: wallet connectors, swap widgets, identity, NFT displays on Base' },
      { name: 'qrcoin', description: 'QR code auction game. Scan codes to place bids in on-chain auctions with token mechanics' },
      { name: 'veil', description: 'Privacy-preserving transactions. Shielded pools, ZK withdrawals, private transfers' },
      { name: 'yoink', description: 'Social on-chain game. Yoink a token from the current holder, executed via Bankr' },
      { name: 'neynar', description: 'Full Farcaster API: post casts, like, recast, follow, search content, manage Farcaster identities' },
    ],
  },
  {
    name: 'Coinbase',
    type: 'CEX',
    launch: 'Feb 11, 2026',
    chains: 'EVM + Solana',
    mcp: false,
    integration: ['x402 Protocol', 'Agentic Wallets SDK', 'Base L2'],
    skills: [
      { name: 'Agentic Wallets', description: 'Non-custodial wallets in TEEs for autonomous agent fund management' },
      { name: 'x402 Payments', description: 'Machine-to-machine payments, 50M+ transactions processed' },
      { name: 'Spending Controls', description: 'Programmable session caps, per-transaction limits, guardrails' },
      { name: 'Gasless Base Txns', description: 'Zero-gas transactions on Base L2 for cost-efficient agent operations' },
      { name: 'Auto Key Acquisition', description: 'Agents autonomously acquire API keys, compute, data streams, storage' },
    ],
  },
];

const CATEGORIES = [
  { key: 'market_data', label: 'Market Data' },
  { key: 'trading', label: 'Trading' },
  { key: 'onchain', label: 'On-chain' },
  { key: 'risk', label: 'Risk' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'defi', label: 'DeFi' },
  { key: 'social', label: 'Social' },
  { key: 'identity', label: 'Identity' },
];

function hasCapability(platform: Platform, category: string): boolean {
  const skillText = platform.skills.map(s => `${s.name} ${s.description}`).join(' ').toLowerCase();
  switch (category) {
    case 'market_data': return /market data|price|candlestick|ranking|ticker|order book|signal/.test(skillText);
    case 'trading': return /trade|swap|execution|order|oco|otoco|routing|launch token/.test(skillText);
    case 'onchain': return /on-chain|address|token info|smart money|transfer|transaction stat/.test(skillText);
    case 'risk': return /risk|audit|security|contract.*check|mint|freeze|vulnerability|hallucination guard/.test(skillText);
    case 'wallet': return /wallet|balance|payment|x402|spending|fund/.test(skillText);
    case 'defi': return /liquidity|pool|lp|yield|hook|deploy|dex/.test(skillText);
    case 'social': return /farcaster|social|cast|message|feed|dm|x\//.test(skillText);
    case 'identity': return /identity|erc-8004|ens|siwa|sign-in|nft.*identity|trust score/.test(skillText);
    default: return false;
  }
}

const TOTAL_SKILLS = PLATFORMS.reduce((acc, p) => acc + p.skills.length, 0);
const MCP_COUNT = PLATFORMS.filter(p => p.mcp).length;

export function AIAgentSkillsTable() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">
          AI Agent Skills: Platform Comparison Matrix
        </h4>
        <p className="text-xs mt-0.5" style={{ color: CHART_COLORS.textMuted }}>
          {PLATFORMS.length} platforms launched {TOTAL_SKILLS} AI agent Skills in Feb-Mar 2026. Tap any row to see individual skills.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th
                className="text-left py-2 px-2 sticky left-0 z-10"
                style={{ background: 'var(--card)', color: CHART_COLORS.textLight, minWidth: 120 }}
              >
                Platform
              </th>
              <th className="py-2 px-1 text-center" style={{ color: CHART_COLORS.textMuted, minWidth: 45 }}>Skills</th>
              <th className="py-2 px-1 text-center" style={{ color: CHART_COLORS.textMuted, minWidth: 50 }}>Chains</th>
              <th className="py-2 px-1 text-center" style={{ color: CHART_COLORS.textMuted, minWidth: 35 }}>MCP</th>
              {CATEGORIES.map(c => (
                <th key={c.key} className="py-2 px-1 text-center" style={{ color: CHART_COLORS.textMuted, minWidth: 50 }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLATFORMS.map((p) => {
              const isExpanded = expanded === p.name;
              return (
                <Fragment key={p.name}>
                  <tr
                    className="cursor-pointer transition-colors hover:bg-white/5"
                    onClick={() => setExpanded(isExpanded ? null : p.name)}
                    style={{ borderTop: `1px solid ${CHART_COLORS.gridLine}` }}
                  >
                    <td
                      className="py-2.5 px-2 font-semibold sticky left-0 z-10"
                      style={{ background: 'var(--card)', color: CHART_COLORS.textLight }}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="text-[9px] px-1 py-0.5 rounded font-medium shrink-0"
                          style={{
                            background: p.type === 'CEX' ? '#FF6B3520' : '#00FF8820',
                            color: p.type === 'CEX' ? '#FF6B35' : CHART_COLORS.neonGreen,
                          }}
                        >
                          {p.type}
                        </span>
                        {p.name}
                        <span className="text-[10px] ml-0.5" style={{ color: CHART_COLORS.textMuted }}>
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-1 text-center font-semibold" style={{ color: CHART_COLORS.electricBlue }}>
                      {p.skills.length}
                    </td>
                    <td className="py-2.5 px-1 text-center" style={{ color: CHART_COLORS.textLight }}>
                      {p.chains}
                    </td>
                    <td className="py-2.5 px-1 text-center">
                      {p.mcp ? (
                        <span style={{ color: CHART_COLORS.neonGreen }}>Yes</span>
                      ) : (
                        <span style={{ color: CHART_COLORS.textMuted }}>No</span>
                      )}
                    </td>
                    {CATEGORIES.map(c => (
                      <td key={c.key} className="py-2.5 px-1 text-center">
                        {hasCapability(p, c.key) ? (
                          <span
                            className="inline-block w-5 h-5 rounded-full text-[10px] leading-5 font-bold"
                            style={{ background: `${CHART_COLORS.neonGreen}25`, color: CHART_COLORS.neonGreen }}
                          >
                            ✓
                          </span>
                        ) : (
                          <span
                            className="inline-block w-5 h-5 rounded-full text-[10px] leading-5"
                            style={{ background: `${CHART_COLORS.textMuted}15`, color: CHART_COLORS.textMuted }}
                          >
                            —
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td
                        colSpan={4 + CATEGORIES.length}
                        className="px-2 pb-3"
                        style={{ background: CHART_COLORS.darkBg }}
                      >
                        <div className="pt-2">
                          <p className="text-[10px] mb-2" style={{ color: CHART_COLORS.textMuted }}>
                            Launch: {p.launch} · Integration: {p.integration.join(', ')}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                            {p.skills.map((s, i) => (
                              <div
                                key={i}
                                className="rounded px-2 py-1.5"
                                style={{ background: CHART_COLORS.darkSurface }}
                              >
                                <p className="text-[11px] font-semibold" style={{ color: CHART_COLORS.electricBlue }}>
                                  {s.name}
                                </p>
                                <p className="text-[10px] mt-0.5" style={{ color: CHART_COLORS.textMuted }}>
                                  {s.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary stats */}
      <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="text-center">
          <p className="text-lg font-bold" style={{ color: CHART_COLORS.neonGreen }}>{TOTAL_SKILLS}</p>
          <p className="text-[10px]" style={{ color: CHART_COLORS.textMuted }}>Total Skills Launched</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold" style={{ color: CHART_COLORS.electricBlue }}>{PLATFORMS.length}</p>
          <p className="text-[10px]" style={{ color: CHART_COLORS.textMuted }}>Platforms Building</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold" style={{ color: '#FF6B35' }}>{MCP_COUNT}/{PLATFORMS.length}</p>
          <p className="text-[10px]" style={{ color: CHART_COLORS.textMuted }}>MCP Compatible</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold" style={{ color: CHART_COLORS.textLight }}>21 days</p>
          <p className="text-[10px]" style={{ color: CHART_COLORS.textMuted }}>Launch Window</p>
        </div>
      </div>

      <p className="text-right text-[10px] mt-2" style={{ color: CHART_COLORS.textMuted }}>
        Sources: Binance, OKX, Bitget, Uniswap, BANKR, Coinbase official docs (Feb-Mar 2026) · DeFi Mexico
      </p>
    </div>
  );
}
