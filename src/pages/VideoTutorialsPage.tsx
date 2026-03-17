import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Play,
  Search,
  Clock,
  Eye,
  GraduationCap,
  Filter,
  X,
  Youtube,
  Star,
  ChevronLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  videoTutorialsService,
  VideoTutorial,
  VideoCategory,
  VideoLevel,
  getYoutubeThumbnail,
} from '@/services/videoTutorials.service';

const CATEGORIES: { value: VideoCategory | 'all'; label: string; emoji: string }[] = [
  { value: 'all', label: 'Todos', emoji: '📚' },
  { value: 'defi', label: 'DeFi', emoji: '💰' },
  { value: 'defai', label: 'DeFAI', emoji: '🤖' },
  { value: 'blockchain', label: 'Blockchain', emoji: '🔗' },
  { value: 'trading', label: 'Trading', emoji: '📈' },
  { value: 'nft', label: 'NFTs', emoji: '🎨' },
  { value: 'fintech', label: 'Fintech', emoji: '🏦' },
  { value: 'general', label: 'General', emoji: '📖' },
];

const LEVELS: { value: VideoLevel | 'all'; label: string; color: string }[] = [
  { value: 'all', label: 'Todos los niveles', color: 'bg-gray-500' },
  { value: 'Principiante', label: 'Principiante', color: 'bg-green-500' },
  { value: 'Intermedio', label: 'Intermedio', color: 'bg-yellow-500' },
  { value: 'Avanzado', label: 'Avanzado', color: 'bg-red-500' },
];

const VideoCard = ({
  video,
  onPlay,
}: {
  video: VideoTutorial;
  onPlay: (video: VideoTutorial) => void;
}) => {
  const thumbnail = video.thumbnail_url || getYoutubeThumbnail(video.youtube_id, 'high');
  const levelColor = LEVELS.find(l => l.value === video.level)?.color || 'bg-gray-500';

  return (
    <Card
      className="group overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
      onClick={() => onPlay(video)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden">
        <img
          src={thumbnail}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            (e.target as HTMLImageElement).src = getYoutubeThumbnail(video.youtube_id, 'medium');
          }}
        />
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center">
            <Play className="w-8 h-8 text-white fill-white ml-1" />
          </div>
        </div>
        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
          {video.duration}
        </div>
        {/* Featured badge */}
        {video.featured && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-yellow-500 text-black">
              <Star className="w-3 h-3 mr-1 fill-current" />
              Destacado
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
            {video.title}
          </h3>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">
          {video.description}
        </p>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${levelColor} text-white border-0 text-[10px]`}>
              {video.level}
            </Badge>
            <span className="text-muted-foreground">
              {CATEGORIES.find(c => c.value === video.category)?.emoji}{' '}
              {CATEGORIES.find(c => c.value === video.category)?.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {video.views_count.toLocaleString()}
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Por <span className="font-medium">{video.instructor}</span>
        </div>
      </div>
    </Card>
  );
};

const VideoPlayer = ({
  video,
  open,
  onClose,
}: {
  video: VideoTutorial | null;
  open: boolean;
  onClose: () => void;
}) => {
  useEffect(() => {
    if (video && open) {
      // Incrementar vistas cuando se abre el video
      videoTutorialsService.incrementViews(video.id);
    }
  }, [video, open]);

  if (!video) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-start gap-3">
            <Youtube className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2">{video.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="aspect-video w-full">
          <iframe
            src={`https://www.youtube.com/embed/${video.youtube_id}?autoplay=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>

        <div className="p-4 space-y-3 border-t">
          <p className="text-sm text-muted-foreground">{video.description}</p>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <Clock className="w-3 h-3 mr-1" />
              {video.duration}
            </Badge>
            <Badge variant="outline">
              <GraduationCap className="w-3 h-3 mr-1" />
              {video.level}
            </Badge>
            <Badge variant="outline">
              {CATEGORIES.find(c => c.value === video.category)?.emoji}{' '}
              {CATEGORIES.find(c => c.value === video.category)?.label}
            </Badge>
            <Badge variant="outline">
              <Eye className="w-3 h-3 mr-1" />
              {video.views_count.toLocaleString()} vistas
            </Badge>
          </div>

          {video.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {video.tags.map((tag, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          <p className="text-sm">
            Por <span className="font-semibold">{video.instructor}</span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const VideoTutorialsPage = () => {
  const [videos, setVideos] = useState<VideoTutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<VideoCategory | 'all'>('all');
  const [level, setLevel] = useState<VideoLevel | 'all'>('all');
  const [selectedVideo, setSelectedVideo] = useState<VideoTutorial | null>(null);
  const [totalVideos, setTotalVideos] = useState(0);

  const fetchVideos = async () => {
    setLoading(true);
    const { data, total, error } = await videoTutorialsService.getPublishedVideos({
      search,
      category: category === 'all' ? undefined : category,
      level: level === 'all' ? undefined : level,
      pageSize: 50,
    });

    if (!error && data) {
      setVideos(data);
      setTotalVideos(total);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchVideos();
  }, [search, category, level]);

  const clearFilters = () => {
    setSearch('');
    setCategory('all');
    setLevel('all');
  };

  const hasActiveFilters = search || category !== 'all' || level !== 'all';

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        {/* Hero Section */}
        <section className="relative py-16 px-4 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-purple-500/5 to-pink-500/5" />
          <div className="container mx-auto relative">
            <Link
              to="/"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Volver al Inicio
            </Link>

            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
                <Youtube className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold">Video Tutoriales</h1>
                <p className="text-muted-foreground">
                  Aprende DeFi con nuestros videos educativos
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Play className="w-4 h-4" />
                {totalVideos} videos disponibles
              </span>
            </div>
          </div>
        </section>

        {/* Filters Section */}
        <section className="sticky top-16 z-30 bg-background/95 backdrop-blur border-b py-4">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar videos..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Category Filter */}
              <Select value={category} onValueChange={(v) => setCategory(v as VideoCategory | 'all')}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.emoji} {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Level Filter */}
              <Select value={level} onValueChange={(v) => setLevel(v as VideoLevel | 'all')}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Nivel" />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((lvl) => (
                    <SelectItem key={lvl.value} value={lvl.value}>
                      {lvl.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Videos Grid */}
        <section className="py-8 px-4">
          <div className="container mx-auto">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[...Array(8)].map((_, i) => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="aspect-video" />
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-16">
                <Youtube className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No se encontraron videos</h3>
                <p className="text-muted-foreground mb-4">
                  {hasActiveFilters
                    ? 'Intenta con otros filtros de búsqueda'
                    : 'Pronto agregaremos más contenido'}
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {videos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    onPlay={setSelectedVideo}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

      {/* Video Player Modal */}
      <VideoPlayer
        video={selectedVideo}
        open={!!selectedVideo}
        onClose={() => setSelectedVideo(null)}
      />
    </div>
  );
};

export default VideoTutorialsPage;

