// One execution surface: Coinbase B20 tokenized stocks through Uniswap on Base.
// Legacy OKX account/market controls are intentionally absent.

import { SwapExecutor } from './SwapExecutor';

export function ExecutePanel() {
  return <div className="space-y-3" data-panel="execute"><SwapExecutor defaultFrom="USDC" defaultTo="NVDAc" /></div>;
}
