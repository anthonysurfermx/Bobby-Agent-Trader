import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Medal, Crown, Star, RefreshCw, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { getPlayerLevel } from '../data/playerLevels';

interface LeaderboardEntry {
  user_id: string;
  full_name: string | null;
  email: string;
  xp: number;
  level: number;
  reputation: number;
  swap_count: number;
  total_fees_earned: number;
  current_streak: number;
  best_streak: number;
  badge_count: number;
  updated_at: string;
}

export const Leaderboard = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('game_leaderboard')
        .select('*')
        .limit(50);

      if (fetchError) {
        throw fetchError;
      }

      setEntries(data || []);
    } catch (err: any) {
      console.error('Error fetching leaderboard:', err);
      setError('No se pudo cargar el leaderboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Crown className="w-5 h-5 text-yellow-500" />;
      case 1:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 2:
        return <Medal className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-muted-foreground">{index + 1}</span>;
    }
  };

  const getRankBg = (index: number) => {
    switch (index) {
      case 0:
        return 'bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border-yellow-500/30';
      case 1:
        return 'bg-gradient-to-r from-gray-400/20 to-gray-300/10 border-gray-400/30';
      case 2:
        return 'bg-gradient-to-r from-amber-600/20 to-orange-500/10 border-amber-600/30';
      default:
        return 'bg-card';
    }
  };

  const getDisplayName = (entry: LeaderboardEntry) => {
    if (entry.full_name) return entry.full_name;
    if (entry.email) {
      const [name] = entry.email.split('@');
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return 'Jugador Anónimo';
  };

  const isCurrentUser = (entry: LeaderboardEntry) => {
    return user?.id === entry.user_id;
  };

  if (loading) {
    return (
      <Card className="pixel-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Leaderboard
          </h3>
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="pixel-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Leaderboard
          </h3>
          <Button variant="ghost" size="sm" onClick={fetchLeaderboard}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchLeaderboard}>
            Reintentar
          </Button>
        </div>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className="pixel-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Leaderboard
          </h3>
          <Button variant="ghost" size="sm" onClick={fetchLeaderboard}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-center py-8">
          <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">¡Sé el primero en el ranking!</p>
          <p className="text-xs text-muted-foreground mt-1">
            Juega y guarda tu progreso para aparecer aquí
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="pixel-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          Leaderboard
        </h3>
        <Button variant="ghost" size="sm" onClick={fetchLeaderboard} className="h-8 w-8 p-0">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {entries.map((entry, index) => {
            const playerLevel = getPlayerLevel(entry.xp);
            const isMe = isCurrentUser(entry);

            return (
              <div
                key={entry.user_id}
                className={`pixel-card p-3 border transition-all ${getRankBg(index)} ${
                  isMe ? 'ring-2 ring-primary' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Rank */}
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                    {getRankIcon(index)}
                  </div>

                  {/* Player Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{playerLevel.icon}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate flex items-center gap-1">
                          {getDisplayName(entry)}
                          {isMe && (
                            <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                              Tú
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {playerLevel.name} • Nivel {entry.level}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex-shrink-0 text-right">
                    <p className="font-bold text-sm flex items-center gap-1 justify-end">
                      <Star className="w-3 h-3 text-yellow-500" />
                      {entry.xp.toLocaleString()} XP
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground justify-end">
                      <span>{entry.swap_count} swaps</span>
                      {entry.badge_count > 0 && (
                        <span>🏅 {entry.badge_count}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Streak indicator */}
                {entry.current_streak > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      🔥 Racha: {entry.current_streak} días
                    </span>
                    {entry.best_streak > entry.current_streak && (
                      <span className="text-muted-foreground">
                        Mejor: {entry.best_streak}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border text-center">
        <p className="text-xs text-muted-foreground">
          Top {entries.length} jugadores • Actualizado en tiempo real
        </p>
      </div>
    </Card>
  );
};
