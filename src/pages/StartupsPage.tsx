import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PixelSearch,
  PixelArrowUpRight,
  PixelUsers,
  PixelTrendingUp,
  PixelGlobe,
  PixelFilter,
  PixelRocket,
  PixelDollar,
  PixelLoader,
  PixelPlus
} from '@/components/ui/pixel-icons';
import { startupsService } from '@/services/startups.service';
import { useAuth } from '@/hooks/useAuth';

interface Startup {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  website?: string;
  logo_url?: string;
  founded_date?: string;
  linkedin_url?: string;
  twitter_url?: string;
  github_url?: string;
  tags?: string[];
  categories?: string[];
  total_users?: number;
  is_featured?: boolean;
  status: string;
  country?: string;
  city?: string;
  // Campos adicionales para compatibilidad
  stage?: string;
  funding_stage?: string;
  employee_range?: string;
}

export default function StartupsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStage, setSelectedStage] = useState('all');

  useEffect(() => {
    loadStartups();
  }, []);

  const loadStartups = async () => {
    try {
      setLoading(true);
      const data = await startupsService.getAll();
      console.log('Startups loaded:', data);
      setStartups(data || []);
    } catch (error) {
      console.error('Error loading startups:', error);
      setStartups([]);
    } finally {
      setLoading(false);
    }
  };

  // Extraer categorías únicas de las startups
  const allCategories = Array.from(
    new Set(startups.flatMap(s => s.categories || s.tags || []))
  ).filter(Boolean);

  // Extraer stages únicos
  const allStages = Array.from(
    new Set(startups.map(s => s.stage || s.funding_stage || 'N/A').filter(s => s !== 'N/A'))
  );

  const filteredStartups = startups.filter(startup => {
    const matchesSearch = 
      (startup.name?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      (startup.description?.toLowerCase().includes(searchQuery.toLowerCase()) || false);
    
    const matchesCategory = selectedCategory === 'all' || 
      startup.categories?.includes(selectedCategory) ||
      startup.tags?.includes(selectedCategory);
    
    const matchesStage = selectedStage === 'all' || 
      startup.stage === selectedStage ||
      startup.funding_stage === selectedStage;
    
    return matchesSearch && matchesCategory && matchesStage;
  });


  const handleRegisterStartup = () => {
    if (user) {
      // Si ya está autenticado, redirigir al formulario de propuesta
      navigate('/user/startups/nueva');
    } else {
      // Si no está autenticado, redirigir al login con redirect
      navigate('/login?redirectTo=/user/startups/nueva');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">{t('startups.title')}</h1>
            <p className="text-muted-foreground text-lg">
              {t('startups.description')}
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleRegisterStartup}
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            <PixelPlus size={20} className="mr-2" />
            Propón tu Startup
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <PixelSearch size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('common.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder={t('common.filter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('startups.all')}</SelectItem>
              {allCategories.map(category => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {allStages.length > 0 && (
            <Select value={selectedStage} onValueChange={setSelectedStage}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Etapa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {allStages.map(stage => (
                  <SelectItem key={stage} value={stage}>
                    {stage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" className="gap-2">
            <PixelFilter size={16} />
            Más filtros
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Startups</CardDescription>
              <CardTitle className="text-2xl">{filteredStartups.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Startups Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <PixelLoader size={32} className="text-primary" />
          </div>
        ) : filteredStartups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStartups.map((startup) => (
              <Card key={startup.id} className="hover:shadow-lg transition-all hover:-translate-y-1">
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                      {startup.logo_url ? (
                        <img 
                          src={startup.logo_url} 
                          alt={startup.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <PixelRocket size={24} className="text-primary" />
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-xl">{startup.name}</CardTitle>
                        {startup.founded_date && (
                          <p className="text-xs text-muted-foreground">
                            Fundada en {new Date(startup.founded_date).getFullYear()}
                          </p>
                        )}
                      </div>
                    </div>
                    {startup.is_featured && (
                      <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600">
                        ⭐ Destacada
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="line-clamp-2">
                    {startup.description || 'Innovando en el ecosistema DeFi de México'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {startup.categories?.slice(0, 1).map((cat) => (
                      <Badge key={cat} variant="outline">{cat}</Badge>
                    ))}
                    {startup.tags?.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="outline">{tag}</Badge>
                    ))}
                  </div>
                  
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    {startup.total_users && (
                      <div className="flex items-center gap-1">
                        <PixelUsers size={16} />
                        <span>{startup.total_users.toLocaleString()} usuarios</span>
                      </div>
                    )}
                    {startup.city && (
                      <span>📍 {startup.city}</span>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="pt-0">
                  <div className="flex gap-2 w-full">
                    <Button asChild variant="outline" className="flex-1">
                      <Link to={`/startups/${startup.id}`}>Ver más</Link>
                    </Button>
                    {startup.website && (
                      <Button asChild variant="default" size="icon">
                        <a href={startup.website} target="_blank" rel="noopener noreferrer">
                          <PixelGlobe size={16} />
                        </a>
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <PixelRocket size={48} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No se encontraron startups</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || selectedCategory !== 'all' || selectedStage !== 'all' 
                ? 'Intenta ajustar los filtros o buscar con otros términos'
                : 'No hay startups publicadas en este momento'}
            </p>
            {!loading && startups.length === 0 && (
              <Button asChild variant="outline">
                <Link to="/admin/startups/new">
                  <PixelRocket size={16} className="mr-2" />
                  Agregar primera startup
                </Link>
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}