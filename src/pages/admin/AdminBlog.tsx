// src/pages/admin/AdminBlog.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { blogService } from '@/services/blog.service';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Pencil, Trash2, Search, X, FileText, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ImportJSONButton from '@/components/admin/ImportJSONButton';
import { IMPORT_PROMPTS } from '@/constants/importPrompts';

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

// Debounce hook
function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// Compact pagination range (max 5)
function visiblePages(total: number, current: number): number[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, 5];
  if (current >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total];
  return [current - 2, current - 1, current, current + 1, current + 2];
}

// Modal simple
function AdminModal({ 
  open, 
  title, 
  onClose, 
  children 
}: { 
  open: boolean; 
  title: string; 
  onClose: () => void; 
  children: React.ReactNode; 
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && ref.current) {
      ref.current.focus();
    }
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, y: 10, scale: 0.98 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }} 
        exit={{ opacity: 0, y: 10, scale: 0.98 }} 
        className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50"
        onClick={onClose}
      >
        <div 
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="admin-blog-title" 
          className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-6 relative" 
          onClick={(e) => e.stopPropagation()} 
          onKeyDown={onKeyDown} 
          ref={ref}
          tabIndex={-1}
        >
          <button 
            onClick={onClose} 
            className="absolute right-3 top-3 p-2 rounded hover:bg-muted transition-colors" 
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
          <h3 id="admin-blog-title" className="text-xl font-semibold mb-6">
            {title}
          </h3>
          {children}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

// Helper para generar slug
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ──────────────────────────────────────────────────────────────────────────────
// AdminBlog Component
// ──────────────────────────────────────────────────────────────────────────────
export default function AdminBlog() {
  const { isAdmin } = useAuth(); // Para verificar permisos de administrador
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPage = Number(searchParams.get('page') ?? '1') || 1;
  const initialQ = searchParams.get('q') ?? '';
  const initialStatus = searchParams.get('status') ?? 'all';

  const [page, setPage] = useState(initialPage);
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState<'all' | 'published' | 'draft' | 'review'>(initialStatus as any);

  const debouncedQ = useDebouncedValue(q, 300);

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totalPosts, setTotalPosts] = useState(0);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  // Form state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    category: '',
    tags: '',
    featured_image: '',
    status: 'draft' as 'draft' | 'review' | 'scheduled' | 'published' | 'archived',
    is_featured: false,
    allow_comments: true,
  });

  // Categorías disponibles según el constraint de la DB
  const availableCategories = [
    { id: 'noticias', label: 'Noticias' },
    { id: 'guias', label: 'Guías' }, 
    { id: 'tutoriales', label: 'Tutoriales' },
    { id: 'analisis', label: 'Análisis' },
    { id: 'opinion', label: 'Opinión' },
    { id: 'entrevistas', label: 'Entrevistas' },
    { id: 'reportes', label: 'Reportes' },
    { id: 'educacion', label: 'Educación' },
    { id: 'regulacion', label: 'Regulación' },
    { id: 'tecnologia', label: 'Tecnología' }
  ];

  const selectCategory = (categoryId: string) => {
    setForm(prev => ({ ...prev, category: categoryId }));
  };

  const clearCategory = () => {
    setForm(prev => ({ ...prev, category: '' }));
  };

  // Funciones de aprobación (solo para administradores)
  const approvePost = async (postId: string) => {
    if (!isAdmin()) return;
    
    try {
      await blogService.updatePost(postId, { status: 'published' });
      console.log('✅ Post approved and published');
      await load();
    } catch (err) {
      console.error('💥 Error approving post:', err);
      alert('No se pudo aprobar el post');
    }
  };

  const rejectPost = async (postId: string) => {
    if (!isAdmin()) return;

    try {
      await blogService.updatePost(postId, { status: 'draft' });
      console.log('✅ Post rejected and returned to draft');
      await load();
    } catch (err) {
      console.error('💥 Error rejecting post:', err);
      alert('No se pudo rechazar el post');
    }
  };

  // Función de importación JSON
  const handleImportBlogPosts = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data)) {
      throw new Error("El JSON debe ser un array de artículos");
    }

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const post of data) {
      try {
        if (!post.title) {
          throw new Error("Falta el campo 'title'");
        }

        const slug = post.slug || generateSlug(post.title);

        await blogService.createPost({
          title: post.title,
          slug,
          excerpt: post.excerpt || null,
          content: post.content || '',
          category: post.category || 'other',
          tags: post.tags || [],
          featured_image: post.image_url || null,
          status: post.is_published ? 'published' : 'draft',
          is_featured: post.is_featured || false,
          author_id: post.author_id || null,
          reading_time: post.reading_time || null,
          meta_description: post.meta_description || null,
          meta_keywords: post.meta_keywords || null,
        });

        successCount++;
      } catch (error: any) {
        failedCount++;
        errors.push(`${post.title || "Unknown"}: ${error.message}`);
      }
    }

    await load();
    return { success: successCount, failed: failedCount, errors };
  };

  const fetchToken = useRef(0);
  
  // Actualizar URL cuando cambien los filtros
  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', page.toString());
    if (debouncedQ) params.set('q', debouncedQ);
    if (status !== 'all') params.set('status', status);
    
    const newSearch = params.toString();
    if (newSearch !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [page, debouncedQ, status, setSearchParams, searchParams]);

  const load = useCallback(async () => {
    setLoading(true); 
    setError(null);
    const token = ++fetchToken.current;
    
    try {
      console.log('🔄 Loading posts with filters:', { status, search: debouncedQ });
      
      const filters: any = {};
      if (debouncedQ) filters.search = debouncedQ;
      
      // CLAVE: Ajustar el filtro para que coincida con el esquema real
      if (status === 'published') {
        filters.status = 'published';
      } else if (status === 'draft') {
        filters.status = 'draft';
      } else if (status === 'review') {
        filters.status = 'review';
      }
      // Si status === 'all', no agregamos filtro (obtiene todos)

      const response = await blogService.getPosts(1, 50, filters); // Página 1, límite alto para obtener todos
      
      console.log('📊 Response from blogService:', response);
      
      // Verificar si este fetch sigue siendo relevante
      if (token === fetchToken.current) {
        if (response && response.data) {
          console.log('✅ Posts cargados:', response.data.length);
          setData(response.data);
          setTotalPosts(response.data.length);
        } else {
          console.log('❌ No se encontraron posts o error');
          setError('Error al cargar los posts');
          setData([]);
          setTotalPosts(0);
        }
      }
    } catch (err) {
      console.error('💥 Error al cargar posts:', err);
      if (token === fetchToken.current) {
        setError(err instanceof Error ? err.message : 'Error inesperado');
        setData([]);
        setTotalPosts(0);
      }
    } finally {
      if (token === fetchToken.current) {
        setLoading(false);
      }
    }
  }, [debouncedQ, status]);

  useEffect(() => {
    load();
  }, [load]);

  // Resetear página cuando cambien los filtros
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status]);

  const openNew = () => {
    setEditing(null);
    setForm({
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      category: '',
      tags: '',
      featured_image: '',
      status: 'draft',
      is_featured: false,
      allow_comments: true,
    });
    setOpen(true);
  };

  const openEdit = (post: any) => {
    setEditing(post);
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || '',
      content: post.content,
      category: post.category || '',
      tags: post.tags?.join(', ') || '',
      featured_image: post.featured_image || post.image_url || '',
      status: post.status,
      is_featured: post.is_featured || false,
      allow_comments: post.allow_comments !== false, // Default true si no está definido
    });
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditing(null);
    setForm({
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      category: '',
      tags: '',
      featured_image: '',
      status: 'draft',
      is_featured: false,
      allow_comments: true,
    });
  };

  // Auto-generar slug cuando cambie el título
  useEffect(() => {
    if (form.title && !editing) {
      const autoSlug = generateSlug(form.title);
      setForm(f => ({ ...f, slug: autoSlug }));
    }
  }, [form.title, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.title.trim()) {
      alert('El título es requerido');
      return;
    }

    // Si es un editor (no admin) y quiere publicar, enviar a revisión
    let finalStatus = form.status;
    if (form.status === 'published' && !isAdmin()) {
      finalStatus = 'review';
      console.log('📝 Editor enviando a revisión en lugar de publicar directamente');
    }

    const payload: any = {
      title: form.title.trim(),
      slug: form.slug.trim() || generateSlug(form.title),
      excerpt: form.excerpt.trim(),
      content: form.content.trim(),
      category: form.category && form.category.trim() !== '' ? form.category.trim() : null,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      featured_image: form.featured_image.trim() || null,
      status: finalStatus,
      is_featured: form.is_featured,
      allow_comments: form.allow_comments,
      // No incluir 'published' ya que no existe esa columna
      image_url: form.featured_image.trim() || null,
    };

    console.log('📝 Submitting payload:', payload);

    setIsSubmitting(true);
    
    try {
      if (editing) {
        await blogService.updatePost(editing.id, payload);
        console.log('✅ Post updated');
      } else {
        await blogService.createPost(payload);
        console.log('✅ Post created');
      }
      setOpen(false);
      await load();
    } catch (err: any) {
      console.error('💥 Submit error:', err);

      // Mensaje de error más descriptivo
      let errorMessage = 'Error al guardar el post:\n\n';

      if (err?.message?.includes('Row level security')) {
        errorMessage += '❌ No tienes permisos para realizar esta acción.\n';
        errorMessage += 'Contacta al administrador para obtener los permisos necesarios.';
      } else if (err?.message?.includes('duplicate key')) {
        errorMessage += '❌ Ya existe un post con ese slug.\n';
        errorMessage += 'Intenta con un título diferente.';
      } else if (err?.code === 'PGRST301') {
        errorMessage += '❌ No estás autenticado.\n';
        errorMessage += 'Por favor, inicia sesión nuevamente.';
      } else {
        errorMessage += err?.message || 'Error desconocido';
        errorMessage += '\n\nRevisa la consola para más detalles.';
      }

      alert(errorMessage);
      console.error('Detalles del error:', {
        error: err,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (post: any) => {
    if (!confirm(`¿Eliminar "${post.title}"?`)) return;
    
    try {
      await blogService.deletePost(post.id);
      console.log('✅ Post deleted');
      await load();
    } catch (err) {
      console.error('💥 Delete error:', err);
      alert('No se pudo eliminar');
    }
  };

  const togglePublished = async (post: any) => {
    try {
      const newStatus = post.status === 'published' ? 'draft' : 'published';
      await blogService.updatePost(post.id, { 
        status: newStatus
      });
      console.log(`✅ Post status changed to: ${newStatus}`);
      await load();
    } catch (err) {
      console.error('💥 Toggle status error:', err);
      alert('No se pudo actualizar el estado');
    }
  };

  // Funciones de aprobación (solo para administradores)
  const handleApprove = async (post: any) => {
    if (!isAdmin()) {
      alert('Solo los administradores pueden aprobar posts');
      return;
    }

    try {
      await blogService.approvePost(post.id);
      console.log('✅ Post aprovado');
      await load();
    } catch (err) {
      console.error('💥 Approve error:', err);
      alert('No se pudo aprobar el post');
    }
  };

  const handleReject = async (post: any) => {
    if (!isAdmin()) {
      alert('Solo los administradores pueden rechazar posts');
      return;
    }

    const reason = prompt('Razón del rechazo (opcional):');

    try {
      await blogService.rejectPost(post.id, reason || undefined);
      console.log('✅ Post rechazado');
      await load();
    } catch (err) {
      console.error('💥 Reject error:', err);
      alert('No se pudo rechazar el post');
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedItems(
      selectedItems.length === paginatedData.length
        ? []
        : paginatedData.map(item => item.id)
    );
  };

  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selectedItems.length} items seleccionados?`)) return;

    try {
      await Promise.all(
        selectedItems.map(id => blogService.deletePost(id))
      );

      alert(`${selectedItems.length} items eliminados`);
      setSelectedItems([]);
      load();
    } catch (error) {
      console.error("Error bulk deleting:", error);
      alert("Error al eliminar los items");
    }
  };

  // Calcular estadísticas
  const stats = useMemo(() => {
    const published = data.filter(p => p.status === 'published').length;
    const drafts = data.filter(p => p.status === 'draft').length;
    const review = data.filter(p => p.status === 'review').length;
    return { total: data.length, published, drafts, review };
  }, [data]);

  // Paginación en frontend
  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const paginatedData = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <h2 className="text-2xl font-bold">Posts del Blog</h2>
          <p className="text-sm text-muted-foreground">
            Gestiona el contenido, estado y metadatos de los artículos
          </p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título..."
              className="pl-10 w-64"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={status}
            onChange={(e) => {
              console.log('🔄 Changing filter to:', e.target.value);
              setStatus(e.target.value as any);
            }}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            aria-label="Filtro de estado"
          >
            <option value="all">Todos ({stats.total})</option>
            <option value="published">Publicados ({stats.published})</option>
            <option value="draft">Borradores ({stats.drafts})</option>
            <option value="review">En Revisión ({stats.review})</option>
          </select>

          {/* Import and New Post Buttons */}
          <div className="flex gap-2">
            {isAdmin() && (
              <ImportJSONButton
                onImport={handleImportBlogPosts}
                promptSuggestion={IMPORT_PROMPTS.blog}
                entityName="Artículos"
              />
            )}
            <Button onClick={openNew} className="inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Nuevo post
            </Button>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Total Posts</span>
          </div>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        
        <div className="bg-card p-4 rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium">Publicados</span>
          </div>
          <p className="text-2xl font-bold">{stats.published}</p>
        </div>
        
        <div className="bg-card p-4 rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <EyeOff className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium">Borradores</span>
          </div>
          <p className="text-2xl font-bold">{stats.drafts}</p>
        </div>

        <div className="bg-card p-4 rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-medium">En Revisión</span>
          </div>
          <p className="text-2xl font-bold">{stats.review}</p>
        </div>
      </div>

      {/* Results count and bulk actions */}
      <div className="bg-card p-4 rounded-lg border">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selectedItems.length === paginatedData.length && paginatedData.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-muted-foreground">
              {paginatedData.length} item{paginatedData.length !== 1 ? 's' : ''} encontrado{paginatedData.length !== 1 ? 's' : ''}
            </span>
          </div>

          {selectedItems.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedItems.length} seleccionado{selectedItems.length !== 1 ? 's' : ''}
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-muted p-3 rounded text-xs">
          <strong>Debug:</strong> Status: {status}, Posts: {data.length}, Loading: {loading.toString()}
          {data.length > 0 && (
            <div>Posts status: {data.map(p => p.status).join(', ')}</div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="relative" aria-busy={loading}>
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-background/50 z-10">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {error && (
          <div className="border border-destructive/30 bg-destructive/5 text-destructive p-4 rounded-lg">
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!error && (
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium w-12">
                    <Checkbox
                      checked={selectedItems.length === paginatedData.length && paginatedData.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Título</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-left px-4 py-3 font-medium">Categoría</th>
                  <th className="text-left px-4 py-3 font-medium">Tags</th>
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-right px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((post) => {
                  const isSelected = selectedItems.includes(post.id);

                  return (
                    <tr key={post.id} className={`border-t hover:bg-muted/50 transition-colors ${isSelected ? "bg-muted/50" : ""}`}>
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleItemSelection(post.id)}
                        />
                      </td>
                    <td className="px-4 py-3">
                      <div>
                        <Link 
                          to={`/blog/${post.slug}`} 
                          className="font-medium hover:underline hover:text-primary transition-colors"
                          target="_blank"
                        >
                          {post.title}
                        </Link>
                        {post.excerpt && (
                          <p className="text-muted-foreground text-xs mt-1 line-clamp-1">
                            {post.excerpt}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => togglePublished(post)}
                        className="cursor-pointer"
                        disabled={post.status === 'review'}
                      >
                        <Badge 
                          variant={
                            post.status === 'published' ? 'default' : 
                            post.status === 'review' ? 'outline' : 
                            'secondary'
                          }
                          className={
                            post.status === 'review' ? 'border-orange-500 text-orange-600' : ''
                          }
                        >
                          {post.status === 'published' ? 'Publicado' : 
                           post.status === 'review' ? 'En Revisión' : 
                           'Borrador'}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-muted-foreground">
                        {post.category || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(post.tags || []).slice(0, 2).map((tag, idx) => (
                          <span key={idx} className="px-1 py-0.5 bg-muted text-xs rounded">
                            {tag}
                          </span>
                        ))}
                        {(post.tags?.length || 0) > 2 && (
                          <span className="text-xs text-muted-foreground">
                            +{(post.tags?.length || 0) - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-muted-foreground text-xs">
                        {new Date(post.published_at || post.created_at).toLocaleDateString('es-MX')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Botones de aprobación (solo para admins y posts en revisión) */}
                        {post.status === 'review' && isAdmin() && (
                          <>
                            <button
                              onClick={() => handleApprove(post)}
                              className="p-1 hover:bg-green-100 rounded transition-colors text-green-600"
                              title="Aprobar"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => handleReject(post)}
                              className="p-1 hover:bg-red-100 rounded transition-colors text-red-600"
                              title="Rechazar"
                            >
                              ✗
                            </button>
                          </>
                        )}
                        
                        <button
                          onClick={() => openEdit(post)}
                          className="p-1 hover:bg-muted rounded transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(post)}
                          className="p-1 hover:bg-muted rounded text-destructive transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
                {paginatedData.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      {q || status !== 'all' 
                        ? 'No se encontraron posts con los filtros aplicados'
                        : 'No hay posts creados aún'
                      }
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} ({data.length} post{data.length !== 1 ? 's' : ''} total{data.length !== 1 ? 'es' : ''})
          </p>
          
          <div className="flex items-center gap-1">
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page === 1} 
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            
            {visiblePages(totalPages, page).map((n) => (
              <Button 
                key={n} 
                variant={n === page ? 'default' : 'outline'} 
                size="sm" 
                onClick={() => setPage(n)} 
                className="w-10"
              >
                {n}
              </Button>
            ))}
            
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page === totalPages} 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <AdminModal 
        open={open} 
        title={editing ? `Editar: ${editing.title}` : 'Nuevo post'} 
        onClose={() => !isSubmitting && closeModal()}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Título" required>
              <Input 
                value={form.title} 
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} 
                required 
                autoFocus
                placeholder="Título del artículo"
              />
            </Field>
            
            <Field label="Slug (URL)">
              <Input 
                value={form.slug} 
                onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))} 
                placeholder="se-genera-automaticamente"
              />
            </Field>
          </div>

          <Field label="Extracto">
            <Input 
              value={form.excerpt} 
              onChange={(e) => setForm(f => ({ ...f, excerpt: e.target.value.slice(0, 200) }))}
              placeholder="Resumen breve del artículo..."
              maxLength={200}
            />
            <span className="text-xs text-muted-foreground">
              {form.excerpt.length}/200
            </span>
          </Field>

          <Field label="Contenido" required>
            <textarea
              value={form.content}
              onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
              className="w-full rounded-md border bg-background p-3 text-sm resize-y min-h-[200px]"
              placeholder="Escribe el contenido del artículo aquí..."
              rows={12}
              required
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Categoría">
              <div className="space-y-3">
                {/* Categoría seleccionada */}
                {form.category && (
                  <div className="flex flex-wrap gap-2">
                    <Badge 
                      variant="default" 
                      className="flex items-center gap-1 bg-primary/10 text-primary border-primary/20"
                    >
                      {availableCategories.find(cat => cat.id === form.category)?.label}
                      <X 
                        className="w-3 h-3 cursor-pointer hover:text-destructive" 
                        onClick={clearCategory}
                      />
                    </Badge>
                  </div>
                )}
                
                {/* Categorías disponibles */}
                <div className="flex flex-wrap gap-2">
                  {availableCategories
                    .filter(cat => cat.id !== form.category)
                    .map(category => (
                    <Badge 
                      key={category.id} 
                      variant="outline" 
                      className="cursor-pointer hover:bg-primary/10 hover:border-primary/20 transition-colors"
                      onClick={() => selectCategory(category.id)}
                    >
                      + {category.label}
                    </Badge>
                  ))}
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Haz clic en una categoría para seleccionarla. Solo puedes seleccionar una categoría.
                </p>
              </div>
            </Field>
            
            <Field label="Tags (separados por comas)">
              <Input 
                value={form.tags} 
                onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))} 
                placeholder="defi, ethereum, trading"
              />
            </Field>
          </div>

          <Field label="Imagen destacada (URL)">
            <Input 
              type="url"
              value={form.featured_image} 
              onChange={(e) => setForm(f => ({ ...f, featured_image: e.target.value }))} 
              placeholder="https://ejemplo.com/imagen.jpg"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Estado">
              <select
                value={form.status}
                onChange={(e) => setForm(f => ({ ...f, status: e.target.value as 'draft' | 'published' }))}
                className="h-10 rounded-md border bg-background px-3 text-sm w-full"
              >
                <option value="draft">Borrador</option>
                <option value="published">Publicado</option>
              </select>
            </Field>

            <Field label="Opciones">
              <div className="flex items-center space-x-4 pt-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={form.is_featured}
                    onChange={(e) => setForm(f => ({ ...f, is_featured: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">Destacado</span>
                </label>
                
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={form.allow_comments}
                    onChange={(e) => setForm(f => ({ ...f, allow_comments: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">Comentarios</span>
                </label>
              </div>
            </Field>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={closeModal}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Guardando...
                </>
              ) : (
                editing ? 'Actualizar' : 'Crear post'
              )}
            </Button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}