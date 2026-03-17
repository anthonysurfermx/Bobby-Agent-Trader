import { useGame } from '@/components/games/mercado-lp/contexts/GameContext';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

export const PoolsPanel = () => {
  const { pools } = useGame();

  return (
    <Card className="pixel-card p-4 h-full" data-tutorial="pools">
      <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
        <span>🏪</span> Active Pools
      </h3>

      <ScrollArea className="h-[calc(100%-3rem)]">
        <div className="space-y-3">
          {pools.map(pool => {
            const priceAtoB = pool.reserveB / pool.reserveA;
            const priceBtoA = pool.reserveA / pool.reserveB;

            return (
              <div key={pool.id} className="pixel-card bg-muted p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{pool.tokenA.emoji}</span>
                    <span className="text-xl">{pool.tokenB.emoji}</span>
                  </div>
                  <span className="text-xs font-bold">
                    {pool.tokenA.symbol}/{pool.tokenB.symbol}
                  </span>
                </div>

                <div className="text-xs space-y-1 text-muted-foreground">
                  <div className="flex justify-between">
                    <span>{pool.tokenA.symbol}:</span>
                    <span className="font-mono">{pool.reserveA.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{pool.tokenB.symbol}:</span>
                    <span className="font-mono">{pool.reserveB.toFixed(2)}</span>
                  </div>
                  <div className="pt-1 border-t border-border">
                    <div className="flex justify-between">
                      <span>Price:</span>
                      <span className="font-mono">{priceAtoB.toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
};
