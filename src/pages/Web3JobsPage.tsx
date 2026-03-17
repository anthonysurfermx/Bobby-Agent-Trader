import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PixelSearch,
  PixelLoader,
  PixelGlobe,
  PixelUsers,
  PixelBriefcase,
  PixelMapPin,
  PixelClock,
  PixelDollar,
  PixelBuilding,
  PixelZap,
  PixelExternalLink,
  PixelRocket,
} from '@/components/ui/pixel-icons';
import { jobsService, type Job } from '@/services/jobs.service';

const categories = ['Engineering', 'Product', 'Marketing', 'Security', 'Legal & Compliance', 'Design', 'Operations', 'Finance'];
const jobTypes = [
  { value: 'remote', label: 'Remoto', emoji: '🌎' },
  { value: 'hybrid', label: 'Híbrido', emoji: '🏢' },
  { value: 'onsite', label: 'Presencial', emoji: '📍' },
];

export default function Web3JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState('all');

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const data = await jobsService.getAll();
      setJobs(data);
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (job.tags && job.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));

    const matchesCategory = selectedCategory === 'all' || job.category === selectedCategory;
    const matchesType = selectedType === 'all' || job.job_type === selectedType;

    return matchesSearch && matchesCategory && matchesType;
  });

  const featuredJobs = filteredJobs.filter(job => job.is_featured);
  const regularJobs = filteredJobs.filter(job => !job.is_featured);

  // Calcular salario estimado total (suma de promedios de cada trabajo)
  const calculateTotalEstimatedSalary = () => {
    let total = 0;
    let jobsWithSalary = 0;

    jobs.forEach(job => {
      if (job.salary_min || job.salary_max) {
        const min = job.salary_min || job.salary_max || 0;
        const max = job.salary_max || job.salary_min || 0;
        const avg = (min + max) / 2;
        total += avg;
        jobsWithSalary++;
      }
    });

    return { total, jobsWithSalary };
  };

  const { total: totalSalary, jobsWithSalary } = calculateTotalEstimatedSalary();

  // Formatear número en formato compacto (ej: 1.2M, 500K)
  const formatSalaryCompact = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toFixed(0)}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="pixel-card p-6 bg-gradient-to-br from-primary/10 via-purple-500/10 to-blue-500/10 border-primary/20">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="p-4 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-xl pixel-border">
                <PixelBriefcase size={40} className="text-primary" />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl md:text-4xl font-bold pixel-text">Trabajos Web3 México</h1>
                <p className="text-muted-foreground text-lg mt-1">
                  Encuentra tu próximo trabajo en el ecosistema blockchain 🚀
                </p>
              </div>
              <div className="hidden md:block">
                <div className="text-4xl animate-bounce">💼</div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <Card className="pixel-card bg-gradient-to-br from-primary/5 to-primary/10 hover:scale-105 transition-transform">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-primary/20 rounded-lg">
                  <PixelBriefcase size={24} className="text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{jobs.length}</p>
                  <p className="text-xs text-muted-foreground">Trabajos</p>
                </div>
              </CardContent>
            </Card>
            <Card className="pixel-card bg-gradient-to-br from-green-500/5 to-green-500/10 hover:scale-105 transition-transform">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <PixelGlobe size={24} className="text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{jobs.filter(j => j.job_type === 'remote').length}</p>
                  <p className="text-xs text-muted-foreground">Remotos</p>
                </div>
              </CardContent>
            </Card>
            <Card className="pixel-card bg-gradient-to-br from-blue-500/5 to-blue-500/10 hover:scale-105 transition-transform">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <PixelBuilding size={24} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{new Set(jobs.map(j => j.company)).size}</p>
                  <p className="text-xs text-muted-foreground">Empresas</p>
                </div>
              </CardContent>
            </Card>
            <Card className="pixel-card bg-gradient-to-br from-amber-500/5 to-amber-500/10 hover:scale-105 transition-transform">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <PixelDollar size={24} className="text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatSalaryCompact(totalSalary)}</p>
                  <p className="text-xs text-muted-foreground">
                    Salario Est. ({jobsWithSalary} jobs)
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Filters */}
        <div className="pixel-card p-4 mb-6 bg-card">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <PixelSearch size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, empresa o tecnología..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pixel-border"
              />
            </div>

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-[180px] pixel-border">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">📂 Todas las áreas</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-full md:w-[180px] pixel-border">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🏠 Todos los tipos</SelectItem>
                {jobTypes.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.emoji} {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Job Listings */}
        {loading ? (
          <div className="flex flex-col justify-center items-center py-20 gap-4">
            <PixelLoader size={48} className="text-primary animate-spin" />
            <p className="text-muted-foreground animate-pulse">Cargando trabajos...</p>
          </div>
        ) : filteredJobs.length > 0 ? (
          <div className="space-y-6">
            {/* Featured Jobs */}
            {featuredJobs.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold flex items-center gap-2 pixel-text">
                  <PixelZap size={20} className="text-amber-500" />
                  Trabajos Destacados ⭐
                </h2>
                <div className="grid gap-4">
                  {featuredJobs.map((job) => (
                    <JobCard key={job.id} job={job} featured />
                  ))}
                </div>
              </div>
            )}

            {/* Regular Jobs */}
            {regularJobs.length > 0 && (
              <div className="space-y-4">
                {featuredJobs.length > 0 && (
                  <h2 className="text-xl font-bold pixel-text">Todos los trabajos</h2>
                )}
                <div className="grid gap-4">
                  {regularJobs.map((job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Card className="pixel-card p-12 text-center">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-lg font-semibold mb-2">No se encontraron trabajos</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || selectedCategory !== 'all' || selectedType !== 'all'
                ? 'Intenta ajustar los filtros o buscar con otros términos'
                : 'No hay trabajos publicados en este momento'}
            </p>
            <Button variant="outline" onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
              setSelectedType('all');
            }}>
              Limpiar filtros
            </Button>
          </Card>
        )}

        {/* CTA Section */}
        <Card className="pixel-card mt-12 bg-gradient-to-r from-primary/10 via-purple-500/10 to-blue-500/10 border-primary/20 overflow-hidden">
          <CardContent className="p-8 text-center relative">
            <div className="absolute top-4 right-4 animate-bounce">
              <PixelBriefcase size={40} className="text-primary" />
            </div>
            <div className="absolute bottom-4 left-4 animate-pulse">
              <PixelRocket size={32} className="text-purple-500" />
            </div>
            <h3 className="text-2xl font-bold mb-2 pixel-text">¿Tienes una vacante Web3?</h3>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              Publica tu oferta de trabajo y conecta con el mejor talento blockchain de México.
              Llegamos a miles de desarrolladores, diseñadores y profesionales crypto.
            </p>
            <Button asChild size="lg" className="pixel-button bg-gradient-to-r from-primary to-purple-500">
              <Link to="/user/trabajos/nuevo">
                <PixelBriefcase size={20} className="mr-2" />
                Publicar Trabajo
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Job Card Component
function JobCard({ job, featured = false }: { job: Job; featured?: boolean }) {
  const getTypeColor = (type: Job['job_type']) => {
    switch (type) {
      case 'remote': return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'hybrid': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'onsite': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    }
  };

  const getTypeLabel = (type: Job['job_type']) => {
    switch (type) {
      case 'remote': return '🌎 Remoto';
      case 'hybrid': return '🏢 Híbrido';
      case 'onsite': return '📍 Presencial';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    return `Hace ${Math.floor(diffDays / 30)} meses`;
  };

  const formatSalary = (job: Job) => {
    if (!job.salary_min && !job.salary_max) return null;
    const currency = job.salary_currency || 'USD';
    if (job.salary_min && job.salary_max) {
      return `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()} ${currency}`;
    }
    if (job.salary_min) return `Desde $${job.salary_min.toLocaleString()} ${currency}`;
    if (job.salary_max) return `Hasta $${job.salary_max.toLocaleString()} ${currency}`;
    return null;
  };

  return (
    <Card className={`pixel-card hover:shadow-lg transition-all hover:-translate-y-1 ${featured ? 'border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-transparent' : ''}`}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Company Logo */}
          <div className="flex-shrink-0">
            {job.company_logo ? (
              <img
                src={job.company_logo}
                alt={job.company}
                className="w-14 h-14 rounded-lg object-cover pixel-border"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center pixel-border">
                <PixelBuilding size={28} className="text-primary" />
              </div>
            )}
          </div>

          {/* Job Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold">{job.title}</h3>
              {featured && (
                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                  <PixelZap size={12} className="mr-1" /> Destacado
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-3">
              <span className="font-medium text-foreground">{job.company}</span>
              <span className="flex items-center gap-1">
                <PixelMapPin size={14} />
                {job.location}
              </span>
              <Badge variant="outline" className={getTypeColor(job.job_type)}>
                {getTypeLabel(job.job_type)}
              </Badge>
            </div>

            {job.tags && job.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {job.tags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {job.tags.length > 4 && (
                  <Badge variant="secondary" className="text-xs">
                    +{job.tags.length - 4}
                  </Badge>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {formatSalary(job) && (
                <span className="flex items-center gap-1 text-green-600 font-medium">
                  <PixelDollar size={16} />
                  {formatSalary(job)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <PixelUsers size={16} />
                {job.experience_level}
              </span>
              <span className="flex items-center gap-1">
                <PixelClock size={16} />
                {formatDate(job.created_at)}
              </span>
            </div>
          </div>

          {/* Apply Button */}
          <div className="flex-shrink-0">
            <Button asChild className="w-full md:w-auto pixel-button">
              <a href={job.apply_url} target="_blank" rel="noopener noreferrer">
                Aplicar
                <PixelExternalLink size={16} className="ml-2" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
