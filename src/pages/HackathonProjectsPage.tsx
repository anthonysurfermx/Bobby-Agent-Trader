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
  PixelUsers,
  PixelGlobe,
  PixelFilter,
  PixelLoader,
  PixelPlus
} from '@/components/ui/pixel-icons';
import { startupsService } from '@/services/startups.service';
import { useAuth } from '@/hooks/useAuth';
import { EntityComments } from '@/components/BlogComments';
import { Trophy, Github, Calendar, Zap, Rocket } from 'lucide-react';

interface HackathonProject {
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
  stage?: string;
  funding_stage?: string;
}

export default function HackathonProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState<HackathonProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await startupsService.getHackathonProjects();
      console.log('Hackathon projects loaded:', data);
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading hackathon projects:', error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  // Extraer categorías únicas de los proyectos
  const allCategories = Array.from(
    new Set(projects.flatMap(p => p.categories || p.tags || []))
  ).filter(Boolean);

  const filteredProjects = projects.filter(project => {
    const matchesSearch =
      (project.name?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      (project.description?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      (project.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) || false);

    const matchesCategory = selectedCategory === 'all' ||
      project.categories?.includes(selectedCategory) ||
      project.tags?.includes(selectedCategory);

    return matchesSearch && matchesCategory;
  });

  const handleRegisterProject = () => {
    if (user) {
      navigate('/user/startups/nueva');
    } else {
      navigate('/login?redirectTo=/user/startups/nueva');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Rocket className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-4xl font-bold">{t('hackathonProjects.title')}</h1>
                  <Badge className="bg-violet-500/10 text-violet-500 border-violet-500/20 text-xs">
                    {t('hackathonProjects.badge')}
                  </Badge>
                </div>
                <p className="text-sm text-violet-400 font-medium">
                  {t('hackathonProjects.notStartups')}
                </p>
              </div>
            </div>
            <p className="text-muted-foreground text-lg mt-2">
              {t('hackathonProjects.description')}
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleRegisterProject}
            className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
          >
            <PixelPlus size={20} className="mr-2" />
            {t('hackathonProjects.registerMVP')}
          </Button>
        </div>

        {/* Info Banner */}
        <Card className="mb-8 bg-gradient-to-r from-violet-500/10 to-purple-600/10 border-violet-500/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-violet-500 mt-0.5" />
              <div>
                <p className="font-medium text-violet-300">{t('hackathonProjects.infoBannerTitle')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('hackathonProjects.infoBannerDescription')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <PixelSearch size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('hackathonProjects.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {allCategories.length > 0 && (
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder={t('common.category')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {allCategories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" className="gap-2">
            <PixelFilter size={16} />
            {t('common.moreFilters')}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-8">
          <Card className="border-violet-500/20">
            <CardHeader className="pb-2">
              <CardDescription>{t('hackathonProjects.totalProjects')}</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Rocket className="w-5 h-5 text-violet-500" />
                {filteredProjects.length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <PixelLoader size={32} className="text-primary" />
          </div>
        ) : filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <Card key={project.id} className="hover:shadow-lg transition-all hover:-translate-y-1 border-violet-500/20">
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                      {project.logo_url ? (
                        <img
                          src={project.logo_url}
                          alt={project.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center">
                          <Rocket size={24} className="text-violet-500" />
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-xl">{project.name}</CardTitle>
                        {project.founded_date && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(project.founded_date).getFullYear()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-violet-500/10 text-violet-400 border-violet-500/20 text-[10px]">
                        MVP
                      </Badge>
                      {project.is_featured && (
                        <Badge variant="secondary" className="bg-purple-500/10 text-purple-400">
                          {t('common.featured')}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardDescription className="line-clamp-3">
                    {project.description || t('hackathonProjects.hackathonWinner')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {project.categories?.slice(0, 1).map((cat) => (
                      <Badge key={cat} variant="outline">{cat}</Badge>
                    ))}
                    {project.tags?.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    {project.total_users && (
                      <div className="flex items-center gap-1">
                        <PixelUsers size={16} />
                        <span>{project.total_users.toLocaleString()} {t('common.users')}</span>
                      </div>
                    )}
                    {project.city && (
                      <span className="text-xs">📍 {project.city}</span>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="pt-0">
                  <div className="flex gap-2 w-full">
                    <Button asChild variant="outline" className="flex-1">
                      <Link to={`/startups/${project.id}`}>{t('common.viewDetails')}</Link>
                    </Button>
                    {project.github_url && (
                      <Button asChild variant="outline" size="icon">
                        <a href={project.github_url} target="_blank" rel="noopener noreferrer">
                          <Github size={16} />
                        </a>
                      </Button>
                    )}
                    {project.website && (
                      <Button asChild variant="default" size="icon" className="bg-violet-500 hover:bg-violet-600">
                        <a href={project.website} target="_blank" rel="noopener noreferrer">
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
          <Card className="p-12 text-center border-violet-500/20">
            <Rocket size={48} className="mx-auto mb-4 text-violet-500/50" />
            <h3 className="text-lg font-semibold mb-2">{t('hackathonProjects.noResults')}</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || selectedCategory !== 'all'
                ? t('hackathonProjects.noResultsFilterHint')
                : t('hackathonProjects.noResultsEmptyHint')}
            </p>
            <Button onClick={handleRegisterProject} className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700">
              <PixelPlus size={16} className="mr-2" />
              {t('hackathonProjects.registerMVP')}
            </Button>
          </Card>
        )}

        {/* Comments Section */}
        <EntityComments entityId="hackathon-mvps" entityType="hackathon" />
      </div>
    </div>
  );
}
