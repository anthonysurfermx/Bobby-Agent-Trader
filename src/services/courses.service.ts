// src/services/courses.service.ts
import { supabase } from '../lib/supabase';

// Types para los cursos
export type CourseStatus = 'published' | 'draft' | 'archived';
export type CourseLevel = 'Principiante' | 'Intermedio' | 'Avanzado';
export type CourseCategory = 'defi' | 'defai' | 'fintech' | 'trading';

export interface Course {
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
  // Campos derivados para estadísticas
  views_count?: number;
  enrollments_count?: number;
}

export interface CourseFormData {
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
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Campos principales a seleccionar
 */
const SELECT_FIELDS = `
  id, title, description, duration, level, category, instructor, students, rating,
  topics, requirements, target_audience, circle_url, thumbnail_url, status, featured, created_at, updated_at,
  views_count, enrollments_count
`.replace(/\s+/g, '');

const DEFAULT_PAGE_SIZE = 12;

class CoursesService {
  /**
   * Obtiene cursos con filtros y paginación
   */
  async getCourses({
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    search = '',
    status,
    category,
    level,
    featured,
    sortBy = 'created_at',
    sortOrder = 'desc'
  }: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: CourseStatus;
    category?: CourseCategory;
    level?: CourseLevel;
    featured?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{ data: Course[] | null; total: number; error: any }> {
    try {
      console.log('🔍 Obteniendo cursos con filtros:', { page, pageSize, search, status, category, level, featured });

      let query = supabase
        .from('courses')
        .select(SELECT_FIELDS, { count: 'exact' });

      // Filtros
      if (search) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,instructor.ilike.%${search}%`);
      }

      if (status) {
        query = query.eq('status', status);
      }

      if (category) {
        query = query.eq('category', category);
      }

      if (level) {
        query = query.eq('level', level);
      }

      if (featured !== undefined) {
        query = query.eq('featured', featured);
      }

      // Ordenamiento
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Paginación
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error('❌ Error obteniendo cursos:', error);
        return { data: null, total: 0, error };
      }

      console.log(`✅ ${data?.length || 0} cursos obtenidos de ${count || 0} total`);
      return { data: data as Course[], total: count || 0, error: null };
    } catch (error) {
      console.error('❌ Error en getCourses:', error);
      return { data: null, total: 0, error };
    }
  }

  /**
   * Obtiene cursos publicados para el público
   */
  async getPublishedCourses({
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    category,
    level
  }: {
    page?: number;
    pageSize?: number;
    category?: CourseCategory;
    level?: CourseLevel;
  } = {}): Promise<{ data: Course[] | null; total: number; error: any }> {
    return this.getCourses({
      page,
      pageSize,
      status: 'published',
      category,
      level,
      sortBy: 'featured',
      sortOrder: 'desc'
    });
  }

  /**
   * Obtiene cursos destacados
   */
  async getFeaturedCourses(limit: number = 6): Promise<{ data: Course[] | null; error: any }> {
    try {
      console.log('🌟 Obteniendo cursos destacados, límite:', limit);

      const { data, error } = await supabase
        .from('courses')
        .select(SELECT_FIELDS)
        .eq('status', 'published')
        .eq('featured', true)
        .order('rating', { ascending: false })
        .order('students', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Error obteniendo cursos destacados:', error);
        return { data: null, error };
      }

      console.log(`✅ ${data?.length || 0} cursos destacados obtenidos`);
      return { data: data as Course[], error: null };
    } catch (error) {
      console.error('❌ Error en getFeaturedCourses:', error);
      return { data: null, error };
    }
  }

  /**
   * Obtiene el curso más popular (más estudiantes)
   */
  async getMostPopularCourse(): Promise<{ data: Course | null; error: any }> {
    try {
      console.log('📊 Obteniendo curso más popular...');

      const { data, error } = await supabase
        .from('courses')
        .select(SELECT_FIELDS)
        .eq('status', 'published')
        .order('students', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('❌ Error obteniendo curso más popular:', error);
        return { data: null, error };
      }

      console.log('✅ Curso más popular obtenido:', data?.title);
      return { data: data as Course | null, error: null };
    } catch (error) {
      console.error('❌ Error en getMostPopularCourse:', error);
      return { data: null, error };
    }
  }

  /**
   * Obtiene cursos por categoría
   */
  async getCoursesByCategory(category: CourseCategory, limit: number = 10): Promise<{ data: Course[] | null; error: any }> {
    try {
      console.log('🏷️ Obteniendo cursos por categoría:', category);

      const { data, error } = await supabase
        .from('courses')
        .select(SELECT_FIELDS)
        .eq('status', 'published')
        .eq('category', category)
        .order('featured', { ascending: false })
        .order('rating', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Error obteniendo cursos por categoría:', error);
        return { data: null, error };
      }

      console.log(`✅ ${data?.length || 0} cursos de categoría ${category} obtenidos`);
      return { data: data as Course[], error: null };
    } catch (error) {
      console.error('❌ Error en getCoursesByCategory:', error);
      return { data: null, error };
    }
  }

  /**
   * Obtiene un curso por ID
   */
  async getCourseById(id: string): Promise<{ data: Course | null; error: any }> {
    try {
      console.log('🔍 Obteniendo curso por ID:', id);

      const { data, error } = await supabase
        .from('courses')
        .select(SELECT_FIELDS)
        .eq('id', id)
        .single();

      if (error) {
        console.error('❌ Error obteniendo curso por ID:', error);
        return { data: null, error };
      }

      console.log('✅ Curso obtenido:', data?.title);
      return { data: data as Course, error: null };
    } catch (error) {
      console.error('❌ Error en getCourseById:', error);
      return { data: null, error };
    }
  }

  /**
   * Crea un nuevo curso
   */
  async createCourse(courseData: CourseFormData): Promise<{ data: Course | null; error: any }> {
    try {
      console.log('➕ Creando nuevo curso:', courseData.title);

      // Filtrar campos que no deben enviarse en INSERT (id, created_at, updated_at)
      const { id, created_at, updated_at, views_count, enrollments_count, ...cleanData } = courseData as any;

      const { data, error } = await supabase
        .from('courses')
        .insert([{
          ...cleanData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select(SELECT_FIELDS)
        .single();

      if (error) {
        console.error('❌ Error creando curso:', error);
        return { data: null, error };
      }

      console.log('✅ Curso creado:', data.title);
      return { data: data as Course, error: null };
    } catch (error) {
      console.error('❌ Error en createCourse:', error);
      return { data: null, error };
    }
  }

  /**
   * Actualiza un curso existente
   */
  async updateCourse(id: string, courseData: Partial<CourseFormData>): Promise<{ data: Course | null; error: any }> {
    try {
      console.log('📝 Actualizando curso:', id);

      const { data, error } = await supabase
        .from('courses')
        .update({
          ...courseData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(SELECT_FIELDS)
        .single();

      if (error) {
        console.error('❌ Error actualizando curso:', error);
        return { data: null, error };
      }

      console.log('✅ Curso actualizado:', data.title);
      return { data: data as Course, error: null };
    } catch (error) {
      console.error('❌ Error en updateCourse:', error);
      return { data: null, error };
    }
  }

  /**
   * Elimina un curso
   */
  async deleteCourse(id: string): Promise<{ error: any }> {
    try {
      console.log('🗑️ Eliminando curso:', id);

      const { error } = await supabase
        .from('courses')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Error eliminando curso:', error);
        return { error };
      }

      console.log('✅ Curso eliminado');
      return { error: null };
    } catch (error) {
      console.error('❌ Error en deleteCourse:', error);
      return { error };
    }
  }

  /**
   * Cambia el estado de un curso
   */
  async updateCourseStatus(id: string, status: CourseStatus): Promise<{ data: Course | null; error: any }> {
    return this.updateCourse(id, { status });
  }

  /**
   * Cambia el estado destacado de un curso
   */
  async toggleCourseFeatured(id: string, featured: boolean): Promise<{ data: Course | null; error: any }> {
    return this.updateCourse(id, { featured });
  }

  /**
   * Obtiene estadísticas generales de cursos
   */
  async getCourseStats(): Promise<{
    data: {
      totalCourses: number;
      publishedCourses: number;
      featuredCourses: number;
      averageRating: number;
      totalStudents: number;
      categoriesCount: Record<CourseCategory, number>;
    } | null;
    error: any;
  }> {
    try {
      console.log('📊 Obteniendo estadísticas de cursos...');

      const { data, error } = await supabase
        .from('courses')
        .select('status, featured, rating, students, category');

      if (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        return { data: null, error };
      }

      const stats = {
        totalCourses: data.length,
        publishedCourses: data.filter(c => c.status === 'published').length,
        featuredCourses: data.filter(c => c.featured).length,
        averageRating: data.reduce((acc, c) => acc + (c.rating || 0), 0) / data.length || 0,
        totalStudents: data.reduce((acc, c) => acc + (c.students || 0), 0),
        categoriesCount: {
          defi: data.filter(c => c.category === 'defi').length,
          defai: data.filter(c => c.category === 'defai').length,
          fintech: data.filter(c => c.category === 'fintech').length,
          trading: data.filter(c => c.category === 'trading').length
        }
      };

      console.log('✅ Estadísticas obtenidas:', stats);
      return { data: stats, error: null };
    } catch (error) {
      console.error('❌ Error en getCourseStats:', error);
      return { data: null, error };
    }
  }
}

export const coursesService = new CoursesService();