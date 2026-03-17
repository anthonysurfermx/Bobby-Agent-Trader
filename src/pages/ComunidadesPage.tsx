import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import CommunityCard from "@/components/ui/community-card";
import { motion } from "framer-motion";
import { communitiesService, type Community } from "@/services/communities.service";
import { PixelSearch, PixelFilter, PixelX, PixelPlus } from "@/components/ui/pixel-icons";
import { useAuth } from "@/hooks/useAuth";

const CommunidadesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const handleProposeCommunity = () => {
    if (user) {
      navigate('/user/comunidades/nueva');
    } else {
      navigate('/login?redirectTo=/user/comunidades/nueva');
    }
  };

  // Cargar comunidades desde Supabase
  useEffect(() => {
    loadCommunities();
  }, []);

  const loadCommunities = async () => {
    try {
      setLoading(true);
      const result = await communitiesService.getAll({ limit: 100 });
      
      if (result.data) {
        setCommunities(result.data);
      } else if (result.error) {
        console.error('Error loading communities:', result.error);
      }
    } catch (error) {
      console.error('Error in loadCommunities:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCommunities = communities
    .filter(community => {
      const matchesSearch = searchTerm === "" ||
        community.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        community.description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory = categoryFilter === "all" || community.category === categoryFilter;

      const matchesTags = selectedTags.length === 0 ||
                         (community.tags && selectedTags.every(tag => community.tags?.includes(tag)));

      return matchesSearch && matchesCategory && matchesTags;
    })
    // Ordenar: oficiales primero, luego destacadas, luego por miembros
    .sort((a, b) => {
      const aOfficial = (a as any).is_official ? 1 : 0;
      const bOfficial = (b as any).is_official ? 1 : 0;
      if (bOfficial !== aOfficial) return bOfficial - aOfficial;

      const aFeatured = a.is_featured ? 1 : 0;
      const bFeatured = b.is_featured ? 1 : 0;
      if (bFeatured !== aFeatured) return bFeatured - aFeatured;

      return (b.member_count || 0) - (a.member_count || 0);
    });

  const categories = [...new Set(communities.map(c => c.category).filter(Boolean))].sort();
  const allTags = [...new Set(communities.flatMap(c => c.tags || []))].sort();

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const clearAllFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setSelectedTags([]);
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <div className="text-center md:text-left flex-1">
              <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-4">
                Comunidades <span className="text-gradient">DeFi México</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-3xl">
                Únete a las comunidades más activas del ecosistema DeFi mexicano.
                Desde Discord servers hasta meetups presenciales, encuentra tu tribu
                y conecta con otros entusiastas de blockchain.
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleProposeCommunity}
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              <PixelPlus size={20} className="mr-2" />
              Propón tu Comunidad
            </Button>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="space-y-6 mb-8"
        >
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                <PixelSearch size={20} />
              </div>
              <Input
                placeholder="Buscar comunidades por nombre o descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <PixelFilter size={16} className="mr-2" />
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tags Filter */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Filtrar por categorías:</h3>
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => (
                <Badge 
                  key={tag}
                  variant={selectedTags.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer hover:bg-primary/20 transition-colors"
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                  {selectedTags.includes(tag) && (
                    <PixelX size={12} className="ml-1" />
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* Active Filters */}
          {(searchTerm || categoryFilter !== "all" || selectedTags.length > 0) && (
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">Filtros activos:</span>
              {searchTerm && (
                <Badge variant="secondary" className="text-xs">
                  Búsqueda: "{searchTerm}"
                </Badge>
              )}
              {categoryFilter !== "all" && (
                <Badge variant="secondary" className="text-xs">
                  Categoría: {categoryFilter}
                </Badge>
              )}
              {selectedTags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearAllFilters}
                className="text-xs"
              >
                Limpiar todos
              </Button>
            </div>
          )}
        </motion.div>

        {/* Results Count */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mb-6"
        >
          <p className="text-muted-foreground">
            Mostrando {filteredCommunities.length} de {communities.length} comunidades
          </p>
        </motion.div>

        {/* Communities Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 * i }}
                className="bg-card p-6 rounded-xl border border-border animate-pulse"
              >
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-16 h-16 bg-muted rounded-lg"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded mb-2"></div>
                    <div className="h-3 bg-muted rounded w-2/3"></div>
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="h-3 bg-muted rounded"></div>
                  <div className="h-3 bg-muted rounded w-4/5"></div>
                  <div className="h-3 bg-muted rounded w-3/5"></div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="h-6 bg-muted rounded w-20"></div>
                  <div className="h-8 bg-muted rounded w-24"></div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : filteredCommunities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCommunities.map((community, index) => (
              <motion.div
                key={community.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 * index }}
              >
                <CommunityCard
                  {...community}
                  logo={(community as any).image_url || community.logo_url}
                  socialLinks={(community as any).links || community.social_links}
                  members={community.member_count ?? 0}
                  isActive={community.is_verified ?? true}
                  isFeatured={community.is_featured ?? false}
                  isOfficial={(community as any).is_official ?? false}
                  foundedDate={community.founded_date}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-center py-12"
          >
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <PixelSearch size={32} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              Aún no hay comunidades registradas
            </h3>
            <p className="text-muted-foreground mb-4">
              ¡Sé el primero en registrar tu comunidad DeFi en nuestro ecosistema!
            </p>
            <Button 
              variant="outline" 
              onClick={clearAllFilters}
            >
              Limpiar filtros
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default CommunidadesPage;