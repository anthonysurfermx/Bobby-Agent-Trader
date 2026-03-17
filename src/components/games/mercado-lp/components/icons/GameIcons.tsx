import React from 'react';
import { cn } from '@/lib/utils';

interface IconProps {
  className?: string;
  size?: number;
}

// ============================================
// PIXEL ART STYLE ICONS
// Using crisp rectangles for retro game aesthetic
// ============================================

// Level icons - True pixel-art style with blocky shapes
export const SwapperIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Top arrow pointing right */}
    <rect x="3" y="4" width="8" height="2" fill="currentColor"/>
    <rect x="9" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="4" width="2" height="2" fill="currentColor"/>
    {/* Bottom arrow pointing left */}
    <rect x="5" y="10" width="8" height="2" fill="currentColor"/>
    <rect x="5" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="12" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="10" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const ProviderIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Chest/vault body */}
    <rect x="2" y="6" width="12" height="8" fill="currentColor"/>
    <rect x="3" y="7" width="10" height="6" fill="none" stroke="currentColor" strokeWidth="0"/>
    {/* Inner dark area */}
    <rect x="4" y="8" width="8" height="4" className="fill-background"/>
    {/* Handle on top */}
    <rect x="6" y="3" width="4" height="3" fill="currentColor"/>
    <rect x="7" y="4" width="2" height="1" className="fill-background"/>
    {/* Lock/coin in center */}
    <rect x="7" y="9" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const FarmerIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Stem */}
    <rect x="7" y="1" width="2" height="4" fill="currentColor"/>
    {/* Leaves */}
    <rect x="5" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="2" width="2" height="2" fill="currentColor"/>
    {/* Fruit/seed body */}
    <rect x="5" y="5" width="6" height="4" fill="currentColor"/>
    <rect x="4" y="6" width="1" height="2" fill="currentColor"/>
    <rect x="11" y="6" width="1" height="2" fill="currentColor"/>
    <rect x="6" y="9" width="4" height="2" fill="currentColor"/>
    {/* Ground */}
    <rect x="3" y="13" width="10" height="2" fill="currentColor"/>
    <rect x="5" y="11" width="6" height="2" fill="currentColor"/>
  </svg>
);

export const AuctioneerIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Gavel head */}
    <rect x="8" y="2" width="6" height="3" fill="currentColor"/>
    {/* Gavel handle */}
    <rect x="5" y="4" width="5" height="2" fill="currentColor"/>
    <rect x="3" y="6" width="4" height="2" fill="currentColor"/>
    <rect x="2" y="8" width="3" height="2" fill="currentColor"/>
    {/* Sound block */}
    <rect x="1" y="11" width="5" height="2" fill="currentColor"/>
    {/* Base platform */}
    <rect x="2" y="13" width="12" height="2" fill="currentColor"/>
  </svg>
);

// UI icons - Pixel art style
export const TargetIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Outer ring */}
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    {/* Inner ring */}
    <rect x="6" y="5" width="4" height="1" fill="currentColor"/>
    <rect x="6" y="10" width="4" height="1" fill="currentColor"/>
    <rect x="5" y="6" width="1" height="4" fill="currentColor"/>
    <rect x="10" y="6" width="1" height="4" fill="currentColor"/>
    {/* Center dot */}
    <rect x="7" y="7" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const LightbulbIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Light rays */}
    <rect x="7" y="0" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="2" width="2" height="2" fill="currentColor"/>
    {/* Bulb */}
    <rect x="5" y="3" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="5" width="8" height="4" fill="currentColor"/>
    <rect x="5" y="9" width="6" height="2" fill="currentColor"/>
    {/* Base */}
    <rect x="6" y="11" width="4" height="1" fill="currentColor"/>
    <rect x="6" y="12" width="4" height="1" className="fill-muted"/>
    <rect x="6" y="13" width="4" height="1" fill="currentColor"/>
    <rect x="7" y="14" width="2" height="1" fill="currentColor"/>
  </svg>
);

export const GraduationCapIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Cap top */}
    <rect x="7" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="4" width="8" height="2" fill="currentColor"/>
    <rect x="2" y="6" width="12" height="2" fill="currentColor"/>
    {/* Tassel */}
    <rect x="12" y="6" width="2" height="4" fill="currentColor"/>
    <rect x="13" y="10" width="2" height="2" fill="currentColor"/>
    {/* Body below cap */}
    <rect x="3" y="8" width="2" height="4" fill="currentColor"/>
    <rect x="11" y="8" width="2" height="4" fill="currentColor"/>
    <rect x="4" y="12" width="8" height="2" fill="currentColor"/>
  </svg>
);

export const ChartIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Y axis */}
    <rect x="2" y="2" width="2" height="12" fill="currentColor"/>
    {/* X axis */}
    <rect x="2" y="12" width="12" height="2" fill="currentColor"/>
    {/* Line graph going up */}
    <rect x="4" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="2" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const WalletIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Wallet body */}
    <rect x="1" y="4" width="14" height="10" fill="currentColor"/>
    <rect x="2" y="5" width="12" height="8" className="fill-background"/>
    {/* Top flap */}
    <rect x="3" y="2" width="10" height="3" fill="currentColor"/>
    <rect x="4" y="3" width="8" height="1" className="fill-background"/>
    {/* Card slot */}
    <rect x="10" y="8" width="3" height="2" fill="currentColor"/>
  </svg>
);

export const CoinsIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Back coin */}
    <rect x="6" y="2" width="6" height="2" fill="currentColor"/>
    <rect x="5" y="4" width="8" height="4" fill="currentColor"/>
    <rect x="6" y="8" width="6" height="2" fill="currentColor"/>
    {/* Front coin */}
    <rect x="3" y="6" width="6" height="2" fill="currentColor"/>
    <rect x="2" y="8" width="8" height="4" fill="currentColor"/>
    <rect x="3" y="12" width="6" height="2" fill="currentColor"/>
    {/* Coin detail */}
    <rect x="5" y="9" width="2" height="2" className="fill-background"/>
  </svg>
);

export const FireIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Outer flame */}
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="5" y="5" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="7" width="8" height="4" fill="currentColor"/>
    <rect x="5" y="11" width="6" height="2" fill="currentColor"/>
    <rect x="6" y="13" width="4" height="2" fill="currentColor"/>
    {/* Inner flame highlight */}
    <rect x="7" y="8" width="2" height="3" className="fill-amber-300"/>
    <rect x="7" y="11" width="2" height="2" className="fill-amber-400"/>
  </svg>
);

export const TrophyIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Trophy cup */}
    <rect x="4" y="1" width="8" height="2" fill="currentColor"/>
    <rect x="4" y="3" width="8" height="4" fill="currentColor"/>
    <rect x="5" y="7" width="6" height="2" fill="currentColor"/>
    {/* Handles */}
    <rect x="2" y="2" width="2" height="4" fill="currentColor"/>
    <rect x="12" y="2" width="2" height="4" fill="currentColor"/>
    {/* Stem */}
    <rect x="7" y="9" width="2" height="2" fill="currentColor"/>
    {/* Base */}
    <rect x="5" y="11" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="13" width="8" height="2" fill="currentColor"/>
  </svg>
);

export const BadgeIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Star badge */}
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="3" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="5" width="8" height="4" fill="currentColor"/>
    <rect x="5" y="9" width="6" height="2" fill="currentColor"/>
    {/* Ribbon */}
    <rect x="5" y="11" width="2" height="4" fill="currentColor"/>
    <rect x="9" y="11" width="2" height="4" fill="currentColor"/>
  </svg>
);

export const ScaleIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Center pole */}
    <rect x="7" y="2" width="2" height="10" fill="currentColor"/>
    {/* Top bar */}
    <rect x="2" y="3" width="12" height="2" fill="currentColor"/>
    {/* Left pan */}
    <rect x="1" y="5" width="4" height="2" fill="currentColor"/>
    <rect x="2" y="7" width="2" height="4" fill="currentColor"/>
    {/* Right pan */}
    <rect x="11" y="5" width="4" height="2" fill="currentColor"/>
    <rect x="12" y="7" width="2" height="4" fill="currentColor"/>
    {/* Base */}
    <rect x="5" y="12" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="14" width="8" height="1" fill="currentColor"/>
  </svg>
);

export const DropIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Water drop */}
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="5" y="5" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="7" width="8" height="4" fill="currentColor"/>
    <rect x="5" y="11" width="6" height="2" fill="currentColor"/>
    <rect x="6" y="13" width="4" height="2" fill="currentColor"/>
    {/* Highlight */}
    <rect x="5" y="8" width="2" height="2" className="fill-background opacity-50"/>
  </svg>
);

export const SproutIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Left leaf */}
    <rect x="4" y="2" width="3" height="2" fill="currentColor"/>
    <rect x="3" y="4" width="4" height="2" fill="currentColor"/>
    {/* Right leaf */}
    <rect x="9" y="2" width="3" height="2" fill="currentColor"/>
    <rect x="9" y="4" width="4" height="2" fill="currentColor"/>
    {/* Stem */}
    <rect x="7" y="4" width="2" height="8" fill="currentColor"/>
    {/* Ground */}
    <rect x="3" y="12" width="10" height="2" fill="currentColor"/>
    <rect x="5" y="14" width="6" height="1" className="fill-muted"/>
  </svg>
);

export const BasketIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Handle */}
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="3" width="2" height="2" fill="currentColor"/>
    {/* Basket rim */}
    <rect x="2" y="5" width="12" height="2" fill="currentColor"/>
    {/* Basket body */}
    <rect x="3" y="7" width="10" height="6" fill="currentColor"/>
    <rect x="4" y="8" width="8" height="4" className="fill-background"/>
    {/* Weave pattern */}
    <rect x="5" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="9" width="2" height="2" fill="currentColor"/>
    {/* Base */}
    <rect x="4" y="13" width="8" height="2" fill="currentColor"/>
  </svg>
);

export const BoltIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Lightning bolt */}
    <rect x="8" y="1" width="4" height="2" fill="currentColor"/>
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="4" y="5" width="4" height="2" fill="currentColor"/>
    <rect x="6" y="7" width="6" height="2" fill="currentColor"/>
    <rect x="8" y="9" width="4" height="2" fill="currentColor"/>
    <rect x="6" y="11" width="4" height="2" fill="currentColor"/>
    <rect x="4" y="13" width="4" height="2" fill="currentColor"/>
  </svg>
);

export const BoxIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Top face */}
    <rect x="4" y="2" width="8" height="2" fill="currentColor"/>
    <rect x="2" y="4" width="4" height="2" fill="currentColor"/>
    <rect x="10" y="4" width="4" height="2" fill="currentColor"/>
    {/* Front face */}
    <rect x="2" y="6" width="2" height="8" fill="currentColor"/>
    <rect x="12" y="6" width="2" height="8" fill="currentColor"/>
    <rect x="4" y="12" width="8" height="2" fill="currentColor"/>
    {/* Center line */}
    <rect x="7" y="4" width="2" height="10" fill="currentColor"/>
    {/* Inner shading */}
    <rect x="4" y="6" width="3" height="6" className="fill-muted"/>
  </svg>
);

export const XpIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* 5-pointed star */}
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="2" y="5" width="12" height="2" fill="currentColor"/>
    <rect x="4" y="7" width="8" height="2" fill="currentColor"/>
    <rect x="5" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="11" width="3" height="2" fill="currentColor"/>
    <rect x="10" y="11" width="3" height="2" fill="currentColor"/>
    <rect x="2" y="13" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="13" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const CheckCircleIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Circle */}
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    {/* Checkmark */}
    <rect x="4" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="5" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PendingIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Circle */}
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    {/* Clock hands */}
    <rect x="7" y="4" width="2" height="4" fill="currentColor"/>
    <rect x="9" y="7" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const QuestionIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Circle */}
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    {/* Question mark */}
    <rect x="6" y="4" width="4" height="2" fill="currentColor"/>
    <rect x="9" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="11" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const BookIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Book cover */}
    <rect x="2" y="2" width="12" height="12" fill="currentColor"/>
    <rect x="4" y="3" width="9" height="9" className="fill-background"/>
    {/* Spine */}
    <rect x="2" y="2" width="2" height="12" fill="currentColor"/>
    {/* Pages */}
    <rect x="5" y="5" width="6" height="2" fill="currentColor"/>
    <rect x="5" y="8" width="4" height="2" fill="currentColor"/>
    {/* Bookmark */}
    <rect x="11" y="2" width="2" height="4" className="fill-primary"/>
  </svg>
);

export const CelebrationIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Party popper */}
    <rect x="2" y="12" width="3" height="3" fill="currentColor"/>
    <rect x="4" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="4" width="2" height="2" fill="currentColor"/>
    {/* Confetti */}
    <rect x="12" y="2" width="2" height="2" className="fill-amber-400"/>
    <rect x="14" y="6" width="2" height="2" className="fill-pink-400"/>
    <rect x="10" y="8" width="2" height="2" className="fill-emerald-400"/>
    <rect x="12" y="10" width="2" height="2" className="fill-violet-400"/>
    <rect x="6" y="4" width="2" height="2" className="fill-amber-400"/>
  </svg>
);

export const GiftIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Bow */}
    <rect x="4" y="1" width="3" height="2" fill="currentColor"/>
    <rect x="9" y="1" width="3" height="2" fill="currentColor"/>
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    {/* Box lid */}
    <rect x="2" y="5" width="12" height="2" fill="currentColor"/>
    {/* Box body */}
    <rect x="2" y="7" width="12" height="8" fill="currentColor"/>
    <rect x="3" y="8" width="4" height="6" className="fill-background"/>
    <rect x="9" y="8" width="4" height="6" className="fill-background"/>
    {/* Ribbon center */}
    <rect x="7" y="5" width="2" height="10" fill="currentColor"/>
  </svg>
);

// Price impact indicators - Pixel art style
export const PriceGoodIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-emerald-500', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Circle */}
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    {/* Checkmark */}
    <rect x="4" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="5" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PriceNeutralIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-yellow-500', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Circle */}
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    {/* Minus */}
    <rect x="5" y="7" width="6" height="2" fill="currentColor"/>
  </svg>
);

export const PriceWarningIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-orange-500', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Triangle */}
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="5" y="5" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="7" width="8" height="2" fill="currentColor"/>
    <rect x="3" y="9" width="10" height="2" fill="currentColor"/>
    <rect x="2" y="11" width="12" height="2" fill="currentColor"/>
    <rect x="1" y="13" width="14" height="2" fill="currentColor"/>
    {/* Exclamation */}
    <rect x="7" y="5" width="2" height="4" className="fill-background"/>
    <rect x="7" y="10" width="2" height="2" className="fill-background"/>
  </svg>
);

export const PriceDangerIcon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-red-500', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Circle */}
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    {/* X mark */}
    <rect x="5" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="9" width="2" height="2" fill="currentColor"/>
  </svg>
);

// Impact dots - kept as CSS for simplicity
export const ImpactDot = ({ level, className }: { level: 'low' | 'medium' | 'high'; className?: string }) => {
  const colors = {
    low: 'bg-emerald-500',
    medium: 'bg-yellow-500',
    high: 'bg-red-500',
  };

  return (
    <span className={cn('inline-block w-2 h-2', colors[level], className)} />
  );
};

// ============================================
// PIXEL ART REPLACEMENT ICONS FOR LUCIDE
// Drop-in replacements that match the game aesthetic
// ============================================

export const PixelSparkles = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="13" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="13" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelClock = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Circle */}
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    {/* Clock hands */}
    <rect x="7" y="4" width="2" height="4" fill="currentColor"/>
    <rect x="9" y="7" width="3" height="2" fill="currentColor"/>
  </svg>
);

export const PixelArrowRight = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="2" y="7" width="8" height="2" fill="currentColor"/>
    <rect x="9" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="7" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelInfo = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Circle */}
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    {/* i */}
    <rect x="7" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="7" width="2" height="4" fill="currentColor"/>
  </svg>
);

export const PixelFlame = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Outer flame */}
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="5" y="5" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="7" width="8" height="4" fill="currentColor"/>
    <rect x="5" y="11" width="6" height="2" fill="currentColor"/>
    <rect x="6" y="13" width="4" height="2" fill="currentColor"/>
  </svg>
);

export const PixelGift = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Ribbon top bow */}
    <rect x="6" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="3" width="2" height="1" fill="currentColor"/>
    <rect x="9" y="3" width="2" height="1" fill="currentColor"/>
    {/* Ribbon horizontal */}
    <rect x="1" y="4" width="14" height="2" fill="currentColor"/>
    {/* Box body */}
    <rect x="1" y="6" width="14" height="8" fill="currentColor"/>
    {/* Vertical ribbon on box */}
    <rect x="7" y="6" width="2" height="8" className="fill-background"/>
    {/* Inner box detail */}
    <rect x="2" y="7" width="4" height="6" className="fill-background" fillOpacity="0.2"/>
    <rect x="10" y="7" width="4" height="6" className="fill-background" fillOpacity="0.2"/>
  </svg>
);

export const PixelHelpCircle = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Circle */}
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    {/* Question mark */}
    <rect x="6" y="4" width="4" height="2" fill="currentColor"/>
    <rect x="9" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="11" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelBeaker = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Beaker top */}
    <rect x="4" y="1" width="8" height="2" fill="currentColor"/>
    <rect x="5" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="3" width="2" height="2" fill="currentColor"/>
    {/* Beaker body */}
    <rect x="4" y="5" width="8" height="2" fill="currentColor"/>
    <rect x="3" y="7" width="10" height="2" fill="currentColor"/>
    <rect x="2" y="9" width="12" height="4" fill="currentColor"/>
    <rect x="3" y="13" width="10" height="2" fill="currentColor"/>
    {/* Liquid */}
    <rect x="4" y="10" width="8" height="2" className="fill-primary"/>
  </svg>
);

export const PixelAward = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Medal circle */}
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="3" width="8" height="4" fill="currentColor"/>
    <rect x="5" y="7" width="6" height="2" fill="currentColor"/>
    {/* Ribbon */}
    <rect x="4" y="9" width="3" height="6" fill="currentColor"/>
    <rect x="9" y="9" width="3" height="6" fill="currentColor"/>
    {/* Inner medal detail */}
    <rect x="6" y="4" width="4" height="2" className="fill-background"/>
  </svg>
);

export const PixelTrendingUp = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="13" y="3" width="2" height="2" fill="currentColor"/>
    {/* Arrow head */}
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="2" fill="currentColor"/>
  </svg>
);

// ============================================
// PIXEL ART FRUIT ICONS
// Colorful pixel-style fruits for the game tokens
// ============================================

export const PixelMango = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Stem */}
    <rect x="7" y="1" width="2" height="2" fill="#4a7c23"/>
    {/* Leaf */}
    <rect x="9" y="1" width="2" height="1" fill="#6ab04c"/>
    <rect x="10" y="2" width="2" height="1" fill="#6ab04c"/>
    {/* Mango body - orange/yellow gradient */}
    <rect x="5" y="3" width="6" height="2" fill="#f59e0b"/>
    <rect x="4" y="5" width="8" height="4" fill="#f59e0b"/>
    <rect x="5" y="9" width="6" height="2" fill="#f59e0b"/>
    <rect x="6" y="11" width="4" height="2" fill="#f59e0b"/>
    {/* Highlight */}
    <rect x="5" y="5" width="2" height="2" fill="#fbbf24"/>
    {/* Shadow */}
    <rect x="10" y="7" width="2" height="2" fill="#d97706"/>
    <rect x="8" y="11" width="2" height="1" fill="#d97706"/>
  </svg>
);

export const PixelLemon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Stem */}
    <rect x="7" y="1" width="2" height="2" fill="#4a7c23"/>
    {/* Leaf */}
    <rect x="5" y="1" width="2" height="1" fill="#6ab04c"/>
    <rect x="4" y="2" width="2" height="1" fill="#6ab04c"/>
    {/* Lemon body */}
    <rect x="5" y="3" width="6" height="2" fill="#fef08a"/>
    <rect x="4" y="5" width="8" height="4" fill="#fde047"/>
    <rect x="5" y="9" width="6" height="2" fill="#fde047"/>
    <rect x="6" y="11" width="4" height="2" fill="#facc15"/>
    {/* Highlight */}
    <rect x="5" y="5" width="2" height="2" fill="#fef9c3"/>
    {/* Shadow/texture */}
    <rect x="10" y="7" width="2" height="2" fill="#eab308"/>
    <rect x="7" y="9" width="2" height="1" fill="#eab308"/>
  </svg>
);

export const PixelWatermelon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Slice shape - rind (green) */}
    <rect x="2" y="12" width="12" height="2" fill="#22c55e"/>
    <rect x="3" y="10" width="10" height="2" fill="#4ade80"/>
    {/* Red flesh */}
    <rect x="4" y="4" width="8" height="2" fill="#ef4444"/>
    <rect x="3" y="6" width="10" height="2" fill="#ef4444"/>
    <rect x="4" y="8" width="8" height="2" fill="#dc2626"/>
    {/* Seeds */}
    <rect x="5" y="5" width="1" height="2" fill="#1f2937"/>
    <rect x="8" y="6" width="1" height="2" fill="#1f2937"/>
    <rect x="10" y="5" width="1" height="2" fill="#1f2937"/>
    <rect x="6" y="8" width="1" height="1" fill="#1f2937"/>
    <rect x="9" y="8" width="1" height="1" fill="#1f2937"/>
  </svg>
);

export const PixelBanana = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Stem */}
    <rect x="10" y="1" width="2" height="2" fill="#78350f"/>
    {/* Banana body - curved */}
    <rect x="9" y="3" width="3" height="2" fill="#facc15"/>
    <rect x="7" y="5" width="4" height="2" fill="#facc15"/>
    <rect x="5" y="7" width="4" height="2" fill="#fde047"/>
    <rect x="4" y="9" width="3" height="2" fill="#fde047"/>
    <rect x="3" y="11" width="2" height="2" fill="#fbbf24"/>
    {/* Tip */}
    <rect x="2" y="13" width="2" height="1" fill="#92400e"/>
    {/* Highlight */}
    <rect x="8" y="5" width="2" height="1" fill="#fef9c3"/>
    <rect x="6" y="7" width="2" height="1" fill="#fef9c3"/>
  </svg>
);

export const PixelPeso = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Bill outline */}
    <rect x="1" y="3" width="14" height="10" fill="#10b981"/>
    <rect x="2" y="4" width="12" height="8" fill="#059669"/>
    {/* Inner border */}
    <rect x="3" y="5" width="10" height="6" fill="#10b981"/>
    <rect x="4" y="6" width="8" height="4" fill="#047857"/>
    {/* $ symbol */}
    <rect x="7" y="5" width="2" height="1" fill="#fef9c3"/>
    <rect x="6" y="6" width="4" height="1" fill="#fef9c3"/>
    <rect x="6" y="7" width="2" height="1" fill="#fef9c3"/>
    <rect x="6" y="8" width="4" height="1" fill="#fef9c3"/>
    <rect x="7" y="9" width="2" height="1" fill="#fef9c3"/>
    {/* Corner details */}
    <rect x="2" y="4" width="2" height="2" fill="#34d399"/>
    <rect x="12" y="4" width="2" height="2" fill="#34d399"/>
    <rect x="2" y="10" width="2" height="2" fill="#34d399"/>
    <rect x="12" y="10" width="2" height="2" fill="#34d399"/>
  </svg>
);

export const PixelOrange = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Stem */}
    <rect x="7" y="1" width="2" height="2" fill="#4a7c23"/>
    {/* Leaf */}
    <rect x="9" y="2" width="2" height="1" fill="#6ab04c"/>
    {/* Orange body */}
    <rect x="5" y="3" width="6" height="2" fill="#fb923c"/>
    <rect x="4" y="5" width="8" height="4" fill="#f97316"/>
    <rect x="5" y="9" width="6" height="2" fill="#f97316"/>
    <rect x="6" y="11" width="4" height="2" fill="#ea580c"/>
    {/* Highlight */}
    <rect x="5" y="5" width="2" height="2" fill="#fdba74"/>
    {/* Texture lines */}
    <rect x="7" y="6" width="1" height="3" fill="#ea580c"/>
    <rect x="9" y="7" width="1" height="2" fill="#ea580c"/>
  </svg>
);

export const PixelGrape = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Stem */}
    <rect x="7" y="1" width="2" height="2" fill="#4a7c23"/>
    {/* Leaf */}
    <rect x="9" y="1" width="2" height="1" fill="#6ab04c"/>
    {/* Grape cluster */}
    <rect x="6" y="3" width="2" height="2" fill="#a855f7"/>
    <rect x="8" y="3" width="2" height="2" fill="#9333ea"/>
    <rect x="5" y="5" width="2" height="2" fill="#a855f7"/>
    <rect x="7" y="5" width="2" height="2" fill="#9333ea"/>
    <rect x="9" y="5" width="2" height="2" fill="#7c3aed"/>
    <rect x="4" y="7" width="2" height="2" fill="#a855f7"/>
    <rect x="6" y="7" width="2" height="2" fill="#9333ea"/>
    <rect x="8" y="7" width="2" height="2" fill="#7c3aed"/>
    <rect x="10" y="7" width="2" height="2" fill="#6d28d9"/>
    <rect x="5" y="9" width="2" height="2" fill="#9333ea"/>
    <rect x="7" y="9" width="2" height="2" fill="#7c3aed"/>
    <rect x="9" y="9" width="2" height="2" fill="#6d28d9"/>
    <rect x="6" y="11" width="2" height="2" fill="#7c3aed"/>
    <rect x="8" y="11" width="2" height="2" fill="#6d28d9"/>
    {/* Highlights */}
    <rect x="6" y="3" width="1" height="1" fill="#c084fc"/>
    <rect x="5" y="5" width="1" height="1" fill="#c084fc"/>
    <rect x="4" y="7" width="1" height="1" fill="#c084fc"/>
  </svg>
);

export const PixelStrawberry = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Stem/leaves */}
    <rect x="6" y="1" width="4" height="2" fill="#22c55e"/>
    <rect x="5" y="2" width="2" height="2" fill="#4ade80"/>
    <rect x="9" y="2" width="2" height="2" fill="#4ade80"/>
    {/* Strawberry body */}
    <rect x="5" y="4" width="6" height="2" fill="#ef4444"/>
    <rect x="4" y="6" width="8" height="3" fill="#dc2626"/>
    <rect x="5" y="9" width="6" height="2" fill="#b91c1c"/>
    <rect x="6" y="11" width="4" height="2" fill="#991b1b"/>
    <rect x="7" y="13" width="2" height="1" fill="#7f1d1d"/>
    {/* Seeds */}
    <rect x="5" y="5" width="1" height="1" fill="#fef08a"/>
    <rect x="8" y="5" width="1" height="1" fill="#fef08a"/>
    <rect x="6" y="7" width="1" height="1" fill="#fef08a"/>
    <rect x="9" y="7" width="1" height="1" fill="#fef08a"/>
    <rect x="5" y="9" width="1" height="1" fill="#fef08a"/>
    <rect x="8" y="9" width="1" height="1" fill="#fef08a"/>
    <rect x="7" y="11" width="1" height="1" fill="#fef08a"/>
  </svg>
);

export const PixelCherry = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Stems */}
    <rect x="7" y="1" width="2" height="1" fill="#4a7c23"/>
    <rect x="5" y="2" width="2" height="2" fill="#6ab04c"/>
    <rect x="9" y="2" width="2" height="2" fill="#6ab04c"/>
    <rect x="4" y="4" width="2" height="2" fill="#4a7c23"/>
    <rect x="10" y="4" width="2" height="2" fill="#4a7c23"/>
    {/* Left cherry */}
    <rect x="2" y="6" width="4" height="2" fill="#ef4444"/>
    <rect x="2" y="8" width="4" height="3" fill="#dc2626"/>
    <rect x="3" y="11" width="2" height="2" fill="#b91c1c"/>
    <rect x="2" y="6" width="1" height="2" fill="#f87171"/>
    {/* Right cherry */}
    <rect x="10" y="6" width="4" height="2" fill="#ef4444"/>
    <rect x="10" y="8" width="4" height="3" fill="#dc2626"/>
    <rect x="11" y="11" width="2" height="2" fill="#b91c1c"/>
    <rect x="10" y="6" width="1" height="2" fill="#f87171"/>
  </svg>
);

export const PixelPineapple = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Crown/leaves */}
    <rect x="7" y="0" width="2" height="2" fill="#22c55e"/>
    <rect x="5" y="1" width="2" height="2" fill="#4ade80"/>
    <rect x="9" y="1" width="2" height="2" fill="#4ade80"/>
    <rect x="4" y="2" width="2" height="2" fill="#22c55e"/>
    <rect x="10" y="2" width="2" height="2" fill="#22c55e"/>
    {/* Pineapple body */}
    <rect x="5" y="4" width="6" height="2" fill="#fbbf24"/>
    <rect x="4" y="6" width="8" height="3" fill="#f59e0b"/>
    <rect x="5" y="9" width="6" height="3" fill="#d97706"/>
    <rect x="6" y="12" width="4" height="2" fill="#b45309"/>
    {/* Diamond pattern */}
    <rect x="5" y="5" width="1" height="1" fill="#78350f"/>
    <rect x="7" y="5" width="1" height="1" fill="#78350f"/>
    <rect x="9" y="5" width="1" height="1" fill="#78350f"/>
    <rect x="6" y="7" width="1" height="1" fill="#78350f"/>
    <rect x="8" y="7" width="1" height="1" fill="#78350f"/>
    <rect x="5" y="9" width="1" height="1" fill="#78350f"/>
    <rect x="7" y="9" width="1" height="1" fill="#78350f"/>
    <rect x="9" y="9" width="1" height="1" fill="#78350f"/>
  </svg>
);

export const PixelCoconut = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Husk fibers on top */}
    <rect x="6" y="2" width="4" height="2" fill="#78350f"/>
    <rect x="5" y="3" width="2" height="2" fill="#92400e"/>
    <rect x="9" y="3" width="2" height="2" fill="#92400e"/>
    {/* Coconut shell */}
    <rect x="4" y="5" width="8" height="2" fill="#78350f"/>
    <rect x="3" y="7" width="10" height="4" fill="#5c3317"/>
    <rect x="4" y="11" width="8" height="2" fill="#78350f"/>
    <rect x="5" y="13" width="6" height="1" fill="#92400e"/>
    {/* Inner white */}
    <rect x="5" y="7" width="6" height="3" fill="#fef3c7"/>
    <rect x="6" y="10" width="4" height="1" fill="#fef3c7"/>
    {/* "Eyes" */}
    <rect x="5" y="5" width="2" height="2" fill="#1f2937"/>
    <rect x="9" y="5" width="2" height="2" fill="#1f2937"/>
    <rect x="7" y="6" width="2" height="1" fill="#1f2937"/>
  </svg>
);

export const PixelApple = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Stem */}
    <rect x="7" y="1" width="2" height="2" fill="#78350f"/>
    {/* Leaf */}
    <rect x="9" y="1" width="2" height="1" fill="#22c55e"/>
    <rect x="10" y="2" width="2" height="1" fill="#4ade80"/>
    {/* Apple body - red */}
    <rect x="5" y="3" width="6" height="2" fill="#ef4444"/>
    <rect x="4" y="5" width="8" height="4" fill="#dc2626"/>
    <rect x="5" y="9" width="6" height="2" fill="#dc2626"/>
    <rect x="6" y="11" width="4" height="2" fill="#b91c1c"/>
    {/* Indent at top */}
    <rect x="7" y="3" width="2" height="1" fill="#b91c1c"/>
    {/* Highlight */}
    <rect x="5" y="5" width="2" height="2" fill="#f87171"/>
  </svg>
);

export const PixelPeach = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Stem */}
    <rect x="7" y="1" width="2" height="2" fill="#78350f"/>
    {/* Leaf */}
    <rect x="9" y="1" width="2" height="1" fill="#22c55e"/>
    <rect x="10" y="2" width="1" height="1" fill="#4ade80"/>
    {/* Peach body */}
    <rect x="5" y="3" width="6" height="2" fill="#fda4af"/>
    <rect x="4" y="5" width="8" height="4" fill="#fb7185"/>
    <rect x="5" y="9" width="6" height="2" fill="#f43f5e"/>
    <rect x="6" y="11" width="4" height="2" fill="#e11d48"/>
    {/* Crease */}
    <rect x="7" y="5" width="1" height="6" fill="#be123c"/>
    {/* Highlight */}
    <rect x="5" y="5" width="2" height="2" fill="#fecdd3"/>
    {/* Blush */}
    <rect x="9" y="6" width="2" height="2" fill="#fbbf24"/>
  </svg>
);

export const PixelBlueberry = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Crown/top */}
    <rect x="6" y="3" width="4" height="1" fill="#1e3a5f"/>
    {/* Berry body */}
    <rect x="5" y="4" width="6" height="2" fill="#3b82f6"/>
    <rect x="4" y="6" width="8" height="4" fill="#2563eb"/>
    <rect x="5" y="10" width="6" height="2" fill="#1d4ed8"/>
    <rect x="6" y="12" width="4" height="1" fill="#1e40af"/>
    {/* Highlight */}
    <rect x="5" y="5" width="2" height="2" fill="#60a5fa"/>
    {/* Crown details */}
    <rect x="6" y="3" width="1" height="1" fill="#312e81"/>
    <rect x="8" y="3" width="1" height="1" fill="#312e81"/>
    <rect x="9" y="3" width="1" height="1" fill="#312e81"/>
  </svg>
);

export const PixelKiwi = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Outer brown skin */}
    <rect x="5" y="3" width="6" height="2" fill="#78350f"/>
    <rect x="4" y="5" width="8" height="2" fill="#92400e"/>
    {/* Green flesh (cut view) */}
    <rect x="4" y="7" width="8" height="4" fill="#84cc16"/>
    <rect x="5" y="11" width="6" height="2" fill="#65a30d"/>
    <rect x="6" y="13" width="4" height="1" fill="#4d7c0f"/>
    {/* White center */}
    <rect x="7" y="8" width="2" height="2" fill="#fef9c3"/>
    {/* Seeds */}
    <rect x="5" y="8" width="1" height="1" fill="#1f2937"/>
    <rect x="10" y="8" width="1" height="1" fill="#1f2937"/>
    <rect x="6" y="10" width="1" height="1" fill="#1f2937"/>
    <rect x="9" y="10" width="1" height="1" fill="#1f2937"/>
    <rect x="7" y="11" width="1" height="1" fill="#1f2937"/>
  </svg>
);

// ============================================
// PIXEL ART UI ICONS (MORE REPLACEMENTS)
// ============================================

export const PixelStar = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="2" y="5" width="12" height="2" fill="currentColor"/>
    <rect x="4" y="7" width="8" height="2" fill="currentColor"/>
    <rect x="5" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="11" width="3" height="2" fill="currentColor"/>
    <rect x="10" y="11" width="3" height="2" fill="currentColor"/>
    <rect x="2" y="13" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="13" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelCrown = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Crown points */}
    <rect x="2" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="3" width="2" height="2" fill="currentColor"/>
    {/* Crown body */}
    <rect x="2" y="5" width="12" height="2" fill="currentColor"/>
    <rect x="2" y="7" width="12" height="4" fill="currentColor"/>
    {/* Base */}
    <rect x="2" y="11" width="12" height="2" fill="currentColor"/>
    {/* Jewels */}
    <rect x="5" y="8" width="2" height="2" className="fill-background"/>
    <rect x="9" y="8" width="2" height="2" className="fill-background"/>
  </svg>
);

export const PixelMedal = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Ribbon */}
    <rect x="4" y="1" width="3" height="4" fill="currentColor"/>
    <rect x="9" y="1" width="3" height="4" fill="currentColor"/>
    <rect x="5" y="5" width="6" height="2" fill="currentColor"/>
    {/* Medal */}
    <rect x="5" y="7" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="9" width="8" height="4" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    {/* Medal center */}
    <rect x="6" y="10" width="4" height="2" className="fill-background"/>
  </svg>
);

export const PixelLock = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Shackle */}
    <rect x="5" y="2" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="4" width="2" height="4" fill="currentColor"/>
    <rect x="10" y="4" width="2" height="4" fill="currentColor"/>
    {/* Lock body */}
    <rect x="3" y="7" width="10" height="8" fill="currentColor"/>
    {/* Keyhole */}
    <rect x="7" y="9" width="2" height="2" className="fill-background"/>
    <rect x="7" y="11" width="2" height="2" className="fill-background"/>
  </svg>
);

export const PixelUsers = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Person 1 head */}
    <rect x="3" y="2" width="4" height="4" fill="currentColor"/>
    {/* Person 1 body */}
    <rect x="2" y="7" width="6" height="4" fill="currentColor"/>
    <rect x="3" y="11" width="4" height="3" fill="currentColor"/>
    {/* Person 2 head */}
    <rect x="9" y="2" width="4" height="4" fill="currentColor"/>
    {/* Person 2 body */}
    <rect x="8" y="7" width="6" height="4" fill="currentColor"/>
    <rect x="9" y="11" width="4" height="3" fill="currentColor"/>
  </svg>
);

export const PixelTimer = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Top button */}
    <rect x="6" y="1" width="4" height="2" fill="currentColor"/>
    {/* Clock circle */}
    <rect x="5" y="3" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="7" width="2" height="4" fill="currentColor"/>
    <rect x="12" y="7" width="2" height="4" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    {/* Clock hands */}
    <rect x="7" y="6" width="2" height="3" fill="currentColor"/>
    <rect x="9" y="8" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelX = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="2" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="6" width="4" height="4" fill="currentColor"/>
    <rect x="4" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="12" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="12" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelCheck = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="12" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="8" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelChevronRight = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="6" width="2" height="4" fill="currentColor"/>
    <rect x="7" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="12" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelChevronLeft = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="9" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="6" width="2" height="4" fill="currentColor"/>
    <rect x="7" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="12" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelVolume = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Speaker */}
    <rect x="2" y="5" width="3" height="6" fill="currentColor"/>
    <rect x="5" y="4" width="2" height="8" fill="currentColor"/>
    <rect x="7" y="3" width="2" height="10" fill="currentColor"/>
    {/* Sound waves */}
    <rect x="10" y="5" width="1" height="6" fill="currentColor"/>
    <rect x="12" y="4" width="1" height="8" fill="currentColor"/>
    <rect x="14" y="3" width="1" height="10" fill="currentColor"/>
  </svg>
);

export const PixelMute = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Speaker */}
    <rect x="2" y="5" width="3" height="6" fill="currentColor"/>
    <rect x="5" y="4" width="2" height="8" fill="currentColor"/>
    <rect x="7" y="3" width="2" height="10" fill="currentColor"/>
    {/* X for mute */}
    <rect x="10" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="14" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="14" y="9" width="2" height="2" fill="currentColor"/>
  </svg>
);

// ============================================
// MORE PIXEL ART UI ICONS (EMOJI REPLACEMENTS)
// ============================================

export const PixelMoney = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Dollar bill - similar to PixelPeso but for generic money */}
    <rect x="1" y="4" width="14" height="8" fill="#10b981"/>
    <rect x="2" y="5" width="12" height="6" fill="#059669"/>
    <rect x="3" y="6" width="10" height="4" fill="#10b981"/>
    {/* $ symbol in center */}
    <rect x="7" y="5" width="2" height="1" fill="#fef9c3"/>
    <rect x="6" y="6" width="4" height="1" fill="#fef9c3"/>
    <rect x="6" y="7" width="2" height="1" fill="#fef9c3"/>
    <rect x="6" y="8" width="4" height="1" fill="#fef9c3"/>
    <rect x="7" y="9" width="2" height="1" fill="#fef9c3"/>
  </svg>
);

export const PixelMoneyBag = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Bag tie */}
    <rect x="6" y="1" width="4" height="2" fill="#d97706"/>
    <rect x="5" y="3" width="6" height="2" fill="#f59e0b"/>
    {/* Bag body */}
    <rect x="4" y="5" width="8" height="2" fill="#fbbf24"/>
    <rect x="3" y="7" width="10" height="4" fill="#f59e0b"/>
    <rect x="4" y="11" width="8" height="2" fill="#d97706"/>
    <rect x="5" y="13" width="6" height="2" fill="#b45309"/>
    {/* $ symbol */}
    <rect x="7" y="7" width="2" height="1" fill="#fef9c3"/>
    <rect x="6" y="8" width="4" height="1" fill="#fef9c3"/>
    <rect x="7" y="9" width="2" height="1" fill="#fef9c3"/>
    <rect x="6" y="10" width="4" height="1" fill="#fef9c3"/>
  </svg>
);

export const PixelStore = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Roof/awning */}
    <rect x="1" y="2" width="14" height="2" fill="currentColor"/>
    <rect x="2" y="4" width="12" height="2" fill="currentColor"/>
    {/* Awning stripes (darker) */}
    <rect x="3" y="4" width="2" height="2" className="fill-background"/>
    <rect x="7" y="4" width="2" height="2" className="fill-background"/>
    <rect x="11" y="4" width="2" height="2" className="fill-background"/>
    {/* Store body */}
    <rect x="2" y="6" width="12" height="8" fill="currentColor"/>
    {/* Window */}
    <rect x="3" y="7" width="4" height="3" className="fill-background"/>
    {/* Door */}
    <rect x="9" y="8" width="4" height="6" className="fill-background"/>
    {/* Door handle */}
    <rect x="10" y="10" width="1" height="2" fill="currentColor"/>
  </svg>
);

export const PixelGraduationCap = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Top of cap */}
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    {/* Mortarboard top */}
    <rect x="2" y="3" width="12" height="2" fill="currentColor"/>
    <rect x="4" y="5" width="8" height="2" fill="currentColor"/>
    {/* Head band */}
    <rect x="5" y="7" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="9" width="8" height="2" fill="currentColor"/>
    {/* Tassel */}
    <rect x="12" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="13" y="6" width="1" height="4" fill="currentColor"/>
    <rect x="12" y="10" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelBell = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Top nub */}
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    {/* Bell body */}
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="5" y="5" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="7" width="8" height="2" fill="currentColor"/>
    <rect x="3" y="9" width="10" height="2" fill="currentColor"/>
    {/* Bell rim */}
    <rect x="2" y="11" width="12" height="2" fill="currentColor"/>
    {/* Clapper */}
    <rect x="7" y="13" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelParty = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Party popper cone */}
    <rect x="2" y="11" width="3" height="3" fill="#f59e0b"/>
    <rect x="5" y="8" width="3" height="3" fill="#f59e0b"/>
    <rect x="8" y="5" width="3" height="3" fill="#f59e0b"/>
    {/* Confetti pieces */}
    <rect x="11" y="2" width="2" height="2" fill="#ef4444"/>
    <rect x="13" y="4" width="2" height="2" fill="#3b82f6"/>
    <rect x="10" y="6" width="2" height="2" fill="#22c55e"/>
    <rect x="12" y="8" width="2" height="2" fill="#eab308"/>
    <rect x="6" y="3" width="2" height="2" fill="#a855f7"/>
    <rect x="3" y="5" width="2" height="2" fill="#ec4899"/>
    <rect x="1" y="8" width="2" height="2" fill="#06b6d4"/>
  </svg>
);

export const PixelPerson = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Head */}
    <rect x="6" y="1" width="4" height="4" fill="currentColor"/>
    {/* Neck */}
    <rect x="7" y="5" width="2" height="1" fill="currentColor"/>
    {/* Body */}
    <rect x="5" y="6" width="6" height="4" fill="currentColor"/>
    {/* Arms */}
    <rect x="3" y="6" width="2" height="4" fill="currentColor"/>
    <rect x="11" y="6" width="2" height="4" fill="currentColor"/>
    {/* Legs */}
    <rect x="5" y="10" width="2" height="4" fill="currentColor"/>
    <rect x="9" y="10" width="2" height="4" fill="currentColor"/>
  </svg>
);

export const PixelScale = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Top balance point */}
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    {/* Horizontal beam */}
    <rect x="2" y="3" width="12" height="2" fill="currentColor"/>
    {/* Center post */}
    <rect x="7" y="5" width="2" height="6" fill="currentColor"/>
    {/* Left plate strings */}
    <rect x="3" y="5" width="1" height="3" fill="currentColor"/>
    {/* Right plate strings */}
    <rect x="12" y="5" width="1" height="3" fill="currentColor"/>
    {/* Left plate */}
    <rect x="1" y="8" width="5" height="2" fill="currentColor"/>
    {/* Right plate */}
    <rect x="10" y="8" width="5" height="2" fill="currentColor"/>
    {/* Base */}
    <rect x="5" y="11" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="13" width="8" height="2" fill="currentColor"/>
  </svg>
);

export const PixelTrophy = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Cup rim */}
    <rect x="3" y="1" width="10" height="2" fill="#fbbf24"/>
    {/* Cup body */}
    <rect x="4" y="3" width="8" height="4" fill="#f59e0b"/>
    <rect x="5" y="7" width="6" height="2" fill="#d97706"/>
    {/* Handles */}
    <rect x="1" y="3" width="2" height="2" fill="#fbbf24"/>
    <rect x="1" y="5" width="2" height="2" fill="#f59e0b"/>
    <rect x="13" y="3" width="2" height="2" fill="#fbbf24"/>
    <rect x="13" y="5" width="2" height="2" fill="#f59e0b"/>
    {/* Stem */}
    <rect x="7" y="9" width="2" height="2" fill="#b45309"/>
    {/* Base */}
    <rect x="5" y="11" width="6" height="2" fill="#92400e"/>
    <rect x="4" y="13" width="8" height="2" fill="#78350f"/>
    {/* Highlight */}
    <rect x="5" y="4" width="2" height="2" fill="#fef3c7"/>
  </svg>
);

export const PixelCheckCircle = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Green circle */}
    <rect x="5" y="1" width="6" height="2" fill="#22c55e"/>
    <rect x="3" y="3" width="2" height="2" fill="#22c55e"/>
    <rect x="11" y="3" width="2" height="2" fill="#22c55e"/>
    <rect x="1" y="5" width="2" height="6" fill="#22c55e"/>
    <rect x="13" y="5" width="2" height="6" fill="#22c55e"/>
    <rect x="3" y="11" width="2" height="2" fill="#22c55e"/>
    <rect x="11" y="11" width="2" height="2" fill="#22c55e"/>
    <rect x="5" y="13" width="6" height="2" fill="#22c55e"/>
    {/* Fill center */}
    <rect x="3" y="5" width="10" height="6" fill="#22c55e"/>
    <rect x="5" y="3" width="6" height="2" fill="#22c55e"/>
    <rect x="5" y="11" width="6" height="2" fill="#22c55e"/>
    {/* White checkmark */}
    <rect x="11" y="4" width="2" height="2" fill="white"/>
    <rect x="9" y="6" width="2" height="2" fill="white"/>
    <rect x="7" y="8" width="2" height="2" fill="white"/>
    <rect x="5" y="6" width="2" height="2" fill="white"/>
    <rect x="3" y="8" width="2" height="2" fill="white"/>
  </svg>
);

export const PixelXCircle = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Red circle */}
    <rect x="5" y="1" width="6" height="2" fill="#ef4444"/>
    <rect x="3" y="3" width="2" height="2" fill="#ef4444"/>
    <rect x="11" y="3" width="2" height="2" fill="#ef4444"/>
    <rect x="1" y="5" width="2" height="6" fill="#ef4444"/>
    <rect x="13" y="5" width="2" height="6" fill="#ef4444"/>
    <rect x="3" y="11" width="2" height="2" fill="#ef4444"/>
    <rect x="11" y="11" width="2" height="2" fill="#ef4444"/>
    <rect x="5" y="13" width="6" height="2" fill="#ef4444"/>
    {/* Fill center */}
    <rect x="3" y="5" width="10" height="6" fill="#ef4444"/>
    <rect x="5" y="3" width="6" height="2" fill="#ef4444"/>
    <rect x="5" y="11" width="6" height="2" fill="#ef4444"/>
    {/* White X */}
    <rect x="4" y="4" width="2" height="2" fill="white"/>
    <rect x="10" y="4" width="2" height="2" fill="white"/>
    <rect x="6" y="6" width="4" height="4" fill="white"/>
    <rect x="4" y="10" width="2" height="2" fill="white"/>
    <rect x="10" y="10" width="2" height="2" fill="white"/>
  </svg>
);

export const PixelCoins = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn(className)} style={{ imageRendering: 'pixelated' }}>
    {/* Back coin */}
    <rect x="8" y="2" width="6" height="2" fill="#d97706"/>
    <rect x="7" y="4" width="8" height="4" fill="#f59e0b"/>
    <rect x="8" y="8" width="6" height="2" fill="#b45309"/>
    {/* Front coin */}
    <rect x="2" y="6" width="6" height="2" fill="#fbbf24"/>
    <rect x="1" y="8" width="8" height="4" fill="#f59e0b"/>
    <rect x="2" y="12" width="6" height="2" fill="#d97706"/>
    {/* $ on front coin */}
    <rect x="4" y="9" width="2" height="1" fill="#fef9c3"/>
    <rect x="4" y="10" width="2" height="1" fill="#fef9c3"/>
  </svg>
);

export const PixelLightning = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="8" y="1" width="4" height="2" fill="currentColor"/>
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="4" y="5" width="6" height="2" fill="currentColor"/>
    <rect x="6" y="7" width="6" height="2" fill="currentColor"/>
    <rect x="8" y="9" width="4" height="2" fill="currentColor"/>
    <rect x="6" y="11" width="4" height="2" fill="currentColor"/>
    <rect x="4" y="13" width="4" height="2" fill="currentColor"/>
  </svg>
);

export const PixelCalendar = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Calendar top handle */}
    <rect x="3" y="1" width="2" height="3" fill="currentColor"/>
    <rect x="11" y="1" width="2" height="3" fill="currentColor"/>
    {/* Calendar body */}
    <rect x="1" y="3" width="14" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="14" height="10" fill="currentColor"/>
    {/* Calendar grid lines */}
    <rect x="2" y="6" width="12" height="8" className="fill-background"/>
    {/* Date dots */}
    <rect x="3" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="11" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelMap = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Map folded edges */}
    <rect x="2" y="2" width="12" height="12" fill="currentColor"/>
    <rect x="3" y="3" width="10" height="10" className="fill-background"/>
    {/* Path/route on map */}
    <rect x="4" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="9" width="2" height="2" fill="currentColor"/>
    {/* Location marker */}
    <rect x="10" y="4" width="2" height="2" className="fill-red-500"/>
  </svg>
);

export const PixelBook = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Book cover */}
    <rect x="2" y="2" width="12" height="12" fill="currentColor"/>
    <rect x="3" y="3" width="10" height="10" className="fill-background"/>
    {/* Spine */}
    <rect x="4" y="2" width="2" height="12" fill="currentColor"/>
    {/* Page lines */}
    <rect x="7" y="5" width="4" height="1" fill="currentColor" opacity="0.5"/>
    <rect x="7" y="7" width="4" height="1" fill="currentColor" opacity="0.5"/>
    <rect x="7" y="9" width="3" height="1" fill="currentColor" opacity="0.5"/>
  </svg>
);

// ============================================
// HELPER: Token Icon Component
// Maps token IDs to their pixel art icons
// ============================================

interface TokenIconProps {
  tokenId: string;
  size?: number;
  className?: string;
}

export const TokenIcon = ({ tokenId, size = 24, className }: TokenIconProps) => {
  const iconMap: Record<string, React.FC<IconProps>> = {
    peso: PixelPeso,
    mango: PixelMango,
    limon: PixelLemon,
    sandia: PixelWatermelon,
    platano: PixelBanana,
    naranja: PixelOrange,
    orange: PixelOrange,
    uva: PixelGrape,
    grape: PixelGrape,
    fresa: PixelStrawberry,
    strawberry: PixelStrawberry,
    cereza: PixelCherry,
    cherry: PixelCherry,
    pina: PixelPineapple,
    pineapple: PixelPineapple,
    coco: PixelCoconut,
    coconut: PixelCoconut,
    manzana: PixelApple,
    apple: PixelApple,
    durazno: PixelPeach,
    peach: PixelPeach,
    mora: PixelBlueberry,
    blueberry: PixelBlueberry,
    kiwi: PixelKiwi,
  };

  const IconComponent = iconMap[tokenId.toLowerCase()];

  if (IconComponent) {
    return <IconComponent size={size} className={className} />;
  }

  // Fallback to a generic fruit
  return <PixelMango size={size} className={className} />;
};
