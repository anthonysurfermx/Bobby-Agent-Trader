// src/pages/CommunitiesPage.tsx - Versión actualizada para trabajar con Supabase
import { useState, useEffect, useMemo, useCallback, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { Search, Filter, Users, TrendingUp, Shield, Star, Loader2, AlertCircle, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import CommunityCard from "@/components/ui/community-card";
import { motion } from "framer-motion";
import { useSearchParams, useNavigate } from "react-router-dom";
import { communitiesService } from "@/services/communities.service";
import type { Community } from "@/types";
import { useAuth } from "@/hooks/useAuth";

// Skeleton para loading states
const CommunitySkeleton = () => (
  <div className="bg-card border border-border rounded-2xl p-6 animate-pulse">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-12 h-12 rounded-lg bg-muted" />
      <div className="flex-1">
        <div className="h-5 bg-muted rounded mb-2" />
        <div className="h-3 bg-muted rounded w-3/4" />
      </div>
    </div>
    <div className="space-y-2 mb-4">
      <div className="h-4 bg-muted rounded" />
      <div className="h-4 bg-muted rounded w-4/5" />
    </div>
    <div className="flex gap-2 mb-4">
      <div className="h-6 bg-muted rounded-full w-16" />
      <div className="h-6 bg-muted rounded-full w-20" />
    </div>
    <div className="h-10 bg-muted rounded" />
  </div>
);

const CommunitiesPage = () => {
  const { t } = useTranslation();
  // URL state para filtros compartibles
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Estados
  const [allCommunities, setAllCommunities] = useState<Community[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    verified: 0,
    featured: 0,
    totalMembers: 0,
    categories: {} as Record<string, number>
  });

  // Filtros desde URL
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || "");
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('cat') || "all");
  const [activeOnly, setActiveOnly] = useState(searchParams.get('active') !== 'false');
  const [featuredOnly, setFeaturedOnly] = useState(searchParams.get('f') === 'true');

  // Usar useDeferredValue para mejor performance
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const useServerSearch = deferredSearchTerm.length >= 3;

  // Función para agregar comunidad
  const handleAddCommunity = () => {
    if (user) {
      navigate('/admin/communities');
    } else {
      navigate('/login?redirectTo=/admin/communities');
    }
  };

  // Sync URL con filtros
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set('q', searchTerm);
    if (categoryFilter !== 'all') params.set('cat', categoryFilter);
    if (!activeOnly) params.set('active', 'false');
    if (featuredOnly) params.set('f', 'true');
    
    setSearchParams(params, { replace: true });
  }, [searchTerm, categoryFilter, activeOnly, featuredOnly, setSearchParams]);

  // Cargar datos iniciales
  useEffect(() => {
    const abortController = new AbortController();
    
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Cargar estadísticas y comunidades en paralelo
        const [statsResult, communitiesResult] = await Promise.all([
          communitiesService.getStats(),
          communitiesService.getAll({ limit: 50, isActive: true })
        ]);

        // Verificar si no fue cancelado
        if (abortController.signal.aborted) return;

        // Manejar respuesta de stats
        if (statsResult.data) {
          setStats(statsResult.data);
        } else if (statsResult.error) {
          console.error('Error loading stats:', statsResult.error);
        }

        // Manejar respuesta de comunidades
        if (communitiesResult.data) {
          setAllCommunities(communitiesResult.data);
          setCommunities(communitiesResult.data);
        } else if (communitiesResult.error) {
          console.error('Error loading communities:', communitiesResult.error);
          setError(communitiesResult.error);
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.error('Error loading initial data:', err);
          setError(err instanceof Error ? err.message : 'Error desconocido');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadInitialData();
    
    return () => {
      abortController.abort();
    };
  }, []);

  // Categorías disponibles
  const availableCategories = useMemo(() => {
    if (Object.keys(stats.categories).length > 0) {
      return Object.keys(stats.categories);
    }
    // Fallback: extraer de comunidades actuales
    return Array.from(
      new Set(
        allCommunities.map(c => c.category).filter(Boolean)
      )
    ) as string[];
  }, [stats.categories, allCommunities]);

  // Búsqueda con el servidor
  const handleSearch = useCallback(async (query: string) => {
    // Si búsqueda muy corta, usar filtrado local
    if (!useServerSearch) {
      setCommunities(allCommunities);
      return;
    }

    try {
      setSearchLoading(true);
      const result = await communitiesService.searchSimple(query, 50);
      
      if (result.data) {
        setCommunities(result.data);
      } else if (result.error) {
        console.error('Search error:', result.error);
        // Fallback a comunidades locales
        setCommunities(allCommunities);
      }
    } catch (err) {
      console.error('Search error:', err);
      setCommunities(allCommunities);
    } finally {
      setSearchLoading(false);
    }
  }, [allCommunities, useServerSearch]);

  // Ejecutar búsqueda cuando cambie el término
  useEffect(() => {
    handleSearch(deferredSearchTerm);
  }, [deferredSearchTerm, handleSearch]);

  // Filtrado local optimizado
  const filteredCommunities = useMemo(() => {
    let filtered = useServerSearch ? communities : allCommunities;

    // Aplicar filtros
    if (categoryFilter !== "all") {
      filtered = filtered.filter(c => c.category === categoryFilter);
    }
    
    if (activeOnly) {
      filtered = filtered.filter(c => c.is_verified);
    }
    
    if (featuredOnly) {
      filtered = filtered.filter(c => c.is_featured);
    }

    // Filtro de texto solo si no usamos server search
    if (!useServerSearch && deferredSearchTerm) {
      const term = deferredSearchTerm.toLowerCase();
      filtered = filtered.filter(community =>
        community.name.toLowerCase().includes(term) ||
        community.description.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [communities, allCommunities, categoryFilter, activeOnly, featuredOnly, deferredSearchTerm, useServerSearch]);

  // Limpiar filtros
  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setCategoryFilter("all");
    setActiveOnly(true);
    setFeaturedOnly(false);
  }, []);

  // Retry function
  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header skeleton */}
          <div className="text-center mb-12">
            <div className="w-48 h-8 bg-muted rounded mx-auto mb-6 animate-pulse" />
            <div className="w-96 h-12 bg-muted rounded mx-auto mb-4 animate-pulse" />
            <div className="w-full max-w-3xl h-6 bg-muted rounded mx-auto animate-pulse" />
          </div>

          {/* Stats skeletons */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 text-center">
                  <div className="w-8 h-8 bg-muted rounded mx-auto mb-2" />
                  <div className="w-16 h-8 bg-muted rounded mx-auto mb-1" />
                  <div className="w-24 h-4 bg-muted rounded mx-auto" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Communities skeletons */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 9 }).map((_, i) => (
              <CommunitySkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && allCommunities.length === 0) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-20">
            <AlertCircle className="w-8 h-8 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">{t('communities.noResults')}</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={handleRetry}>
              {t('common.error')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{t('nav.communities')}</span>
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-4">
              Comunidades <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">DeFi México</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-3xl">
              Únete a las comunidades más activas del ecosistema blockchain mexicano.
              Conecta con desarrolladores, inversores y entusiastas de las finanzas descentralizadas.
            </p>
          </motion.div>
          <Button
            size="lg"
            onClick={handleAddCommunity}
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            <Plus className="mr-2 h-5 w-5" />
            Agrega tu comunidad
          </Button>
        </div>

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
        >
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-6 text-center">
              <Users className="w-8 h-8 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total Comunidades</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20">
            <CardContent className="p-6 text-center">
              <Shield className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{stats.verified}</div>
              <div className="text-sm text-muted-foreground">Activas</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-yellow-500/5 to-yellow-500/10 border-yellow-500/20">
            <CardContent className="p-6 text-center">
              <Star className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{stats.featured}</div>
              <div className="text-sm text-muted-foreground">Destacadas</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-secondary/5 to-secondary/10 border-secondary/20">
            <CardContent className="p-6 text-center">
              <TrendingUp className="w-8 h-8 text-secondary mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{stats.totalMembers.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Total Miembros</div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-card border border-border rounded-2xl p-6 mb-8"
        >
          <div className="flex flex-col lg:flex-row gap-4">
            
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Buscar comunidades..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                aria-label="Buscar comunidades"
              />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Todas las categorías" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {availableCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category} {stats.categories[category] ? `(${stats.categories[category]})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Toggle Filters */}
            <div className="flex gap-2">
              <Button 
                variant={activeOnly ? "default" : "outline"} 
                size="sm"
                onClick={() => setActiveOnly(!activeOnly)}
                className="flex items-center gap-2"
                aria-pressed={activeOnly}
              >
                <Shield className="w-4 h-4" />
                Solo Activas
              </Button>
              
              <Button 
                variant={featuredOnly ? "default" : "outline"} 
                size="sm"
                onClick={() => setFeaturedOnly(!featuredOnly)}
                className="flex items-center gap-2"
                aria-pressed={featuredOnly}
              >
                <Star className="w-4 h-4" />
                Destacadas
              </Button>
            </div>

            {/* Clear Filters */}
            {(searchTerm || categoryFilter !== "all" || !activeOnly || featuredOnly) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpiar
              </Button>
            )}
          </div>

          {/* Active Filters Info */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Filter className="w-4 h-4" />
              <span>Mostrando {filteredCommunities.length} de {allCommunities.length} comunidades</span>
            </div>

            {/* Active Filter Tags */}
            <div className="flex gap-2 flex-wrap">
              {!activeOnly && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Incluye Inactivas
                </Badge>
              )}
              {featuredOnly && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  Solo Destacadas
                </Badge>
              )}
              {categoryFilter !== "all" && (
                <Badge variant="secondary">
                  {categoryFilter}
                </Badge>
              )}
              {deferredSearchTerm && (
                <Badge variant="outline">
                  "{deferredSearchTerm}"
                </Badge>
              )}
            </div>
          </div>
        </motion.div>

        {/* Communities Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {filteredCommunities.length === 0 ? (
            <div className="text-center py-20">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">
                {searchTerm ? 'No se encontraron comunidades' : 'No hay comunidades disponibles'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm 
                  ? 'Prueba ajustando los filtros o búsqueda'
                  : 'Parece que aún no hay comunidades registradas'
                }
              </p>
              {(searchTerm || categoryFilter !== "all" || !activeOnly || featuredOnly) && (
                <Button variant="outline" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCommunities.map((community, index) => (
                <motion.div
                  key={community.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  <CommunityCard
                    id={community.id}
                    name={community.name}
                    description={community.description}
                    logo={(community as any).image_url}
                    members={community.member_count || 0}
                    category={community.category}
                    tags={community.tags}
                    website={(community as any).links?.website}
                    socialLinks={(community as any).links}
                    isActive={community.is_verified}
                    isFeatured={community.is_featured}
                    isOfficial={(community as any).is_official}
                    slug={community.slug}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default CommunitiesPage;