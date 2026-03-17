// src/pages/admin/AdminAcademia.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Pencil, Trash2, Search, X, BookOpen, Eye, EyeOff, ExternalLink, Star, Clock, Users, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { coursesService, type Course, type CourseFormData } from '@/services/courses.service';

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

// Tipos para los cursos
type CourseStatus = 'published' | 'draft' | 'archived';
type CourseLevel = 'Principiante' | 'Intermedio' | 'Avanzado';
type CourseCategory = 'defi' | 'defai' | 'fintech' | 'trading';

interface Course {
  id: string;
  title: string;
  description: string;
  duration: string;
  level: CourseLevel;
  category: CourseCategory;
  instructor: string;
  students: number;
  rating: number;
  topics: string[];
  requirements: string[];
  target_audience: string[];
  circle_url: string;
  thumbnail_url?: string;
  status: CourseStatus;
  featured: boolean;
  created_at: string;
  updated_at: string;
}

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
          aria-labelledby="admin-academia-title" 
          className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-6 relative" 
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
          <h3 id="admin-academia-title" className="text-xl font-semibold mb-6">
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

export default function AdminAcademia() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  // Filters & search
  const searchTerm = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || 'all';
  const categoryFilter = searchParams.get('category') || 'all';
  const currentPage = parseInt(searchParams.get('page') || '1');

  const debouncedSearch = useDebouncedValue(searchTerm, 300);

  // ✨ CARGAR CURSOS DESDE SUPABASE
  const loadCourses = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🔄 Cargando cursos desde Supabase para Admin...');
      
      const { data, error } = await coursesService.getCourses({
        page: 1,
        pageSize: 100,
        search: debouncedSearch,
        status: statusFilter === 'all' ? undefined : statusFilter as any,
        category: categoryFilter === 'all' ? undefined : categoryFilter as any
      });
      
      if (error) {
        console.error('❌ Error cargando cursos:', error);
        setCourses([]);
        return;
      }
      
      if (data) {
        setCourses(data);
        console.log(`✅ ${data.length} cursos cargados para Admin`);
      }
    } catch (error) {
      console.error('❌ Error en loadCourses:', error);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, categoryFilter]);

  // Cargar cursos cuando cambien los filtros
  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  // Filter logic
  const filteredCourses = useMemo(() => {
    return courses.filter(course => {
      const matchesSearch = !debouncedSearch || 
        course.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        course.instructor.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        course.description.toLowerCase().includes(debouncedSearch.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || course.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || course.category === categoryFilter;
      
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [courses, debouncedSearch, statusFilter, categoryFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredCourses.length / PAGE_SIZE);
  const paginatedCourses = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCourses.slice(start, start + PAGE_SIZE);
  }, [filteredCourses, currentPage]);

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    });
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  const handleSearch = useCallback((value: string) => {
    updateParams({ search: value, page: '1' });
  }, [updateParams]);

  const handleStatusFilter = useCallback((status: string) => {
    updateParams({ status: status === 'all' ? null : status, page: '1' });
  }, [updateParams]);

  const handleCategoryFilter = useCallback((category: string) => {
    updateParams({ category: category === 'all' ? null : category, page: '1' });
  }, [updateParams]);

  const goToPage = useCallback((page: number) => {
    updateParams({ page: page.toString() });
  }, [updateParams]);

  const handleDelete = async (courseId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este curso?')) return;
    
    setDeleting(courseId);
    try {
      console.log('🗑️ Eliminando curso:', courseId);
      const { error } = await coursesService.deleteCourse(courseId);
      
      if (error) {
        console.error('❌ Error eliminando curso:', error);
        alert('Error eliminando el curso');
        return;
      }
      
      // Actualizar lista local
      setCourses(prev => prev.filter(c => c.id !== courseId));
      console.log('✅ Curso eliminado exitosamente');
    } catch (error) {
      console.error('❌ Error eliminando curso:', error);
      alert('Error eliminando el curso');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleStatus = async (course: Course) => {
    try {
      const newStatus: CourseStatus = course.status === 'published' ? 'draft' : 'published';
      console.log(`🔄 Cambiando estado de curso a: ${newStatus}`);
      
      const { data, error } = await coursesService.updateCourseStatus(course.id, newStatus);
      
      if (error) {
        console.error('❌ Error cambiando estado:', error);
        alert('Error cambiando el estado del curso');
        return;
      }
      
      // Actualizar lista local
      setCourses(prev => prev.map(c => 
        c.id === course.id ? { ...c, status: newStatus } : c
      ));
      console.log(`✅ Curso ${newStatus === 'published' ? 'publicado' : 'ocultado'}:`, course.title);
    } catch (error) {
      console.error('❌ Error cambiando estado del curso:', error);
      alert('Error cambiando el estado del curso');
    }
  };

  const handleToggleFeatured = async (course: Course) => {
    try {
      const newFeatured = !course.featured;
      console.log(`🔄 Cambiando estado destacado a: ${newFeatured}`);
      
      const { data, error } = await coursesService.toggleCourseFeatured(course.id, newFeatured);
      
      if (error) {
        console.error('❌ Error cambiando estado destacado:', error);
        alert('Error cambiando el estado destacado');
        return;
      }
      
      // Actualizar lista local
      setCourses(prev => prev.map(c => 
        c.id === course.id ? { ...c, featured: newFeatured } : c
      ));
      console.log(`✅ Curso ${newFeatured ? 'destacado' : 'no destacado'}:`, course.title);
    } catch (error) {
      console.error('❌ Error cambiando estado destacado:', error);
      alert('Error cambiando el estado destacado');
    }
  };

  const handleSaveCourse = async (courseData: Course) => {
    try {
      if (selectedCourse) {
        // Actualizar curso existente
        console.log('📝 Actualizando curso:', courseData.title);
        const { data, error } = await coursesService.updateCourse(selectedCourse.id, courseData as Partial<CourseFormData>);
        
        if (error) {
          console.error('❌ Error actualizando curso:', error);
          alert('Error actualizando el curso');
          return;
        }
        
        // Actualizar lista local
        if (data) {
          setCourses(prev => prev.map(c => c.id === data.id ? data : c));
          console.log('✅ Curso actualizado exitosamente');
        }
      } else {
        // Crear nuevo curso
        console.log('➕ Creando nuevo curso:', courseData.title);
        const { data, error } = await coursesService.createCourse(courseData as CourseFormData);
        
        if (error) {
          console.error('❌ Error creando curso:', error);
          alert('Error creando el curso');
          return;
        }
        
        // Agregar a la lista local
        if (data) {
          setCourses(prev => [...prev, data]);
          console.log('✅ Curso creado exitosamente');
        }
      }
      
      closeModal();
    } catch (error) {
      console.error('❌ Error guardando curso:', error);
      alert('Error guardando el curso');
    }
  };

  const openModal = (course?: Course) => {
    setSelectedCourse(course || null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedCourse(null);
  };

  const getStatusBadge = (status: CourseStatus) => {
    const variants = {
      published: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      archived: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
    };
    
    const labels = {
      published: 'Publicado',
      draft: 'Borrador',
      archived: 'Archivado'
    };

    return (
      <Badge className={variants[status]}>
        {labels[status]}
      </Badge>
    );
  };

  const getLevelBadge = (level: CourseLevel) => {
    const variants = {
      'Principiante': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
      'Intermedio': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
      'Avanzado': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
    };

    return (
      <Badge className={variants[level]}>
        {level}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Cursos DeFi Academy</h1>
          <p className="text-muted-foreground">
            Gestiona los cursos de la academia DeFi
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/academia/videos">
            <Button variant="outline" className="gap-2">
              <Play className="w-4 h-4" />
              Video Tutoriales
            </Button>
          </Link>
          <Button onClick={() => openModal()} className="gap-2">
            <Plus className="w-4 h-4" />
            Nuevo Curso
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cursos, instructores..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select 
          value={statusFilter} 
          onChange={(e) => handleStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg bg-background"
        >
          <option value="all">Todos los estados</option>
          <option value="published">Publicados</option>
          <option value="draft">Borradores</option>
          <option value="archived">Archivados</option>
        </select>
        <select 
          value={categoryFilter} 
          onChange={(e) => handleCategoryFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg bg-background"
        >
          <option value="all">Todas las categorías</option>
          <option value="defi">DeFi</option>
          <option value="defai">DeFAI</option>
          <option value="fintech">Fintech</option>
          <option value="trading">Trading</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-lg border">
          <div className="text-2xl font-bold">{courses.length}</div>
          <div className="text-sm text-muted-foreground">Total cursos</div>
        </div>
        <div className="bg-card p-4 rounded-lg border">
          <div className="text-2xl font-bold text-green-600">
            {courses.filter(c => c.status === 'published').length}
          </div>
          <div className="text-sm text-muted-foreground">Publicados</div>
        </div>
        <div className="bg-card p-4 rounded-lg border">
          <div className="text-2xl font-bold text-blue-600">
            {courses.filter(c => c.featured).length}
          </div>
          <div className="text-sm text-muted-foreground">Destacados</div>
        </div>
        <div className="bg-card p-4 rounded-lg border">
          <div className="text-2xl font-bold text-primary">
            {Math.round(courses.reduce((acc, c) => acc + c.rating, 0) / courses.length * 10) / 10 || 0}
          </div>
          <div className="text-sm text-muted-foreground">Rating promedio</div>
        </div>
      </div>

      {/* Courses Table */}
      <div className="bg-card rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b">
              <tr>
                <th className="text-left p-4 font-medium">Curso</th>
                <th className="text-left p-4 font-medium hidden sm:table-cell">Categoría</th>
                <th className="text-left p-4 font-medium hidden md:table-cell">Instructor</th>
                <th className="text-left p-4 font-medium hidden lg:table-cell">Estudiantes</th>
                <th className="text-left p-4 font-medium">Estado</th>
                <th className="text-left p-4 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <p className="text-muted-foreground">Cargando cursos...</p>
                  </td>
                </tr>
              ) : paginatedCourses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8">
                    <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No se encontraron cursos</p>
                  </td>
                </tr>
              ) : (
                paginatedCourses.map((course) => (
                  <tr key={course.id} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium line-clamp-1">{course.title}</h3>
                          {course.featured && (
                            <Star className="w-4 h-4 text-yellow-500 fill-current" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {course.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {course.duration}
                          </div>
                          {getLevelBadge(course.level)}
                        </div>
                      </div>
                    </td>
                    
                    <td className="p-4 hidden sm:table-cell">
                      <Badge variant="outline" className="capitalize">
                        {course.category}
                      </Badge>
                    </td>
                    
                    <td className="p-4 hidden md:table-cell">
                      <span className="text-sm">{course.instructor}</span>
                    </td>
                    
                    <td className="p-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1 text-sm">
                        <Users className="w-3 h-3" />
                        {course.students.toLocaleString()}
                      </div>
                    </td>
                    
                    <td className="p-4">
                      {getStatusBadge(course.status)}
                    </td>
                    
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(course)}
                          title={course.status === 'published' ? 'Ocultar' : 'Publicar'}
                        >
                          {course.status === 'published' ? 
                            <EyeOff className="w-4 h-4" /> : 
                            <Eye className="w-4 h-4" />
                          }
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openModal(course)}
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          title="Ver en Circle"
                        >
                          <a 
                            href={course.circle_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(course.id)}
                          disabled={deleting === course.id}
                          title="Eliminar"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {deleting === course.id ? 
                            <Loader2 className="w-4 h-4 animate-spin" /> : 
                            <Trash2 className="w-4 h-4" />
                          }
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {Math.min(filteredCourses.length, (currentPage - 1) * PAGE_SIZE + 1)} - {Math.min(filteredCourses.length, currentPage * PAGE_SIZE)} de {filteredCourses.length} cursos
          </p>
          
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              Anterior
            </Button>
            
            {visiblePages(totalPages, currentPage).map(pageNum => (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? "default" : "outline"}
                size="sm"
                onClick={() => goToPage(pageNum)}
                className="w-9"
              >
                {pageNum}
              </Button>
            ))}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Modal for Create/Edit Course */}
      <AdminModal
        open={showModal}
        title={selectedCourse ? 'Editar Curso' : 'Crear Nuevo Curso'}
        onClose={closeModal}
      >
        <CourseForm 
          course={selectedCourse} 
          onSave={handleSaveCourse}
          onCancel={closeModal}
        />
      </AdminModal>
    </div>
  );
}

// Course Form Component
function CourseForm({ 
  course, 
  onSave, 
  onCancel 
}: { 
  course: Course | null; 
  onSave: (course: Course) => void; 
  onCancel: () => void; 
}) {
  const [formData, setFormData] = useState<Partial<Course>>({
    title: course?.title || '',
    description: course?.description || '',
    duration: course?.duration || '',
    level: course?.level || 'Principiante',
    category: course?.category || 'defi',
    instructor: course?.instructor || '',
    students: course?.students || 0,
    rating: course?.rating || 4.0,
    topics: course?.topics || [],
    requirements: course?.requirements || [],
    target_audience: course?.target_audience || [],
    circle_url: course?.circle_url || '',
    thumbnail_url: course?.thumbnail_url || '',
    status: course?.status || 'draft',
    featured: course?.featured || false,
  });

  const [topicsInput, setTopicsInput] = useState(course?.topics.join(', ') || '');
  const [requirementsInput, setRequirementsInput] = useState(course?.requirements.join('\n') || '');
  const [targetAudienceInput, setTargetAudienceInput] = useState(course?.target_audience.join('\n') || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const courseData: Course = {
      ...formData,
      topics: topicsInput.split(',').map(t => t.trim()).filter(Boolean),
      requirements: requirementsInput.split('\n').map(r => r.trim()).filter(Boolean),
      target_audience: targetAudienceInput.split('\n').map(ta => ta.trim()).filter(Boolean),
      // Solo incluir id, created_at, updated_at si estamos editando un curso existente
      ...(course && {
        id: course.id,
        created_at: course.created_at,
        updated_at: new Date().toISOString(),
      })
    } as Course;

    onSave(courseData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Título del curso" required>
          <Input
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Ej: DeFi Fundamentals"
            required
          />
        </Field>
        
        <Field label="Instructor" required>
          <Input
            value={formData.instructor}
            onChange={(e) => setFormData(prev => ({ ...prev, instructor: e.target.value }))}
            placeholder="Ej: Carlos Mendez"
            required
          />
        </Field>
      </div>

      <Field label="Descripción" required>
        <textarea
          className="w-full px-3 py-2 border rounded-lg bg-background resize-none"
          rows={3}
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Descripción breve del curso"
          required
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Duración" required>
          <Input
            value={formData.duration}
            onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
            placeholder="Ej: 3h 45m"
            required
          />
        </Field>
        
        <Field label="Nivel" required>
          <select 
            className="w-full px-3 py-2 border rounded-lg bg-background"
            value={formData.level}
            onChange={(e) => setFormData(prev => ({ ...prev, level: e.target.value as CourseLevel }))}
            required
          >
            <option value="Principiante">Principiante</option>
            <option value="Intermedio">Intermedio</option>
            <option value="Avanzado">Avanzado</option>
          </select>
        </Field>
        
        <Field label="Categoría" required>
          <select 
            className="w-full px-3 py-2 border rounded-lg bg-background"
            value={formData.category}
            onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value as CourseCategory }))}
            required
          >
            <option value="defi">DeFi</option>
            <option value="defai">DeFAI</option>
            <option value="fintech">Fintech</option>
            <option value="trading">Trading</option>
          </select>
        </Field>
      </div>

      <Field label="Temas del curso (separados por comas)">
        <Input
          value={topicsInput}
          onChange={(e) => setTopicsInput(e.target.value)}
          placeholder="Ej: Smart Contracts, Wallet Security, DeFi Protocols"
        />
      </Field>

      <Field label="Requisitos del curso (uno por línea)">
        <textarea
          className="w-full px-3 py-2 border rounded-lg bg-background resize-none"
          rows={4}
          value={requirementsInput}
          onChange={(e) => setRequirementsInput(e.target.value)}
          placeholder="Ej:&#10;Conocimientos básicos de blockchain&#10;Computadora con acceso a internet&#10;Ganas de aprender sobre finanzas descentralizadas"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Escribe cada requisito en una línea separada
        </p>
      </Field>

      <Field label="Para quién es este curso (uno por línea)">
        <textarea
          className="w-full px-3 py-2 border rounded-lg bg-background resize-none"
          rows={4}
          value={targetAudienceInput}
          onChange={(e) => setTargetAudienceInput(e.target.value)}
          placeholder="Ej:&#10;Desarrolladores interesados en DeFi&#10;Inversores buscando entender el ecosistema&#10;Emprendedores explorando oportunidades en blockchain"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Escribe cada tipo de audiencia en una línea separada
        </p>
      </Field>

      <Field label="URL de Circle (link del curso)" required>
        <Input
          type="url"
          value={formData.circle_url}
          onChange={(e) => setFormData(prev => ({ ...prev, circle_url: e.target.value }))}
          placeholder="https://circle.so/tu-curso"
          required
        />
      </Field>

      <Field label="URL de imagen (opcional)">
        <Input
          type="url"
          value={formData.thumbnail_url}
          onChange={(e) => setFormData(prev => ({ ...prev, thumbnail_url: e.target.value }))}
          placeholder="https://ejemplo.com/imagen.jpg"
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Estudiantes">
          <Input
            type="number"
            value={formData.students}
            onChange={(e) => setFormData(prev => ({ ...prev, students: parseInt(e.target.value) || 0 }))}
            min="0"
          />
        </Field>
        
        <Field label="Rating (1-5)">
          <Input
            type="number"
            step="0.1"
            min="1"
            max="5"
            value={formData.rating}
            onChange={(e) => setFormData(prev => ({ ...prev, rating: parseFloat(e.target.value) || 4.0 }))}
          />
        </Field>
        
        <Field label="Estado">
          <select 
            className="w-full px-3 py-2 border rounded-lg bg-background"
            value={formData.status}
            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as CourseStatus }))}
          >
            <option value="draft">Borrador</option>
            <option value="published">Publicado</option>
            <option value="archived">Archivado</option>
          </select>
        </Field>
      </div>

      <Field label="Opciones">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.featured}
            onChange={(e) => setFormData(prev => ({ ...prev, featured: e.target.checked }))}
          />
          <span className="text-sm">Marcar como curso destacado</span>
        </label>
      </Field>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">
          {course ? 'Actualizar' : 'Crear'} Curso
        </Button>
      </div>
    </form>
  );
}