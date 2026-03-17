import { AuctionBlock } from '@/components/games/mercado-lp/types/game';
import { cn } from '@/lib/utils';
import { Check, Clock, Hammer } from 'lucide-react';

interface AuctionBlockTimelineProps {
  blocks: AuctionBlock[];
  currentBlock: number;
  tokenEmoji: string;
  onBlockClick?: (blockNumber: number) => void;
  selectedBlock?: number;
}

export const AuctionBlockTimeline = ({
  blocks,
  currentBlock,
  tokenEmoji,
  onBlockClick,
  selectedBlock,
}: AuctionBlockTimelineProps) => {
  const getBlockStatus = (block: AuctionBlock) => {
    if (block.executed) return 'executed';
    if (block.blockNumber === currentBlock) return 'active';
    if (block.blockNumber < currentBlock) return 'missed';
    return 'upcoming';
  };

  const getBlockStyle = (status: string, isSelected: boolean) => {
    const baseStyle = 'pixel-card transition-all duration-300 cursor-pointer hover:scale-105';

    if (isSelected) {
      return `${baseStyle} ring-2 ring-primary ring-offset-2`;
    }

    switch (status) {
      case 'executed':
        return `${baseStyle} bg-green-100 border-green-400`;
      case 'active':
        return `${baseStyle} bg-yellow-100 border-yellow-400 animate-pulse`;
      case 'missed':
        return `${baseStyle} bg-muted border-gray-300 opacity-50`;
      case 'upcoming':
        return `${baseStyle} bg-card border-border hover:bg-accent/20`;
      default:
        return baseStyle;
    }
  };

  const getBlockIcon = (status: string) => {
    switch (status) {
      case 'executed':
        return <Check className="w-4 h-4 text-green-600" />;
      case 'active':
        return <Hammer className="w-4 h-4 text-yellow-600 animate-bounce" />;
      case 'upcoming':
        return <Clock className="w-4 h-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
          📅 Timeline de Bloques
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Bloque actual: {currentBlock} de {blocks.length}
        </p>
      </div>

      {/* Timeline horizontal - scrolleable en mobile */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max px-2">
          {blocks.map((block) => {
            const status = getBlockStatus(block);
            const isSelected = selectedBlock === block.blockNumber;
            const totalBids = block.bids.length;
            const totalBidAmount = block.bids.reduce((sum, bid) => sum + bid.totalSpend, 0);

            return (
              <div
                key={block.id}
                onClick={() => onBlockClick?.(block.blockNumber)}
                className={cn(
                  'flex-shrink-0 w-32 p-3 space-y-2',
                  getBlockStyle(status, isSelected)
                )}
              >
                {/* Header del bloque */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Bloque {block.blockNumber}</span>
                  {getBlockIcon(status)}
                </div>

                {/* Tokens disponibles */}
                <div className="text-center space-y-1">
                  <div className="text-2xl">{tokenEmoji}</div>
                  <div className="text-lg font-bold">{block.tokensAvailable}</div>
                  <div className="text-[10px] text-muted-foreground">tokens</div>
                </div>

                {/* Precio */}
                <div className="pixel-card bg-card/60 p-2 text-center">
                  <div className="text-[10px] text-muted-foreground">Precio actual</div>
                  <div className="text-sm font-bold">
                    ${block.currentPrice.toFixed(2)}
                  </div>
                </div>

                {/* Info de ofertas */}
                {totalBids > 0 && (
                  <div className="text-[10px] text-center space-y-0.5">
                    <div className="text-muted-foreground">
                      {totalBids} {totalBids === 1 ? 'oferta' : 'ofertas'}
                    </div>
                    <div className="font-semibold">
                      ${totalBidAmount.toFixed(0)} total
                    </div>
                  </div>
                )}

                {/* Badge de estado */}
                {status === 'executed' && (
                  <div className="text-[9px] text-center text-green-600 font-bold">
                    ✓ EJECUTADO
                  </div>
                )}
                {status === 'active' && (
                  <div className="text-[9px] text-center text-yellow-600 font-bold">
                    ⚡ ACTIVO
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 justify-center text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-yellow-100 border border-yellow-400" />
          <span className="text-muted-foreground">Activo</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-100 border border-green-400" />
          <span className="text-muted-foreground">Ejecutado</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-card border border-border" />
          <span className="text-muted-foreground">Próximo</span>
        </div>
      </div>
    </div>
  );
};
