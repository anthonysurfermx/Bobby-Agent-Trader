import { useEffect, useState } from 'react';
import { MarketEvent } from '../types/game';
import { getEventTimeRemaining, formatTimeRemaining } from '../data/marketEvents';
import { cn } from '@/lib/utils';
import { X, Timer, TrendingUp, TrendingDown, Droplets, Zap, Tag, Sparkles, Flashlight, Fish } from 'lucide-react';

interface MarketEventsBannerProps {
  events: MarketEvent[];
  onDismiss?: (eventId: string) => void;
  compact?: boolean;
}

const eventIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  price_surge: TrendingUp,
  price_crash: TrendingDown,
  liquidity_bonus: Droplets,
  trading_frenzy: Zap,
  fee_discount: Tag,
  xp_boost: Sparkles,
  token_spotlight: Flashlight,
  whale_alert: Fish,
};

const eventColors: Record<string, string> = {
  price_surge: 'from-green-600/90 to-emerald-600/90 border-green-400',
  price_crash: 'from-red-600/90 to-rose-600/90 border-red-400',
  liquidity_bonus: 'from-blue-600/90 to-cyan-600/90 border-blue-400',
  trading_frenzy: 'from-yellow-600/90 to-amber-600/90 border-yellow-400',
  fee_discount: 'from-purple-600/90 to-violet-600/90 border-purple-400',
  xp_boost: 'from-amber-500/90 to-orange-500/90 border-amber-400',
  token_spotlight: 'from-indigo-600/90 to-blue-600/90 border-indigo-400',
  whale_alert: 'from-slate-600/90 to-zinc-600/90 border-slate-400',
};

export function MarketEventsBanner({ events, onDismiss, compact = false }: MarketEventsBannerProps) {
  const [timeRemaining, setTimeRemaining] = useState<Record<string, number>>({});

  // Update countdown every second
  useEffect(() => {
    const updateTimes = () => {
      const times: Record<string, number> = {};
      events.forEach(event => {
        times[event.id] = getEventTimeRemaining(event);
      });
      setTimeRemaining(times);
    };

    updateTimes();
    const interval = setInterval(updateTimes, 1000);
    return () => clearInterval(interval);
  }, [events]);

  if (events.length === 0) return null;

  if (compact) {
    // Show only first event in compact mode
    const event = events[0];
    const Icon = eventIcons[event.type] || Zap;
    const remaining = timeRemaining[event.id] || 0;

    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r border animate-pulse-slow',
          eventColors[event.type]
        )}
      >
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium truncate">{event.title}</span>
        <span className="text-xs opacity-75">{formatTimeRemaining(remaining)}</span>
        {events.length > 1 && (
          <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">
            +{events.length - 1}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map(event => {
        const Icon = eventIcons[event.type] || Zap;
        const remaining = timeRemaining[event.id] || 0;

        return (
          <div
            key={event.id}
            className={cn(
              'relative flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r border shadow-lg animate-in slide-in-from-top-2',
              eventColors[event.type]
            )}
          >
            {/* Animated background effect */}
            <div className="absolute inset-0 bg-white/5 rounded-xl animate-pulse" />

            <div className="relative flex items-center gap-3 flex-1">
              <div className="p-2 bg-white/10 rounded-lg">
                <Icon className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{event.icon}</span>
                  <span className="font-bold">{event.title}</span>
                </div>
                <p className="text-sm opacity-90 truncate">{event.description}</p>
              </div>

              <div className="flex items-center gap-3">
                {/* Multiplier badge */}
                {event.multiplier !== 1 && (
                  <div className="px-2 py-1 bg-white/20 rounded-lg text-sm font-bold">
                    {event.multiplier > 1 ? '+' : ''}{Math.round((event.multiplier - 1) * 100)}%
                  </div>
                )}

                {/* Timer */}
                <div className="flex items-center gap-1 px-2 py-1 bg-black/20 rounded-lg">
                  <Timer className="w-4 h-4" />
                  <span className="font-mono text-sm font-bold min-w-[45px]">
                    {formatTimeRemaining(remaining)}
                  </span>
                </div>

                {onDismiss && (
                  <button
                    onClick={() => onDismiss(event.id)}
                    className="p-1 hover:bg-white/20 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Mini indicator for header/sidebar
export function MarketEventsIndicator({ events }: { events: MarketEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="relative">
      <Zap className="w-5 h-5 text-yellow-400 animate-pulse" />
      {events.length > 1 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold">
          {events.length}
        </span>
      )}
    </div>
  );
}
