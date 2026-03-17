// ============================================================
// OKXSwapWidget — Embeddable OKX DEX swap + bridge widget
// Real swaps via OKX DEX Aggregator (500+ liquidity sources)
// Supports single-chain swap + cross-chain bridge
// ============================================================

import { useEffect, useRef, useState } from 'react';

// Token addresses for pre-configuration
const TOKEN_CONFIGS: Record<string, { chainId: number; address: string }> = {
  ETH: { chainId: 1, address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
  WBTC: { chainId: 1, address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' },
  USDC: { chainId: 1, address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  USDT: { chainId: 1, address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
  OKB: { chainId: 196, address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
};

interface Props {
  defaultToToken?: string; // e.g. 'ETH', 'WBTC'
  mode?: 'swap' | 'bridge';
  className?: string;
}

export function OKXSwapWidget({ defaultToToken, mode = 'swap', className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let widget: { destroy?: () => void } | null = null;

    async function init() {
      try {
        // Dynamic import to avoid SSR issues
        const { createOkxSwapWidget } = await import('@okxweb3/dex-widget');

        if (!containerRef.current) return;

        const params: Record<string, unknown> = {
          width: '100%',
          theme: 'dark',
          lang: 'en_us',
          tradeType: mode,
          chainIds: [1, 196, 137, 56, 42161], // ETH, X Layer, Polygon, BSC, Arbitrum
          feeConfig: {},
          tokenPair: undefined as unknown,
          bridgeTokenPair: undefined as unknown,
        };

        // Pre-select token pair if specified
        if (defaultToToken && TOKEN_CONFIGS[defaultToToken]) {
          const toConfig = TOKEN_CONFIGS[defaultToToken];
          const fromConfig = TOKEN_CONFIGS.USDC;

          if (mode === 'swap') {
            params.tokenPair = {
              fromChain: fromConfig.chainId,
              toChain: toConfig.chainId,
              fromToken: fromConfig.address,
              toToken: toConfig.address,
            };
          } else {
            params.bridgeTokenPair = {
              fromChain: 1, // Always bridge from Ethereum
              toChain: toConfig.chainId,
              fromToken: fromConfig.address,
              toToken: toConfig.address,
            };
          }
        }

        widget = createOkxSwapWidget(containerRef.current, params);
        setLoaded(true);
      } catch (err) {
        console.error('[OKX Widget] Failed to load:', err);
        setError('Widget failed to load. Using manual quote instead.');
      }
    }

    init();

    return () => {
      if (widget?.destroy) widget.destroy();
    };
  }, [defaultToToken, mode]);

  return (
    <div className={`relative ${className}`}>
      {/* Loading state */}
      {!loaded && !error && (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-[11px] text-neutral-500">
            <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
            Loading OKX DEX Widget...
          </div>
        </div>
      )}

      {/* Error fallback */}
      {error && (
        <div className="text-center py-4">
          <div className="text-[10px] text-neutral-500 mb-2">{error}</div>
        </div>
      )}

      {/* Widget container */}
      <div
        ref={containerRef}
        className="okx-widget-container rounded-xl overflow-hidden"
        style={{ minHeight: loaded ? 'auto' : 0 }}
      />
    </div>
  );
}
