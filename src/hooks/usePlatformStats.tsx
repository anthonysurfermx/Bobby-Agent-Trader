// =====================================================
// 10. src/hooks/usePlatformStats.tsx
// =====================================================
import { useState, useEffect } from 'react';
import { platformService } from '../services/platform.service';
import type { PlatformStatsWithDetails } from '../types';

export function usePlatformStats(autoRefresh = false, refreshInterval = 60000) {
  const [stats, setStats] = useState<PlatformStatsWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();

    if (autoRefresh) {
      const interval = setInterval(loadStats, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  const loadStats = async () => {
    const response = await platformService.getStats();
    
    if (response.error) {
      setError(response.error);
    } else {
      setStats(response.data);
      setError(null);
    }
    
    setLoading(false);
  };

  const refreshStats = async () => {
    setLoading(true);
    await platformService.updateStats();
    await loadStats();
  };

  return {
    stats,
    loading,
    error,
    reload: loadStats,
    refresh: refreshStats
  };
}
