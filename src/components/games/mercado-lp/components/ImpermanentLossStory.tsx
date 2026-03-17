import { LPPosition, Pool, Token } from '@/components/games/mercado-lp/types/game';
import { Card } from '@/components/ui/card';

interface ImpermanentLossStoryProps {
  position: LPPosition;
  pool: Pool;
  tokens: Token[];
}

export const ImpermanentLossStory = ({ position, pool, tokens }: ImpermanentLossStoryProps) => {
  const currentValueA = (pool.reserveA * position.sharePercent) / 100;
  const currentValueB = (pool.reserveB * position.sharePercent) / 100;
  
  const initialPrice = position.initialReserveB / position.initialReserveA;
  const currentPrice = pool.reserveB / pool.reserveA;
  const priceChange = ((currentPrice - initialPrice) / initialPrice) * 100;
  
  const holdValue = position.initialReserveA + position.initialReserveB * (currentPrice / initialPrice);
  const lpValue = currentValueA + currentValueB;
  const feesValue = position.feesEarned.tokenA + position.feesEarned.tokenB;
  const totalValue = lpValue + feesValue;
  
  const il = holdValue - lpValue;
  const netProfit = totalValue - holdValue;

  const getEmoji = () => {
    if (netProfit > 0) return '😊';
    if (netProfit > -5) return '😐';
    return '😕';
  };

  return (
    <Card className="pixel-card p-4 bg-muted">
      <h3 className="font-bold mb-3 flex items-center gap-2 text-sm">
        <span>📖</span> Historia de tu Puesto
      </h3>
      
      <div className="space-y-3 text-xs">
        <div>
          <p className="text-muted-foreground mb-1">Cuando abriste:</p>
          <div className="flex items-center gap-2">
            <span className="text-lg">{pool.tokenA.emoji}</span>
            <span>× {position.initialReserveA.toFixed(2)}</span>
            <span className="text-muted-foreground">+</span>
            <span className="text-lg">{pool.tokenB.emoji}</span>
            <span>× {position.initialReserveB.toFixed(2)}</span>
          </div>
        </div>

        <div>
          <p className="text-muted-foreground mb-1">Ahora tienes:</p>
          <div className="flex items-center gap-2">
            <span className="text-lg">{pool.tokenA.emoji}</span>
            <span>× {currentValueA.toFixed(2)}</span>
            <span className="text-muted-foreground">+</span>
            <span className="text-lg">{pool.tokenB.emoji}</span>
            <span>× {currentValueB.toFixed(2)}</span>
          </div>
        </div>

        <div className="pixel-card bg-card p-2">
          <p className="text-muted-foreground italic">
            "{priceChange > 0 
              ? `${pool.tokenA.symbol} subió ${Math.abs(priceChange).toFixed(1)}%. Los clientes compraron ${pool.tokenA.symbol} y te dejaron más ${pool.tokenB.symbol}.`
              : `${pool.tokenB.symbol} subió ${Math.abs(priceChange).toFixed(1)}%. Los clientes compraron ${pool.tokenB.symbol} y te dejaron más ${pool.tokenA.symbol}.`
            }"
          </p>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Si hubieras guardado:</span>
            <span className="font-bold">${holdValue.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tu puesto vale:</span>
            <span className="font-bold">${lpValue.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ganaste en fees:</span>
            <span className="font-bold text-secondary">+${feesValue.toFixed(2)}</span>
          </div>
          <div className="border-t border-border pt-1 mt-2 flex justify-between items-center">
            <span className="font-bold">Balance real:</span>
            <span className={`font-bold text-lg ${netProfit >= 0 ? 'text-secondary' : 'text-destructive'}`}>
              {netProfit >= 0 ? '+' : ''}{netProfit.toFixed(2)} {getEmoji()}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
