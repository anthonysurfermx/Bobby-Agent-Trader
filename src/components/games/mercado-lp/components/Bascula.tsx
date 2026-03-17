import { Token } from '@/components/games/mercado-lp/types/game';
import { cn } from '@/lib/utils';
import { TokenIcon } from './icons/GameIcons';

interface BasculaProps {
  tokenA: Token;
  tokenB: Token;
  reserveA: number;
  reserveB: number;
  className?: string;
  previewReserveA?: number;
  previewReserveB?: number;
}

export const Bascula = ({ tokenA, tokenB, reserveA, reserveB, className, previewReserveA, previewReserveB }: BasculaProps) => {
  const displayReserveA = previewReserveA ?? reserveA;
  const displayReserveB = previewReserveB ?? reserveB;
  const isPreview = previewReserveA !== undefined && previewReserveB !== undefined;

  const safeReserveA = Math.max(displayReserveA, 0.0001);
  const ratio = displayReserveB / safeReserveA;

  // Calcular el balance visual (0 = equilibrado, positivo = B pesa más, negativo = A pesa más)
  const balance = Math.max(-1, Math.min(1, (displayReserveB - displayReserveA) / Math.max(displayReserveA, displayReserveB, 1)));

  return (
    <div
      className={cn(
        "relative w-full h-28 sm:h-44 flex flex-col items-center justify-center",
        "rounded-lg sm:rounded-xl bg-slate-800/90",
        "border border-white/10 shadow-md p-2 sm:p-3",
        className
      )}
    >
      {/* Halo + grid - oculto en mobile para mejor rendimiento */}
      <div className="hidden sm:block absolute inset-0 opacity-50 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.12),transparent_50%)] pointer-events-none" />
      <div className="hidden sm:block absolute inset-0 opacity-10 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:24px_24px]" />

      {/* Contenedor de los platos */}
      <div className="relative z-10 flex items-end justify-center gap-4 sm:gap-8 w-full">
        {/* Plato izquierdo (Token A) */}
        <div
          className="flex flex-col items-center transition-transform duration-500"
          style={{ transform: `translateY(${balance < 0 ? Math.abs(balance) * 6 : 0}px)` }}
        >
          <div className="w-11 h-11 sm:w-18 sm:h-18 bg-white/15 backdrop-blur rounded-lg sm:rounded-xl border border-white/20 shadow-lg flex flex-col items-center justify-center">
            <TokenIcon tokenId={tokenA.id} size={18} className="drop-shadow" />
            <span className="text-[10px] sm:text-xs font-bold mt-0.5 text-white">{displayReserveA.toFixed(0)}</span>
          </div>
          <div className="w-0.5 h-4 sm:h-6 bg-gradient-to-b from-white/40 to-white/10 mt-0.5" />
          <p className="text-[10px] sm:text-xs font-semibold text-emerald-300 mt-0.5">{tokenA.symbol}</p>
        </div>

        {/* Centro - Fulcro y barra */}
        <div className="flex flex-col items-center -mb-0.5 sm:-mb-2">
          <div className="w-13 sm:w-24 h-0.5 sm:h-1 bg-gradient-to-r from-white/20 via-white/40 to-white/20 rounded-full" />
          <div className="w-2 sm:w-3 h-4 sm:h-8 bg-gradient-to-b from-white/50 to-white/20 rounded-b-full" />
          <div className="w-4 h-4 sm:w-5 sm:h-5 bg-primary border-2 border-white/40 rounded-full shadow-lg -mt-0.5 sm:-mt-1" />
        </div>

        {/* Plato derecho (Token B) */}
        <div
          className="flex flex-col items-center transition-transform duration-500"
          style={{ transform: `translateY(${balance > 0 ? Math.abs(balance) * 6 : 0}px)` }}
        >
          <div className="w-11 h-11 sm:w-18 sm:h-18 bg-white/15 backdrop-blur rounded-lg sm:rounded-xl border border-white/20 shadow-lg flex flex-col items-center justify-center">
            <TokenIcon tokenId={tokenB.id} size={18} className="drop-shadow" />
            <span className="text-[10px] sm:text-xs font-bold mt-0.5 text-white">{displayReserveB.toFixed(0)}</span>
          </div>
          <div className="w-0.5 h-4 sm:h-6 bg-gradient-to-b from-white/40 to-white/10 mt-0.5" />
          <p className="text-[10px] sm:text-xs font-semibold text-cyan-300 mt-0.5">{tokenB.symbol}</p>
        </div>
      </div>

      {/* Precio */}
      <div className="relative z-10 mt-1 sm:mt-3">
        <div className={cn(
          "pixel-card px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs text-white text-center shadow-md border",
          isPreview ? "bg-emerald-500/20 border-emerald-300/50" : "bg-white/10 border-white/20"
        )}>
          <p className="font-semibold tracking-wide">1 {tokenA.symbol} = {ratio.toFixed(4)} {tokenB.symbol}</p>
          {isPreview && <p className="text-[9px] sm:text-[10px] text-emerald-100 mt-0.5">Movimiento estimado</p>}
        </div>
      </div>
    </div>
  );
};
