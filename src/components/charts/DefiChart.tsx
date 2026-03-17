import { ProtocolTVLChart } from './ProtocolTVLChart';
import { ChainTVLChart } from './ChainTVLChart';
import { ProtocolFeesChart } from './ProtocolFeesChart';
import { KastGrowthChart } from './KastGrowthChart';
import { TetherDominanceChart } from './TetherDominanceChart';
import { USDTGrowthChart } from './USDTGrowthChart';
import { USDTChainsChart } from './USDTChainsChart';
import { MXNStablecoinsChart } from './MXNStablecoinsChart';
import { TetherGrowthThesisChart } from './TetherGrowthThesisChart';
import { LatamExchangeHeatChart } from './LatamExchangeHeatChart';
import { LatamAdoptionChart } from './LatamAdoptionChart';
import { LongshotBiasChart } from './LongshotBiasChart';
import { MakerTakerEdgeChart } from './MakerTakerEdgeChart';
import { KellyPositionChart } from './KellyPositionChart';
import { HyperliquidVolumeChart } from './HyperliquidVolumeChart';
import { HyperliquidGrowthMetrics } from './HyperliquidGrowthMetrics';
import { PerpDexMarketShare } from './PerpDexMarketShare';
import { AIAgentMarketGrowthChart } from './AIAgentMarketGrowthChart';
import { AIAgentInfraRaceChart } from './AIAgentInfraRaceChart';
import { AIAgentTVLShareChart } from './AIAgentTVLShareChart';
import { AIAgentSkillsTable } from './AIAgentSkillsTable';

interface Props {
  type: string;
  identifier: string;
  title?: string;
}

export function DefiChart({ type, identifier, title }: Props) {
  switch (type) {
    case 'protocol_tvl':
      return <ProtocolTVLChart identifier={identifier} title={title} />;
    case 'chain_tvl':
      return <ChainTVLChart identifier={identifier} title={title} />;
    case 'protocol_fees':
      return <ProtocolFeesChart identifier={identifier} title={title} />;
    case 'kast_growth':
      return <KastGrowthChart />;
    case 'tether_dominance':
      return <TetherDominanceChart />;
    case 'usdt_growth':
      return <USDTGrowthChart />;
    case 'usdt_chains':
      return <USDTChainsChart />;
    case 'mxn_stablecoins':
      return <MXNStablecoinsChart />;
    case 'tether_growth_thesis':
      return <TetherGrowthThesisChart />;
    case 'latam_exchange_heat':
      return <LatamExchangeHeatChart />;
    case 'latam_adoption':
      return <LatamAdoptionChart />;
    case 'longshot_bias':
      return <LongshotBiasChart />;
    case 'maker_taker_edge':
      return <MakerTakerEdgeChart />;
    case 'kelly_position':
      return <KellyPositionChart />;
    case 'hl_volume':
      return <HyperliquidVolumeChart />;
    case 'hl_growth_metrics':
      return <HyperliquidGrowthMetrics />;
    case 'perp_dex_market':
      return <PerpDexMarketShare />;
    case 'ai_agent_market_growth':
      return <AIAgentMarketGrowthChart />;
    case 'ai_agent_infra_race':
      return <AIAgentInfraRaceChart />;
    case 'ai_agent_tvl_share':
      return <AIAgentTVLShareChart />;
    case 'ai_agent_skills_table':
      return <AIAgentSkillsTable />;
    default:
      return null;
  }
}
