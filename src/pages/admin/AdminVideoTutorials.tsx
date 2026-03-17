import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Youtube,
  Play,
  Star,
  Clock,
  RefreshCw,
  ExternalLink,
  GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  videoTutorialsService,
  VideoTutorial,
  VideoFormData,
  VideoCategory,
  VideoLevel,
  VideoStatus,
  getYoutubeThumbnail,
  extractYoutubeId,
} from '@/services/videoTutorials.service';

const CATEGORIES: { value: VideoCategory; label: string; emoji: string }[] = [
  { value: 'defi', label: 'DeFi', emoji: '💰' },
  { value: 'defai', label: 'DeFAI', emoji: '🤖' },
  { value: 'blockchain', label: 'Blockchain', emoji: '🔗' },
  { value: 'trading', label: 'Trading', emoji: '📈' },
  { value: 'nft', label: 'NFTs', emoji: '🎨' },
  { value: 'fintech', label: 'Fintech', emoji: '🏦' },
  { value: 'general', label: 'General', emoji: '📖' },
];

const LEVELS: { value: VideoLevel; label: string }[] = [
  { value: 'Principiante', label: 'Principiante' },
  { value: 'Intermedio', label: 'Intermedio' },
  { value: 'Avanzado', label: 'Avanzado' },
];

const STATUSES: { value: VideoStatus; label: string; color: string }[] = [
  { value: 'published', label: 'Publicado', color: 'bg-green-500' },
  { value: 'draft', label: 'Borrador', color: 'bg-yellow-500' },
  { value: 'archived', label: 'Archivado', color: 'bg-gray-500' },
];

const emptyFormData: VideoFormData = {
  title: '',
  description: '',
  youtube_url: '',
  thumbnail_url: '',
  duration: '',
  category: 'defi',
  level: 'Principiante',
  instructor: 'DeFi México',
  tags: [],
  status: 'draft',
  featured: false,
  order_index: 0,
};

const AdminVideoTutorials = () => {
  const [videos, setVideos] = useState<VideoTutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VideoStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<VideoCategory | 'all'>('all');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoTutorial | null>(null);
  const [formData, setFormData] = useState<VideoFormData>(emptyFormData);
  const [saving, setSaving] = useState(false);
  const [tagsInput, setTagsInput] = useState('');

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<VideoTutorial | null>(null);

  // Preview
  const [previewId, setPreviewId] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState<{
    totalVideos: number;
    publishedVideos: number;
    featuredVideos: number;
    totalViews: number;
  } | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    const { data, total: totalCount, error } = await videoTutorialsService.getVideos({
      page,
      pageSize: 10,
      search,
      status: statusFilter === 'all' ? undefined : statusFilter,
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      sortBy: 'order_index',
      sortOrder: 'asc',
    });

    if (!error && data) {
      setVideos(data);
      setTotal(totalCount);
    } else {
      toast.error('Error al cargar videos');
    }
    setLoading(false);
  }, [page, search, statusFilter, categoryFilter]);

  const fetchStats = async () => {
    const { data } = await videoTutorialsService.getVideoStats();
    if (data) {
      setStats(data);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  useEffect(() => {
    fetchStats();
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchVideos();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleOpenModal = (video?: VideoTutorial) => {
    if (video) {
      setEditingVideo(video);
      setFormData({
        title: video.title,
        description: video.description,
        youtube_url: video.youtube_url,
        thumbnail_url: video.thumbnail_url || '',
        duration: video.duration,
        category: video.category,
        level: video.level,
        instructor: video.instructor,
        tags: video.tags,
        status: video.status,
        featured: video.featured,
        order_index: video.order_index,
      });
      setTagsInput(video.tags.join(', '));
    } else {
      setEditingVideo(null);
      setFormData({ ...emptyFormData, order_index: total + 1 });
      setTagsInput('');
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingVideo(null);
    setFormData(emptyFormData);
    setTagsInput('');
    setPreviewId(null);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.youtube_url || !formData.duration) {
      toast.error('Por favor completa los campos requeridos');
      return;
    }

    setSaving(true);

    // Parse tags from input
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const dataToSave = { ...formData, tags };

    try {
      if (editingVideo) {
        const { error } = await videoTutorialsService.updateVideo(editingVideo.id, dataToSave);
        if (error) throw error;
        toast.success('Video actualizado correctamente');
      } else {
        const { error } = await videoTutorialsService.createVideo(dataToSave);
        if (error) throw error;
        toast.success('Video creado correctamente');
      }

      handleCloseModal();
      fetchVideos();
      fetchStats();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar el video');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!videoToDelete) return;

    const { error } = await videoTutorialsService.deleteVideo(videoToDelete.id);

    if (error) {
      toast.error('Error al eliminar el video');
    } else {
      toast.success('Video eliminado correctamente');
      fetchVideos();
      fetchStats();
    }

    setDeleteDialogOpen(false);
    setVideoToDelete(null);
  };

  const handleToggleStatus = async (video: VideoTutorial) => {
    const newStatus: VideoStatus = video.status === 'published' ? 'draft' : 'published';
    const { error } = await videoTutorialsService.updateVideoStatus(video.id, newStatus);

    if (error) {
      toast.error('Error al cambiar el estado');
    } else {
      toast.success(`Video ${newStatus === 'published' ? 'publicado' : 'despublicado'}`);
      fetchVideos();
      fetchStats();
    }
  };

  const handleToggleFeatured = async (video: VideoTutorial) => {
    const { error } = await videoTutorialsService.toggleVideoFeatured(video.id, !video.featured);

    if (error) {
      toast.error('Error al cambiar destacado');
    } else {
      toast.success(video.featured ? 'Video quitado de destacados' : 'Video destacado');
      fetchVideos();
      fetchStats();
    }
  };

  // Update preview when URL changes
  useEffect(() => {
    if (formData.youtube_url) {
      setPreviewId(extractYoutubeId(formData.youtube_url));
    } else {
      setPreviewId(null);
    }
  }, [formData.youtube_url]);

  const totalPages = Math.ceil(total / 10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Youtube className="w-6 h-6 text-red-500" />
            Video Tutoriales
          </h1>
          <p className="text-muted-foreground">
            Gestiona los videos educativos de la academia
          </p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Video
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.totalVideos}</div>
              <p className="text-xs text-muted-foreground">Total Videos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-500">{stats.publishedVideos}</div>
              <p className="text-xs text-muted-foreground">Publicados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-500">{stats.featuredVideos}</div>
              <p className="text-xs text-muted-foreground">Destacados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-500">{stats.totalViews.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Vistas Totales</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar videos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as VideoStatus | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                setCategoryFilter(v as VideoCategory | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.emoji} {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchVideos}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Videos Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="p-12 text-center">
              <Youtube className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="font-semibold mb-2">No hay videos</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search || statusFilter !== 'all' || categoryFilter !== 'all'
                  ? 'No se encontraron videos con esos filtros'
                  : 'Crea tu primer video tutorial'}
              </p>
              {!search && statusFilter === 'all' && categoryFilter === 'all' && (
                <Button onClick={() => handleOpenModal()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Video
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Video</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Vistas</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videos.map((video, index) => (
                  <TableRow key={video.id}>
                    <TableCell className="font-mono text-muted-foreground">
                      {video.order_index || index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative w-24 h-14 rounded overflow-hidden flex-shrink-0">
                          <img
                            src={video.thumbnail_url || getYoutubeThumbnail(video.youtube_id, 'medium')}
                            alt={video.title}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <Play className="w-6 h-6 text-white" />
                          </div>
                          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
                            {video.duration}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm line-clamp-1 flex items-center gap-1">
                            {video.title}
                            {video.featured && (
                              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {video.instructor}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {CATEGORIES.find((c) => c.value === video.category)?.emoji}{' '}
                        {CATEGORIES.find((c) => c.value === video.category)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          video.level === 'Principiante'
                            ? 'bg-green-100 text-green-800'
                            : video.level === 'Intermedio'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }
                      >
                        {video.level}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          video.status === 'published'
                            ? 'bg-green-500'
                            : video.status === 'draft'
                            ? 'bg-yellow-500'
                            : 'bg-gray-500'
                        }
                      >
                        {STATUSES.find((s) => s.value === video.status)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {video.views_count.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleStatus(video)}
                          title={video.status === 'published' ? 'Despublicar' : 'Publicar'}
                        >
                          {video.status === 'published' ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleFeatured(video)}
                          title={video.featured ? 'Quitar de destacados' : 'Destacar'}
                        >
                          <Star
                            className={`w-4 h-4 ${
                              video.featured ? 'text-yellow-500 fill-yellow-500' : ''
                            }`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenModal(video)}
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          title="Ver en YouTube"
                        >
                          <a
                            href={video.youtube_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setVideoToDelete(video);
                            setDeleteDialogOpen(true);
                          }}
                          title="Eliminar"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {(page - 1) * 10 + 1} - {Math.min(page * 10, total)} de {total} videos
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={handleCloseModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingVideo ? 'Editar Video' : 'Nuevo Video Tutorial'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* YouTube URL with Preview */}
            <div className="space-y-2">
              <Label htmlFor="youtube_url">URL de YouTube *</Label>
              <Input
                id="youtube_url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={formData.youtube_url}
                onChange={(e) =>
                  setFormData({ ...formData, youtube_url: e.target.value })
                }
              />
              {previewId && (
                <div className="aspect-video w-full max-w-md rounded overflow-hidden bg-muted">
                  <img
                    src={getYoutubeThumbnail(previewId, 'high')}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                placeholder="Título del video"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descripción *</Label>
              <Textarea
                id="description"
                placeholder="Descripción del video..."
                rows={3}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            {/* Duration & Instructor */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration">Duración *</Label>
                <Input
                  id="duration"
                  placeholder="10:30"
                  value={formData.duration}
                  onChange={(e) =>
                    setFormData({ ...formData, duration: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instructor">Instructor *</Label>
                <Input
                  id="instructor"
                  placeholder="DeFi México"
                  value={formData.instructor}
                  onChange={(e) =>
                    setFormData({ ...formData, instructor: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Category & Level */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoría *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) =>
                    setFormData({ ...formData, category: v as VideoCategory })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.emoji} {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nivel *</Label>
                <Select
                  value={formData.level}
                  onValueChange={(v) =>
                    setFormData({ ...formData, level: v as VideoLevel })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (separados por coma)</Label>
              <Input
                id="tags"
                placeholder="defi, tutorial, uniswap"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>

            {/* Thumbnail URL (optional) */}
            <div className="space-y-2">
              <Label htmlFor="thumbnail_url">URL de Thumbnail (opcional)</Label>
              <Input
                id="thumbnail_url"
                placeholder="Dejar vacío para usar el de YouTube"
                value={formData.thumbnail_url}
                onChange={(e) =>
                  setFormData({ ...formData, thumbnail_url: e.target.value })
                }
              />
            </div>

            {/* Status & Featured */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) =>
                    setFormData({ ...formData, status: v as VideoStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="order">Orden</Label>
                <Input
                  id="order"
                  type="number"
                  min="0"
                  value={formData.order_index || 0}
                  onChange={(e) =>
                    setFormData({ ...formData, order_index: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            {/* Featured checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="featured"
                checked={formData.featured}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, featured: checked as boolean })
                }
              />
              <Label htmlFor="featured" className="cursor-pointer">
                Video destacado
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingVideo ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar video?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El video "{videoToDelete?.title}" será
              eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminVideoTutorials;
