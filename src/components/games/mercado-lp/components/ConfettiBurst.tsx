import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface ConfettiPiece {
  id: number;
  left: number;
  size: number;
  color: string;
  duration: number;
  delay: number;
  rotation: number;
}

interface ConfettiBurstProps {
  trigger: number;
  className?: string;
}

const colors = ['#f97316', '#22c55e', '#a855f7', '#14b8a6', '#facc15', '#ef4444'];

export const ConfettiBurst = ({ trigger, className }: ConfettiBurstProps) => {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    if (!trigger) return;
    const newPieces: ConfettiPiece[] = Array.from({ length: 28 }).map((_, idx) => ({
      id: Date.now() + idx,
      left: Math.random() * 100,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      duration: 1200 + Math.random() * 1200,
      delay: Math.random() * 150,
      rotation: Math.random() * 360,
    }));
    setPieces(newPieces);

    const timer = setTimeout(() => setPieces([]), 2600);
    return () => clearTimeout(timer);
  }, [trigger]);

  return (
    <div className={cn("pointer-events-none fixed inset-0 z-50 overflow-hidden", className)}>
      {pieces.map(piece => (
        <span
          key={piece.id}
          className="confetti-piece absolute top-[-12px] rounded-sm"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size * 1.4,
            backgroundColor: piece.color,
            animationDuration: `${piece.duration}ms`,
            animationDelay: `${piece.delay}ms`,
            transform: `rotate(${piece.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
};
