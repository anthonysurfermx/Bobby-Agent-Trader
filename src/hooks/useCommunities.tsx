// =====================================================
// 9. src/hooks/useCommunities.tsx
// =====================================================
import { useState, useEffect } from 'react';
import { communitiesService } from '../services/communities.service';
import type { Community, CommunityInsert, CommunityFilters } from '../types';

export function useCommunities(initialFilters?: CommunityFilters) {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CommunityFilters>(initialFilters || {});
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadCommunities();
  }, [filters]);

  const loadCommunities = async () => {
    setLoading(true);
    setError(null);
    
    const response = await communitiesService.getAll(filters);
    
    if (response.error) {
      setError(response.error);
      setCommunities([]);
    } else {
      setCommunities(response.data || []);
      // ServiceResponse no tiene metadata, usar longitud del array
      setTotal(response.data?.length || 0);
    }
    
    setLoading(false);
  };

  const createCommunity = async (community: CommunityInsert) => {
    const response = await communitiesService.create(community);
    
    if (!response.error && response.data) {
      setCommunities(prev => [response.data!, ...prev]);
      setTotal(prev => prev + 1);
    }
    
    return response;
  };

  const updateCommunity = async (id: string, updates: Partial<Community>) => {
    const response = await communitiesService.update(id, updates);
    
    if (!response.error && response.data) {
      setCommunities(prev => 
        prev.map(c => c.id === id ? response.data! : c)
      );
    }
    
    return response;
  };

  const deleteCommunity = async (id: string) => {
    const response = await communitiesService.delete(id);
    
    if (!response.error) {
      setCommunities(prev => prev.filter(c => c.id !== id));
      setTotal(prev => prev - 1);
    }
    
    return response;
  };

  const searchCommunities = async (query: string) => {
    setLoading(true);
    // Usar searchSimple en lugar de search (método correcto del servicio)
    const response = await communitiesService.searchSimple(query);

    if (response.error) {
      setError(response.error);
    } else {
      setCommunities(response.data || []);
    }

    setLoading(false);
    return response;
  };

  return {
    communities,
    loading,
    error,
    total,
    filters,
    setFilters,
    reload: loadCommunities,
    createCommunity,
    updateCommunity,
    deleteCommunity,
    searchCommunities
  };
}