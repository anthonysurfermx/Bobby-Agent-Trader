// src/components/ui/pixel-icons.tsx
// Global Pixel Art Icons - Unified design system for DeFi México
// Re-exports from game icons + additional icons for site-wide use

import { cn } from '@/lib/utils';

interface IconProps {
  className?: string;
  size?: number;
}

// ============================================
// NAVIGATION & UI ICONS
// ============================================

export const PixelMenu = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="2" y="3" width="12" height="2" fill="currentColor"/>
    <rect x="2" y="7" width="12" height="2" fill="currentColor"/>
    <rect x="2" y="11" width="12" height="2" fill="currentColor"/>
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

export const PixelSearch = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Magnifying glass circle */}
    <rect x="4" y="2" width="4" height="2" fill="currentColor"/>
    <rect x="2" y="4" width="2" height="4" fill="currentColor"/>
    <rect x="8" y="4" width="2" height="4" fill="currentColor"/>
    <rect x="4" y="8" width="4" height="2" fill="currentColor"/>
    {/* Handle */}
    <rect x="8" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="13" width="2" height="2" fill="currentColor"/>
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

export const PixelChevronDown = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="2" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="9" width="4" height="2" fill="currentColor"/>
    <rect x="10" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="5" width="2" height="2" fill="currentColor"/>
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

export const PixelArrowLeft = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="6" y="7" width="8" height="2" fill="currentColor"/>
    <rect x="5" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="7" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelExternalLink = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Box */}
    <rect x="2" y="4" width="2" height="10" fill="currentColor"/>
    <rect x="2" y="12" width="10" height="2" fill="currentColor"/>
    <rect x="10" y="8" width="2" height="6" fill="currentColor"/>
    <rect x="2" y="4" width="4" height="2" fill="currentColor"/>
    {/* Arrow */}
    <rect x="8" y="2" width="6" height="2" fill="currentColor"/>
    <rect x="12" y="4" width="2" height="4" fill="currentColor"/>
    <rect x="10" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="8" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelFilter = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="2" width="14" height="2" fill="currentColor"/>
    <rect x="3" y="4" width="10" height="2" fill="currentColor"/>
    <rect x="5" y="6" width="6" height="2" fill="currentColor"/>
    <rect x="7" y="8" width="2" height="6" fill="currentColor"/>
  </svg>
);

// ============================================
// USER & SOCIAL ICONS
// ============================================

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

export const PixelUser = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Head */}
    <rect x="5" y="1" width="6" height="6" fill="currentColor"/>
    {/* Body */}
    <rect x="3" y="8" width="10" height="6" fill="currentColor"/>
    <rect x="4" y="14" width="8" height="1" fill="currentColor"/>
  </svg>
);

export const PixelGlobe = ({ className, size = 24 }: IconProps) => (
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
    {/* Horizontal line */}
    <rect x="1" y="7" width="14" height="2" fill="currentColor"/>
    {/* Vertical line */}
    <rect x="7" y="1" width="2" height="14" fill="currentColor"/>
  </svg>
);

export const PixelGithub = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Head shape */}
    <rect x="4" y="1" width="8" height="2" fill="currentColor"/>
    <rect x="2" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="10" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="14" height="6" fill="currentColor"/>
    <rect x="2" y="11" width="4" height="2" fill="currentColor"/>
    <rect x="10" y="11" width="4" height="2" fill="currentColor"/>
    {/* Eyes */}
    <rect x="4" y="6" width="2" height="2" className="fill-background"/>
    <rect x="10" y="6" width="2" height="2" className="fill-background"/>
    {/* Tentacles */}
    <rect x="2" y="13" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="13" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelTwitter = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Bird shape */}
    <rect x="10" y="2" width="4" height="2" fill="currentColor"/>
    <rect x="8" y="4" width="4" height="2" fill="currentColor"/>
    <rect x="2" y="4" width="8" height="2" fill="currentColor"/>
    <rect x="4" y="6" width="8" height="2" fill="currentColor"/>
    <rect x="6" y="8" width="6" height="2" fill="currentColor"/>
    <rect x="8" y="10" width="4" height="2" fill="currentColor"/>
    <rect x="10" y="12" width="4" height="2" fill="currentColor"/>
  </svg>
);

export const PixelDiscord = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Controller shape */}
    <rect x="3" y="3" width="10" height="2" fill="currentColor"/>
    <rect x="2" y="5" width="12" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="4" height="2" fill="currentColor"/>
    <rect x="9" y="11" width="4" height="2" fill="currentColor"/>
    {/* Eyes */}
    <rect x="4" y="6" width="2" height="3" className="fill-background"/>
    <rect x="10" y="6" width="2" height="3" className="fill-background"/>
  </svg>
);

export const PixelTelegram = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Paper plane */}
    <rect x="1" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="6" width="2" height="4" fill="currentColor"/>
    <rect x="5" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="7" y="4" width="2" height="8" fill="currentColor"/>
    <rect x="9" y="3" width="2" height="6" fill="currentColor"/>
    <rect x="11" y="2" width="2" height="4" fill="currentColor"/>
    <rect x="13" y="1" width="2" height="2" fill="currentColor"/>
    {/* Fold line */}
    <rect x="7" y="9" width="4" height="2" fill="currentColor"/>
    <rect x="9" y="11" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelLinkedin = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Box */}
    <rect x="1" y="1" width="14" height="14" fill="currentColor"/>
    {/* in letters */}
    <rect x="3" y="3" width="2" height="2" className="fill-background"/>
    <rect x="3" y="6" width="2" height="7" className="fill-background"/>
    <rect x="6" y="6" width="2" height="7" className="fill-background"/>
    <rect x="8" y="6" width="2" height="2" className="fill-background"/>
    <rect x="10" y="6" width="2" height="7" className="fill-background"/>
    <rect x="8" y="8" width="2" height="5" className="fill-background"/>
  </svg>
);

// ============================================
// STATUS & INDICATOR ICONS
// ============================================

export const PixelShield = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="2" y="2" width="12" height="2" fill="currentColor"/>
    <rect x="2" y="4" width="12" height="4" fill="currentColor"/>
    <rect x="3" y="8" width="10" height="2" fill="currentColor"/>
    <rect x="4" y="10" width="8" height="2" fill="currentColor"/>
    <rect x="5" y="12" width="6" height="2" fill="currentColor"/>
    <rect x="6" y="14" width="4" height="1" fill="currentColor"/>
  </svg>
);

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

export const PixelCheckCircle = ({ className, size = 24 }: IconProps) => (
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

export const PixelLoader = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current animate-spin', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="1" width="2" height="3" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor" opacity="0.75"/>
    <rect x="12" y="7" width="3" height="2" fill="currentColor" opacity="0.5"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor" opacity="0.25"/>
  </svg>
);

// ============================================
// CONTENT & FEATURE ICONS
// ============================================

export const PixelCalendar = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Top hooks */}
    <rect x="4" y="1" width="2" height="3" fill="currentColor"/>
    <rect x="10" y="1" width="2" height="3" fill="currentColor"/>
    {/* Calendar body */}
    <rect x="2" y="3" width="12" height="2" fill="currentColor"/>
    <rect x="2" y="5" width="12" height="9" fill="currentColor"/>
    {/* Grid lines */}
    <rect x="3" y="7" width="10" height="6" className="fill-background"/>
    <rect x="5" y="7" width="1" height="6" fill="currentColor"/>
    <rect x="8" y="7" width="1" height="6" fill="currentColor"/>
    <rect x="11" y="7" width="1" height="6" fill="currentColor"/>
    <rect x="3" y="9" width="10" height="1" fill="currentColor"/>
    <rect x="3" y="11" width="10" height="1" fill="currentColor"/>
  </svg>
);

export const PixelMapPin = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="10" height="4" fill="currentColor"/>
    <rect x="5" y="7" width="6" height="2" fill="currentColor"/>
    <rect x="6" y="9" width="4" height="2" fill="currentColor"/>
    <rect x="7" y="11" width="2" height="4" fill="currentColor"/>
    {/* Inner circle */}
    <rect x="6" y="4" width="4" height="2" className="fill-background"/>
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

export const PixelTrophy = ({ className, size = 24 }: IconProps) => (
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

export const PixelWallet = ({ className, size = 24 }: IconProps) => (
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

export const PixelBook = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Book cover */}
    <rect x="2" y="2" width="12" height="12" fill="currentColor"/>
    <rect x="4" y="3" width="9" height="9" className="fill-background"/>
    {/* Spine */}
    <rect x="2" y="2" width="2" height="12" fill="currentColor"/>
    {/* Pages */}
    <rect x="5" y="5" width="6" height="2" fill="currentColor"/>
    <rect x="5" y="8" width="4" height="2" fill="currentColor"/>
  </svg>
);

export const PixelGamepad = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="3" y="4" width="10" height="8" fill="currentColor"/>
    <rect x="1" y="6" width="2" height="4" fill="currentColor"/>
    <rect x="13" y="6" width="2" height="4" fill="currentColor"/>
    {/* D-pad */}
    <rect x="4" y="7" width="1" height="2" fill="currentColor"/>
    <rect x="5" y="6" width="1" height="4" className="fill-background"/>
    <rect x="5" y="7" width="1" height="2" fill="currentColor"/>
    {/* Buttons */}
    <rect x="10" y="6" width="2" height="2" className="fill-background"/>
    <rect x="10" y="9" width="2" height="2" className="fill-background"/>
  </svg>
);

export const PixelRocket = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Rocket body */}
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="5" y="5" width="6" height="4" fill="currentColor"/>
    <rect x="6" y="9" width="4" height="2" fill="currentColor"/>
    {/* Fins */}
    <rect x="3" y="7" width="2" height="4" fill="currentColor"/>
    <rect x="11" y="7" width="2" height="4" fill="currentColor"/>
    {/* Fire */}
    <rect x="7" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="13" width="4" height="2" fill="currentColor"/>
  </svg>
);

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

export const PixelHeart = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="2" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="10" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="14" height="4" fill="currentColor"/>
    <rect x="2" y="9" width="12" height="2" fill="currentColor"/>
    <rect x="3" y="11" width="10" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
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

export const PixelBell = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Top */}
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    {/* Bell body */}
    <rect x="5" y="3" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="5" width="8" height="4" fill="currentColor"/>
    <rect x="3" y="9" width="10" height="2" fill="currentColor"/>
    <rect x="2" y="11" width="12" height="2" fill="currentColor"/>
    {/* Clapper */}
    <rect x="7" y="13" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelMail = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Envelope */}
    <rect x="1" y="3" width="14" height="10" fill="currentColor"/>
    {/* Flap */}
    <rect x="2" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="8" width="4" height="2" fill="currentColor"/>
    {/* Inner */}
    <rect x="2" y="7" width="4" height="5" className="fill-background"/>
    <rect x="10" y="7" width="4" height="5" className="fill-background"/>
  </svg>
);

export const PixelCopy = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Back document */}
    <rect x="4" y="1" width="10" height="10" fill="currentColor"/>
    <rect x="5" y="2" width="8" height="8" className="fill-background"/>
    {/* Front document */}
    <rect x="2" y="5" width="10" height="10" fill="currentColor"/>
    <rect x="3" y="6" width="8" height="8" className="fill-background"/>
    {/* Lines */}
    <rect x="4" y="8" width="6" height="1" fill="currentColor"/>
    <rect x="4" y="10" width="4" height="1" fill="currentColor"/>
    <rect x="4" y="12" width="5" height="1" fill="currentColor"/>
  </svg>
);

export const PixelDownload = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="1" width="2" height="6" fill="currentColor"/>
    <rect x="5" y="7" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="9" width="2" height="2" fill="currentColor"/>
    {/* Base */}
    <rect x="2" y="12" width="12" height="2" fill="currentColor"/>
    <rect x="2" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="10" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelShare = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Top node */}
    <rect x="10" y="1" width="4" height="4" fill="currentColor"/>
    {/* Middle node */}
    <rect x="2" y="6" width="4" height="4" fill="currentColor"/>
    {/* Bottom node */}
    <rect x="10" y="11" width="4" height="4" fill="currentColor"/>
    {/* Lines */}
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="6" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="11" width="4" height="2" fill="currentColor"/>
    <rect x="8" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="9" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelLogOut = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Door frame */}
    <rect x="2" y="1" width="2" height="14" fill="currentColor"/>
    <rect x="2" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="2" y="13" width="6" height="2" fill="currentColor"/>
    {/* Arrow */}
    <rect x="6" y="7" width="6" height="2" fill="currentColor"/>
    <rect x="10" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="7" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelPlus = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="2" width="2" height="12" fill="currentColor"/>
    <rect x="2" y="7" width="12" height="2" fill="currentColor"/>
  </svg>
);

export const PixelEdit = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Pencil body */}
    <rect x="10" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="9" width="2" height="2" fill="currentColor"/>
    {/* Pencil tip */}
    <rect x="1" y="11" width="2" height="2" fill="currentColor"/>
    {/* Eraser */}
    <rect x="12" y="1" width="3" height="3" fill="currentColor"/>
  </svg>
);

export const PixelTrash = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Lid */}
    <rect x="2" y="2" width="12" height="2" fill="currentColor"/>
    <rect x="6" y="1" width="4" height="1" fill="currentColor"/>
    {/* Can body */}
    <rect x="3" y="4" width="10" height="10" fill="currentColor"/>
    {/* Lines */}
    <rect x="5" y="6" width="1" height="6" className="fill-background"/>
    <rect x="7" y="6" width="1" height="6" className="fill-background"/>
    <rect x="10" y="6" width="1" height="6" className="fill-background"/>
  </svg>
);

export const PixelSettings = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Gear teeth */}
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="13" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="13" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    {/* Center circle */}
    <rect x="5" y="5" width="6" height="6" fill="currentColor"/>
    <rect x="6" y="6" width="4" height="4" className="fill-background"/>
  </svg>
);

export const PixelHome = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="3" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="5" width="10" height="2" fill="currentColor"/>
    <rect x="2" y="7" width="12" height="8" fill="currentColor"/>
    <rect x="3" y="8" width="4" height="6" className="fill-background"/>
    <rect x="9" y="8" width="4" height="6" className="fill-background"/>
    <rect x="6" y="10" width="4" height="4" className="fill-background"/>
  </svg>
);

export const PixelEye = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="4" y="4" width="8" height="2" fill="currentColor"/>
    <rect x="2" y="6" width="12" height="4" fill="currentColor"/>
    <rect x="4" y="10" width="8" height="2" fill="currentColor"/>
    <rect x="6" y="6" width="4" height="4" className="fill-background"/>
    <rect x="7" y="7" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelEyeOff = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="4" y="4" width="8" height="2" fill="currentColor"/>
    <rect x="2" y="6" width="12" height="4" fill="currentColor"/>
    <rect x="4" y="10" width="8" height="2" fill="currentColor"/>
    <rect x="2" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="12" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelLock = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="2" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="4" width="2" height="4" fill="currentColor"/>
    <rect x="10" y="4" width="2" height="4" fill="currentColor"/>
    <rect x="3" y="7" width="10" height="8" fill="currentColor"/>
    <rect x="7" y="10" width="2" height="3" className="fill-background"/>
  </svg>
);

export const PixelUpload = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="2" width="2" height="6" fill="currentColor"/>
    <rect x="5" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="10" width="2" height="4" fill="currentColor"/>
    <rect x="12" y="10" width="2" height="4" fill="currentColor"/>
    <rect x="2" y="12" width="12" height="2" fill="currentColor"/>
  </svg>
);

export const PixelImage = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="2" width="14" height="12" fill="currentColor"/>
    <rect x="2" y="3" width="12" height="10" className="fill-background"/>
    <rect x="4" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="9" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelPlay = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="4" y="2" width="2" height="12" fill="currentColor"/>
    <rect x="6" y="3" width="2" height="10" fill="currentColor"/>
    <rect x="8" y="4" width="2" height="8" fill="currentColor"/>
    <rect x="10" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="12" y="6" width="2" height="4" fill="currentColor"/>
  </svg>
);

export const PixelPause = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="3" y="2" width="4" height="12" fill="currentColor"/>
    <rect x="9" y="2" width="4" height="12" fill="currentColor"/>
  </svg>
);

export const PixelRefresh = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="4" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    <rect x="10" y="7" width="4" height="2" fill="currentColor"/>
    <rect x="12" y="5" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelSave = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="2" y="1" width="12" height="14" fill="currentColor"/>
    <rect x="4" y="2" width="6" height="4" className="fill-background"/>
    <rect x="4" y="8" width="8" height="6" className="fill-background"/>
    <rect x="8" y="2" width="2" height="3" fill="currentColor"/>
  </svg>
);

export const PixelSend = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="6" width="2" height="4" fill="currentColor"/>
    <rect x="5" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="7" y="4" width="2" height="8" fill="currentColor"/>
    <rect x="9" y="3" width="2" height="6" fill="currentColor"/>
    <rect x="11" y="2" width="2" height="4" fill="currentColor"/>
    <rect x="13" y="1" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelDollar = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="3" width="8" height="2" fill="currentColor"/>
    <rect x="3" y="5" width="3" height="2" fill="currentColor"/>
    <rect x="5" y="7" width="6" height="2" fill="currentColor"/>
    <rect x="10" y="9" width="3" height="2" fill="currentColor"/>
    <rect x="4" y="11" width="8" height="2" fill="currentColor"/>
    <rect x="7" y="13" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelTrendingUp = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="10" y="2" width="4" height="2" fill="currentColor"/>
    <rect x="12" y="4" width="2" height="4" fill="currentColor"/>
    <rect x="10" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="12" width="14" height="2" fill="currentColor"/>
  </svg>
);

export const PixelTrendingDown = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="10" y="8" width="4" height="2" fill="currentColor"/>
    <rect x="12" y="4" width="2" height="4" fill="currentColor"/>
    <rect x="10" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="12" width="14" height="2" fill="currentColor"/>
  </svg>
);

export const PixelAlertCircle = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    <rect x="7" y="4" width="2" height="4" fill="currentColor"/>
    <rect x="7" y="10" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelXCircle = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    <rect x="5" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="9" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelFileText = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="2" y="1" width="12" height="14" fill="currentColor"/>
    <rect x="3" y="2" width="10" height="12" className="fill-background"/>
    <rect x="4" y="4" width="8" height="1" fill="currentColor"/>
    <rect x="4" y="6" width="6" height="1" fill="currentColor"/>
    <rect x="4" y="8" width="8" height="1" fill="currentColor"/>
    <rect x="4" y="10" width="4" height="1" fill="currentColor"/>
  </svg>
);

export const PixelHash = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="1" width="2" height="14" fill="currentColor"/>
    <rect x="9" y="1" width="2" height="14" fill="currentColor"/>
    <rect x="1" y="5" width="14" height="2" fill="currentColor"/>
    <rect x="1" y="9" width="14" height="2" fill="currentColor"/>
  </svg>
);

export const PixelTag = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="1" width="8" height="8" fill="currentColor"/>
    <rect x="9" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="13" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="9" width="4" height="2" fill="currentColor"/>
    <rect x="7" y="11" width="4" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="4" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" className="fill-background"/>
  </svg>
);

export const PixelCompass = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    <rect x="5" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="7" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelSun = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="5" width="6" height="6" fill="currentColor"/>
    <rect x="1" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="13" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="13" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelMoon = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="6" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="10" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="13" width="4" height="2" fill="currentColor"/>
  </svg>
);

export const PixelAward = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="10" height="6" fill="currentColor"/>
    <rect x="5" y="9" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="11" width="2" height="4" fill="currentColor"/>
    <rect x="10" y="11" width="2" height="4" fill="currentColor"/>
    <rect x="6" y="13" width="4" height="2" fill="currentColor"/>
  </svg>
);

export const PixelGraduationCap = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="3" width="8" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="14" height="2" fill="currentColor"/>
    <rect x="3" y="7" width="2" height="4" fill="currentColor"/>
    <rect x="11" y="7" width="2" height="4" fill="currentColor"/>
    <rect x="5" y="9" width="6" height="2" fill="currentColor"/>
    <rect x="13" y="6" width="2" height="6" fill="currentColor"/>
    <rect x="12" y="11" width="4" height="2" fill="currentColor"/>
  </svg>
);

export const PixelTarget = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    <rect x="6" y="6" width="4" height="4" fill="currentColor"/>
  </svg>
);

export const PixelZap = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="8" y="1" width="4" height="2" fill="currentColor"/>
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="4" y="5" width="4" height="2" fill="currentColor"/>
    <rect x="4" y="7" width="8" height="2" fill="currentColor"/>
    <rect x="8" y="9" width="4" height="2" fill="currentColor"/>
    <rect x="6" y="11" width="4" height="2" fill="currentColor"/>
    <rect x="4" y="13" width="4" height="2" fill="currentColor"/>
  </svg>
);

export const PixelLayers = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="3" width="8" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="14" height="2" fill="currentColor"/>
    <rect x="1" y="8" width="14" height="2" fill="currentColor"/>
    <rect x="1" y="11" width="14" height="2" fill="currentColor"/>
  </svg>
);

export const PixelMoreHorizontal = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="2" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="7" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelYoutube = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="3" width="14" height="10" fill="currentColor"/>
    <rect x="6" y="5" width="2" height="6" className="fill-background"/>
    <rect x="8" y="6" width="2" height="4" className="fill-background"/>
    <rect x="10" y="7" width="2" height="2" className="fill-background"/>
  </svg>
);

export const PixelInstagram = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="1" width="14" height="14" fill="currentColor"/>
    <rect x="2" y="2" width="12" height="12" className="fill-background"/>
    <rect x="5" y="5" width="6" height="6" fill="currentColor"/>
    <rect x="6" y="6" width="4" height="4" className="fill-background"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelChevronUp = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="8" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelArrowUp = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="2" width="2" height="10" fill="currentColor"/>
    <rect x="5" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="6" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelArrowDown = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="4" width="2" height="10" fill="currentColor"/>
    <rect x="5" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="3" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="8" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelArrowUpRight = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="6" y="2" width="8" height="2" fill="currentColor"/>
    <rect x="12" y="4" width="2" height="6" fill="currentColor"/>
    <rect x="10" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="12" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelBuilding = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="3" y="1" width="10" height="14" fill="currentColor"/>
    <rect x="5" y="3" width="2" height="2" className="fill-background"/>
    <rect x="9" y="3" width="2" height="2" className="fill-background"/>
    <rect x="5" y="6" width="2" height="2" className="fill-background"/>
    <rect x="9" y="6" width="2" height="2" className="fill-background"/>
    <rect x="5" y="9" width="2" height="2" className="fill-background"/>
    <rect x="9" y="9" width="2" height="2" className="fill-background"/>
    <rect x="6" y="12" width="4" height="3" className="fill-background"/>
  </svg>
);

export const PixelBriefcase = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="1" width="6" height="3" fill="currentColor"/>
    <rect x="6" y="2" width="4" height="1" className="fill-background"/>
    <rect x="1" y="4" width="14" height="10" fill="currentColor"/>
    <rect x="1" y="8" width="14" height="2" className="fill-background"/>
    <rect x="7" y="7" width="2" height="4" fill="currentColor"/>
  </svg>
);

export const PixelHelpCircle = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    <rect x="6" y="4" width="4" height="2" fill="currentColor"/>
    <rect x="9" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="10" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelMessageCircle = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="4" y="2" width="8" height="2" fill="currentColor"/>
    <rect x="2" y="4" width="12" height="6" fill="currentColor"/>
    <rect x="4" y="10" width="4" height="2" fill="currentColor"/>
    <rect x="2" y="12" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelCode = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="4" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="6" width="2" height="4" fill="currentColor"/>
    <rect x="4" y="10" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="6" width="2" height="4" fill="currentColor"/>
    <rect x="10" y="10" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelMinus = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="2" y="7" width="12" height="2" fill="currentColor"/>
  </svg>
);

export const PixelCamera = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="1" y="3" width="14" height="10" fill="currentColor"/>
    <rect x="5" y="5" width="6" height="6" className="fill-background"/>
    <rect x="6" y="6" width="4" height="4" fill="currentColor"/>
    <rect x="2" y="4" width="2" height="2" className="fill-background"/>
  </svg>
);

export const PixelWrench = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="10" y="1" width="4" height="2" fill="currentColor"/>
    <rect x="12" y="3" width="2" height="4" fill="currentColor"/>
    <rect x="10" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="8" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="11" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="13" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="11" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelPalette = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="5" y="1" width="6" height="2" fill="currentColor"/>
    <rect x="3" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="3" width="2" height="2" fill="currentColor"/>
    <rect x="1" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="13" y="5" width="2" height="6" fill="currentColor"/>
    <rect x="3" y="11" width="10" height="2" fill="currentColor"/>
    <rect x="5" y="13" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="9" y="9" width="3" height="3" className="fill-background"/>
  </svg>
);

export const PixelTicket = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="1" y="3" width="14" height="10" fill="currentColor"/>
    <rect x="2" y="4" width="12" height="8" className="fill-background"/>
    <rect x="1" y="7" width="2" height="2" className="fill-background"/>
    <rect x="13" y="7" width="2" height="2" className="fill-background"/>
    <rect x="4" y="6" width="8" height="4" fill="currentColor"/>
    <rect x="5" y="7" width="6" height="2" className="fill-background"/>
  </svg>
);

export const PixelNetwork = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="7" width="2" height="2" fill="currentColor"/>
    <rect x="7" y="13" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    <rect x="4" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="4" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="9" width="2" height="2" fill="currentColor"/>
    <rect x="6" y="11" width="4" height="2" fill="currentColor"/>
    <rect x="6" y="6" width="4" height="4" fill="currentColor"/>
  </svg>
);

export const PixelUserCheck = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="4" y="1" width="6" height="5" fill="currentColor"/>
    <rect x="2" y="7" width="10" height="5" fill="currentColor"/>
    <rect x="3" y="12" width="8" height="2" fill="currentColor"/>
    <rect x="12" y="8" width="2" height="2" fill="currentColor"/>
    <rect x="13" y="6" width="2" height="2" fill="currentColor"/>
    <rect x="10" y="10" width="2" height="2" fill="currentColor"/>
  </svg>
);

export const PixelBarChart = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    <rect x="2" y="9" width="3" height="5" fill="currentColor"/>
    <rect x="6" y="5" width="3" height="9" fill="currentColor"/>
    <rect x="10" y="2" width="3" height="12" fill="currentColor"/>
    <rect x="1" y="14" width="14" height="1" fill="currentColor"/>
  </svg>
);

// ============================================
// PIXEL LOGO - DeFi México
// ============================================

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const PixelLogo = ({ className, size = 'md' }: LogoProps) => {
  const dimensions = {
    sm: { width: 80, height: 12, fontSize: '10px' },
    md: { width: 110, height: 16, fontSize: '14px' },
    lg: { width: 140, height: 20, fontSize: '18px' },
  };

  const { width, height, fontSize } = dimensions[size];

  return (
    <div
      className={cn('inline-flex items-center gap-1', className)}
      style={{
        fontFamily: '"Press Start 2P", "Courier New", monospace',
        fontSize,
        letterSpacing: '-0.5px',
        imageRendering: 'pixelated',
      }}
    >
      <span className="text-primary font-bold" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.3)' }}>DeFi</span>
      <span className="text-foreground font-bold" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.3)' }}>México</span>
    </div>
  );
};

// ============================================
// AGENTIC WORLD ICONS
// ============================================

export const PixelLobster = ({ className, size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={cn('text-current', className)} style={{ imageRendering: 'pixelated' }}>
    {/* Claws */}
    <rect x="1" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="13" y="2" width="2" height="2" fill="currentColor"/>
    <rect x="2" y="4" width="2" height="2" fill="currentColor"/>
    <rect x="12" y="4" width="2" height="2" fill="currentColor"/>
    {/* Arms */}
    <rect x="3" y="5" width="2" height="2" fill="currentColor"/>
    <rect x="11" y="5" width="2" height="2" fill="currentColor"/>
    {/* Head */}
    <rect x="6" y="3" width="4" height="2" fill="currentColor"/>
    {/* Eyes */}
    <rect x="5" y="4" width="1" height="1" fill="currentColor"/>
    <rect x="10" y="4" width="1" height="1" fill="currentColor"/>
    {/* Body */}
    <rect x="5" y="5" width="6" height="2" fill="currentColor"/>
    <rect x="6" y="7" width="4" height="2" fill="currentColor"/>
    <rect x="6" y="9" width="4" height="2" fill="currentColor"/>
    {/* Tail fan */}
    <rect x="5" y="11" width="6" height="2" fill="currentColor"/>
    <rect x="4" y="13" width="2" height="1" fill="currentColor"/>
    <rect x="7" y="13" width="2" height="1" fill="currentColor"/>
    <rect x="10" y="13" width="2" height="1" fill="currentColor"/>
  </svg>
);

// ============================================
// Re-export from game icons for compatibility
// ============================================
export {
  WalletIcon as PixelWalletAlt,
  CoinsIcon as PixelCoins,
  FireIcon as PixelFire,
  TrophyIcon as PixelTrophyAlt,
  ScaleIcon as PixelScale,
  DropIcon as PixelDrop,
  SproutIcon as PixelSprout,
  BasketIcon as PixelBasket,
  BoltIcon as PixelBolt,
  BoxIcon as PixelBox,
  GiftIcon as PixelGift,
  CelebrationIcon as PixelCelebration,
} from '@/components/games/mercado-lp/components/icons/GameIcons';
