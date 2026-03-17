// src/services/videoTutorials.service.ts
import { supabase } from '../lib/supabase';

// Types para los video tutoriales
export type VideoStatus = 'published' | 'draft' | 'archived';
export type VideoLevel = 'Principiante' | 'Intermedio' | 'Avanzado';
export type VideoCategory = 'defi' | 'defai' | 'fintech' | 'trading' | 'blockchain' | 'nft' | 'general';

export interface VideoTutorial {
  id: string;
  title: string;
  description: string;
  youtube_url: string;
  youtube_id: string;
  thumbnail_url?: string;
  duration: string;
  category: VideoCategory;
  level: VideoLevel;
  instructor: string;
  tags: string[];
  views_count: number;
  likes_count: number;
  status: VideoStatus;
  featured: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface VideoFormData {
  title: string;
  description: string;
  youtube_url: string;
  thumbnail_url?: string;
  duration: string;
  category: VideoCategory;
  level: VideoLevel;
  instructor: string;
  tags: string[];
  status: VideoStatus;
  featured: boolean;
  order_index?: number;
}

/**
 * Campos principales a seleccionar
 */
const SELECT_FIELDS = `
  id, title, description, youtube_url, youtube_id, thumbnail_url, duration,
  category, level, instructor, tags, views_count, likes_count,
  status, featured, order_index, created_at, updated_at
`.replace(/\s+/g, ' ').trim();

const DEFAULT_PAGE_SIZE = 12;

/**
 * Extrae el ID de YouTube de una URL
 */
export function extractYoutubeId(url: string): string {
  // Formato: https://www.youtube.com/watch?v=VIDEO_ID
  let match = url.match(/youtube\.com\/watch\?v=([^&]+)/);
  if (match) return match[1];

  // Formato: https://youtu.be/VIDEO_ID
  match = url.match(/youtu\.be\/([^?&]+)/);
  if (match) return match[1];

  // Formato: https://www.youtube.com/embed/VIDEO_ID
  match = url.match(/youtube\.com\/embed\/([^?&]+)/);
  if (match) return match[1];

  return url;
}

/**
 * Genera la URL del thumbnail de YouTube
 */
export function getYoutubeThumbnail(youtubeId: string, quality: 'default' | 'medium' | 'high' | 'maxres' = 'high'): string {
  const qualityMap = {
    default: 'default',
    medium: 'mqdefault',
    high: 'hqdefault',
    maxres: 'maxresdefault'
  };
  return `https://img.youtube.com/vi/${youtubeId}/${qualityMap[quality]}.jpg`;
}

class VideoTutorialsService {
  /**
   * Obtiene videos con filtros y paginación
   */
  async getVideos({
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    search = '',
    status,
    category,
    level,
    featured,
    sortBy = 'order_index',
    sortOrder = 'asc'
  }: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: VideoStatus;
    category?: VideoCategory;
    level?: VideoLevel;
    featured?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{ data: VideoTutorial[] | null; total: number; error: any }> {
    try {
      console.log('🎬 Obteniendo videos con filtros:', { page, pageSize, search, status, category, level, featured });

      let query = supabase
        .from('video_tutorials')
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
        console.error('❌ Error obteniendo videos:', error);
        return { data: null, total: 0, error };
      }

      console.log(`✅ ${data?.length || 0} videos obtenidos de ${count || 0} total`);
      return { data: data as VideoTutorial[], total: count || 0, error: null };
    } catch (error) {
      console.error('❌ Error en getVideos:', error);
      return { data: null, total: 0, error };
    }
  }

  /**
   * Obtiene videos publicados para el público
   */
  async getPublishedVideos({
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    category,
    level,
    search = ''
  }: {
    page?: number;
    pageSize?: number;
    category?: VideoCategory;
    level?: VideoLevel;
    search?: string;
  } = {}): Promise<{ data: VideoTutorial[] | null; total: number; error: any }> {
    return this.getVideos({
      page,
      pageSize,
      search,
      status: 'published',
      category,
      level,
      sortBy: 'order_index',
      sortOrder: 'asc'
    });
  }

  /**
   * Obtiene videos destacados
   */
  async getFeaturedVideos(limit: number = 6): Promise<{ data: VideoTutorial[] | null; error: any }> {
    try {
      console.log('🌟 Obteniendo videos destacados, límite:', limit);

      const { data, error } = await supabase
        .from('video_tutorials')
        .select(SELECT_FIELDS)
        .eq('status', 'published')
        .eq('featured', true)
        .order('order_index', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('❌ Error obteniendo videos destacados:', error);
        return { data: null, error };
      }

      console.log(`✅ ${data?.length || 0} videos destacados obtenidos`);
      return { data: data as VideoTutorial[], error: null };
    } catch (error) {
      console.error('❌ Error en getFeaturedVideos:', error);
      return { data: null, error };
    }
  }

  /**
   * Obtiene videos por categoría
   */
  async getVideosByCategory(category: VideoCategory, limit: number = 10): Promise<{ data: VideoTutorial[] | null; error: any }> {
    try {
      console.log('🏷️ Obteniendo videos por categoría:', category);

      const { data, error } = await supabase
        .from('video_tutorials')
        .select(SELECT_FIELDS)
        .eq('status', 'published')
        .eq('category', category)
        .order('order_index', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('❌ Error obteniendo videos por categoría:', error);
        return { data: null, error };
      }

      console.log(`✅ ${data?.length || 0} videos de categoría ${category} obtenidos`);
      return { data: data as VideoTutorial[], error: null };
    } catch (error) {
      console.error('❌ Error en getVideosByCategory:', error);
      return { data: null, error };
    }
  }

  /**
   * Obtiene un video por ID
   */
  async getVideoById(id: string): Promise<{ data: VideoTutorial | null; error: any }> {
    try {
      console.log('🔍 Obteniendo video por ID:', id);

      const { data, error } = await supabase
        .from('video_tutorials')
        .select(SELECT_FIELDS)
        .eq('id', id)
        .single();

      if (error) {
        console.error('❌ Error obteniendo video por ID:', error);
        return { data: null, error };
      }

      console.log('✅ Video obtenido:', data?.title);
      return { data: data as VideoTutorial, error: null };
    } catch (error) {
      console.error('❌ Error en getVideoById:', error);
      return { data: null, error };
    }
  }

  /**
   * Crea un nuevo video
   */
  async createVideo(videoData: VideoFormData): Promise<{ data: VideoTutorial | null; error: any }> {
    try {
      console.log('➕ Creando nuevo video:', videoData.title);

      // Extraer YouTube ID de la URL
      const youtube_id = extractYoutubeId(videoData.youtube_url);

      const { data, error } = await supabase
        .from('video_tutorials')
        .insert([{
          ...videoData,
          youtube_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select(SELECT_FIELDS)
        .single();

      if (error) {
        console.error('❌ Error creando video:', error);
        return { data: null, error };
      }

      console.log('✅ Video creado:', data.title);
      return { data: data as VideoTutorial, error: null };
    } catch (error) {
      console.error('❌ Error en createVideo:', error);
      return { data: null, error };
    }
  }

  /**
   * Actualiza un video existente
   */
  async updateVideo(id: string, videoData: Partial<VideoFormData>): Promise<{ data: VideoTutorial | null; error: any }> {
    try {
      console.log('📝 Actualizando video:', id);

      const updateData: any = {
        ...videoData,
        updated_at: new Date().toISOString()
      };

      // Si se actualiza la URL, extraer nuevo YouTube ID
      if (videoData.youtube_url) {
        updateData.youtube_id = extractYoutubeId(videoData.youtube_url);
      }

      const { data, error } = await supabase
        .from('video_tutorials')
        .update(updateData)
        .eq('id', id)
        .select(SELECT_FIELDS)
        .single();

      if (error) {
        console.error('❌ Error actualizando video:', error);
        return { data: null, error };
      }

      console.log('✅ Video actualizado:', data.title);
      return { data: data as VideoTutorial, error: null };
    } catch (error) {
      console.error('❌ Error en updateVideo:', error);
      return { data: null, error };
    }
  }

  /**
   * Elimina un video
   */
  async deleteVideo(id: string): Promise<{ error: any }> {
    try {
      console.log('🗑️ Eliminando video:', id);

      const { error } = await supabase
        .from('video_tutorials')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Error eliminando video:', error);
        return { error };
      }

      console.log('✅ Video eliminado');
      return { error: null };
    } catch (error) {
      console.error('❌ Error en deleteVideo:', error);
      return { error };
    }
  }

  /**
   * Cambia el estado de un video
   */
  async updateVideoStatus(id: string, status: VideoStatus): Promise<{ data: VideoTutorial | null; error: any }> {
    return this.updateVideo(id, { status });
  }

  /**
   * Cambia el estado destacado de un video
   */
  async toggleVideoFeatured(id: string, featured: boolean): Promise<{ data: VideoTutorial | null; error: any }> {
    return this.updateVideo(id, { featured });
  }

  /**
   * Incrementa el contador de vistas
   */
  async incrementViews(id: string): Promise<{ error: any }> {
    try {
      const { error } = await supabase.rpc('increment_video_views', { video_id: id });

      if (error) {
        console.error('❌ Error incrementando vistas:', error);
        return { error };
      }

      return { error: null };
    } catch (error) {
      console.error('❌ Error en incrementViews:', error);
      return { error };
    }
  }

  /**
   * Obtiene estadísticas generales de videos
   */
  async getVideoStats(): Promise<{
    data: {
      totalVideos: number;
      publishedVideos: number;
      featuredVideos: number;
      totalViews: number;
      categoriesCount: Record<VideoCategory, number>;
    } | null;
    error: any;
  }> {
    try {
      console.log('📊 Obteniendo estadísticas de videos...');

      const { data, error } = await supabase
        .from('video_tutorials')
        .select('status, featured, views_count, category');

      if (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        return { data: null, error };
      }

      const stats = {
        totalVideos: data.length,
        publishedVideos: data.filter(v => v.status === 'published').length,
        featuredVideos: data.filter(v => v.featured).length,
        totalViews: data.reduce((acc, v) => acc + (v.views_count || 0), 0),
        categoriesCount: {
          defi: data.filter(v => v.category === 'defi').length,
          defai: data.filter(v => v.category === 'defai').length,
          fintech: data.filter(v => v.category === 'fintech').length,
          trading: data.filter(v => v.category === 'trading').length,
          blockchain: data.filter(v => v.category === 'blockchain').length,
          nft: data.filter(v => v.category === 'nft').length,
          general: data.filter(v => v.category === 'general').length
        }
      };

      console.log('✅ Estadísticas obtenidas:', stats);
      return { data: stats, error: null };
    } catch (error) {
      console.error('❌ Error en getVideoStats:', error);
      return { data: null, error };
    }
  }

  /**
   * Reordena videos (actualiza order_index)
   */
  async reorderVideos(videoIds: string[]): Promise<{ error: any }> {
    try {
      console.log('🔄 Reordenando videos...');

      // Actualizar cada video con su nuevo índice
      for (let i = 0; i < videoIds.length; i++) {
        const { error } = await supabase
          .from('video_tutorials')
          .update({ order_index: i + 1 })
          .eq('id', videoIds[i]);

        if (error) {
          console.error('❌ Error reordenando video:', videoIds[i], error);
          return { error };
        }
      }

      console.log('✅ Videos reordenados');
      return { error: null };
    } catch (error) {
      console.error('❌ Error en reorderVideos:', error);
      return { error };
    }
  }
}

export const videoTutorialsService = new VideoTutorialsService();
