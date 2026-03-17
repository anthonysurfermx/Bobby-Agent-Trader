// src/services/blog.service.ts - VERSIÓN FINAL COMPLETA
import { supabase } from '../lib/supabase';

// Types basados en tu esquema real de Supabase
export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  subtitle?: string;
  content: string;
  content_html?: string;
  excerpt?: string;
  featured_image?: string;
  featured_image_alt?: string;
  category?: string;
  tags?: string[];
  author_id: string;
  co_authors?: string[];
  editor_id?: string;
  status: string; // 'draft' | 'published' | 'scheduled'
  published_at?: string;
  scheduled_for?: string;
  reading_time_minutes?: number;
  is_featured: boolean;
  is_premium: boolean;
  allow_comments: boolean;
  meta_title?: string;
  meta_description?: string;
  canonical_url?: string;
  view_count: number;
  unique_readers: number;
  like_count: number;
  share_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  likes_count: number;
  author: string;
  image_url?: string;
}

export interface DomainPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  author: string;
  categories: string[];
  tags: string[];
  locale: 'en' | 'es';
  image_url: string | null;
  status: 'published' | 'draft';
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // Campos adicionales útiles
  subtitle?: string;
  reading_time_minutes?: number;
  is_featured?: boolean;
  view_count?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Campos principales a seleccionar - optimizado para tu esquema real
 */
const SELECT_FIELDS = `
  id,title,slug,subtitle,excerpt,content,author,category,tags,image_url,
  status,published_at,created_at,updated_at,reading_time_minutes,
  is_featured,view_count
`.replace(/\s+/g, '');

const DEFAULT_PAGE_SIZE = 12;

/**
 * Helpers mejorados
 */
const sanitize = (s: unknown): string =>
  (typeof s === 'string' ? s : '')
    .replaceAll(',', ' ')
    .replaceAll('%', '')
    .trim()
    .slice(0, 200);

const extractLocale = (tags: string[]): 'en' | 'es' => {
  if (tags.includes('lang:es')) return 'es';
  return 'en';
};

const toDomain = (row: BlogPost): DomainPost => {
  const tags = row.tags || [];
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    subtitle: row.subtitle,
    excerpt: row.excerpt || row.subtitle || '',
    content: row.content || '',
    author: row.author || 'Equipo DeFi México',
    categories: row.category ? [row.category] : [],
    tags: tags.filter(t => !t.startsWith('lang:')),
    locale: extractLocale(tags),
    image_url: row.image_url || row.featured_image || null,
    status: row.status === 'published' ? 'published' : 'draft',
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    reading_time_minutes: row.reading_time_minutes,
    is_featured: row.is_featured,
    view_count: row.view_count || 0,
  };
};

/**
 * Servicio de Blog - Versión Final con soporte completo para tu esquema
 */
class BlogService {
  /**
   * Obtener página de posts con filtros y AbortController
   */
  async getPage(params: {
    page?: number;
    pageSize?: number;
    q?: string;
    status?: 'published' | 'draft' | 'review' | 'all';
    category?: string;
    tag?: string;
    locale?: string;
    signal?: AbortSignal;
  } = {}): Promise<Page<DomainPost>> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(50, Math.max(1, params.pageSize || DEFAULT_PAGE_SIZE));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    console.log(`🔍 BlogService.getPage: page=${page}, status=${params.status}, category=${params.category}, q='${params.q}'`);

    let query = supabase
      .from('blog_posts')
      .select(SELECT_FIELDS, { count: 'exact' })
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    // Aplicar filtros de status
    if (params.status === 'published') {
      query = query.eq('status', 'published');
    } else if (params.status === 'draft') {
      query = query.eq('status', 'draft');
    } else if (params.status === 'review') {
      query = query.eq('status', 'review');
    }
    // Si es 'all', no filtrar por status

    if (params.category) {
      query = query.eq('category', params.category);
    }

    if (params.tag) {
      query = query.contains('tags', [params.tag]);
    }

    if (params.locale) {
      query = query.contains('tags', [`lang:${params.locale}`]);
    }

    if (params.q) {
      const q = sanitize(params.q);
      if (q) {
        query = query.or(
          `title.ilike.%${q}%,excerpt.ilike.%${q}%,content.ilike.%${q}%,subtitle.ilike.%${q}%`
        );
      }
    }

    // Configurar AbortController si se proporciona
    if (params.signal) {
      query = query.abortSignal(params.signal);
    }

    const { data, error, count } = await query.range(from, to);
    
    if (error) {
      console.error('❌ Error fetching blog posts:', error);
      throw error;
    }

    console.log(`✅ BlogService.getPage: Loaded ${data?.length || 0} posts (${count} total)`);

    return {
      items: (data || []).map(toDomain),
      total: count || 0,
      page,
      pageSize,
    };
  }

  /**
   * ALIAS para AdminBlog.tsx - Método getPosts con formato esperado
   */
  async getPosts(
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
    filters?: {
      search?: string;
      published?: boolean;
      status?: 'published' | 'draft' | 'review' | 'all';
      category?: string;
      tag?: string;
      locale?: string;
    },
    signal?: AbortSignal
  ) {
    // Convertir el filtro 'published' booleano a 'status' string
    let status: 'published' | 'draft' | 'review' | 'all' = 'all';
    if (filters?.status) {
      status = filters.status;
    } else if (filters?.published !== undefined) {
      status = filters.published ? 'published' : 'draft';
    }

    console.log(`🔍 BlogService.getPosts: Converting filters - published:${filters?.published} → status:${status}`);

    const res = await this.getPage({
      page,
      pageSize: limit,
      q: filters?.search,
      status,
      category: filters?.category,
      tag: filters?.tag,
      locale: filters?.locale,
      signal,
    });

    // Formato esperado por AdminBlog
    return {
      data: res.items,
      total: res.total,
      totalPages: Math.ceil(res.total / res.pageSize),
      currentPage: res.page,
    };
  }

  /**
   * Obtener posts recientes publicados - optimizado
   */
  async getRecent(limit = 3): Promise<DomainPost[]> {
    console.log(`🔍 BlogService.getRecent: Fetching ${limit} recent published posts`);

    const { data, error } = await supabase
      .from('blog_posts')
      .select(SELECT_FIELDS)
      .eq('status', 'published') // Usar status en lugar de published
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ Error fetching recent posts:', error);
      throw error;
    }

    console.log(`✅ BlogService.getRecent: Loaded ${data?.length || 0} recent posts`);
    return (data || []).map(toDomain);
  }

  /**
   * Obtener post por slug
   */
  async getBySlug(slug: string): Promise<DomainPost | null> {
    console.log(`🔍 BlogService.getBySlug: Fetching post with slug '${slug}'`);

    const { data, error } = await supabase
      .from('blog_posts')
      .select(SELECT_FIELDS)
      .eq('slug', slug)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
      console.error('❌ Error fetching post by slug:', error);
      throw error;
    }

    if (!data) {
      console.log(`⚠️ Post not found with slug '${slug}'`);
      return null;
    }

    console.log(`✅ BlogService.getBySlug: Found post '${data.title}'`);
    return toDomain(data);
  }

  /**
   * Obtener post por ID
   */
  async getById(id: string): Promise<DomainPost | null> {
    const { data, error } = await supabase
      .from('blog_posts')
      .select(SELECT_FIELDS)
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Error fetching post by id:', error);
      throw error;
    }

    return data ? toDomain(data) : null;
  }

  /**
   * Buscar posts con query mejorada
   */
  async search(query: string): Promise<DomainPost[]> {
    const q = sanitize(query);
    if (!q) return [];

    console.log(`🔍 BlogService.search: Searching for '${q}'`);

    const { data, error } = await supabase
      .from('blog_posts')
      .select(SELECT_FIELDS)
      .or(`title.ilike.%${q}%,excerpt.ilike.%${q}%,content.ilike.%${q}%,subtitle.ilike.%${q}%`)
      .eq('status', 'published') // Solo buscar en posts publicados
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error searching posts:', error);
      throw error;
    }

    console.log(`✅ BlogService.search: Found ${data?.length || 0} posts matching '${q}'`);
    return (data || []).map(toDomain);
  }

  /**
   * Obtener posts relacionados por tags
   */
  async getRelated(slug: string, tags: string[], limit = 3): Promise<DomainPost[]> {
    if (!tags?.length) return [];

    console.log(`🔍 BlogService.getRelated: Finding posts related to '${slug}' with tags:`, tags);

    const { data, error } = await supabase
      .from('blog_posts')
      .select(SELECT_FIELDS)
      .neq('slug', slug)
      .overlaps('tags', tags)
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      console.error('❌ Error fetching related posts:', error);
      throw error;
    }

    console.log(`✅ BlogService.getRelated: Found ${data?.length || 0} related posts`);
    return (data || []).map(toDomain);
  }

  /**
   * Crear un nuevo post - adaptado al esquema real
   */
  async create(post: Partial<BlogPost>): Promise<DomainPost> {
    const payload: any = {
      title: post.title,
      slug: post.slug || this.generateSlug(post.title || ''),
      subtitle: post.subtitle,
      excerpt: post.excerpt || '',
      content: post.content || '',
      author: post.author || 'Equipo DeFi México',
      category: post.category || null,
      tags: post.tags || [],
      image_url: post.image_url || null,
      status: post.status || 'draft',
      published_at: post.status === 'published' ? 
        (post.published_at || new Date().toISOString()) : null,
      is_featured: post.is_featured || false,
      is_premium: post.is_premium || false,
      allow_comments: post.allow_comments !== false, // Default true
      author_id: post.author_id || '00000000-0000-0000-0000-000000000000', // Placeholder UUID
    };

    console.log(`🔍 BlogService.create: Creating post '${payload.title}' with status '${payload.status}'`);

    const { data, error } = await supabase
      .from('blog_posts')
      .insert(payload)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      console.error('❌ Error creating post:', error);
      throw error;
    }

    console.log(`✅ BlogService.create: Created post '${data.title}' (${data.id})`);
    return toDomain(data);
  }

  /**
   * Actualizar un post existente
   */
  async update(id: string, updates: Partial<BlogPost>): Promise<DomainPost> {
    const payload: any = { ...updates };
    
    // Si se está publicando y no tiene fecha de publicación, asignarla
    if (updates.status === 'published' && !updates.published_at) {
      payload.published_at = new Date().toISOString();
      console.log(`📅 Setting published_at for post ${id}: ${payload.published_at}`);
    }
    
    // Si se está despublicando, quitar la fecha
    if (updates.status === 'draft') {
      payload.published_at = null;
      console.log(`📅 Clearing published_at for post ${id} (status: draft)`);
    }

    console.log(`🔍 BlogService.update: Updating post ${id} with:`, Object.keys(payload));

    const { data, error } = await supabase
      .from('blog_posts')
      .update(payload)
      .eq('id', id)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      console.error('❌ Error updating post:', error);
      throw error;
    }

    console.log(`✅ BlogService.update: Updated post '${data.title}' (status: ${data.status})`);
    return toDomain(data);
  }

  /**
   * Eliminar un post
   */
  async delete(id: string): Promise<boolean> {
    console.log(`🗑️ BlogService.delete: Deleting post ${id}`);

    const { error } = await supabase
      .from('blog_posts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Error deleting post:', error);
      throw error;
    }

    console.log(`✅ BlogService.delete: Post ${id} deleted successfully`);
    return true;
  }

  /**
   * Obtener todas las categorías únicas
   */
  async getCategories(): Promise<string[]> {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('category')
      .not('category', 'is', null);

    if (error) {
      console.error('❌ Error fetching categories:', error);
      throw error;
    }

    const categories = [...new Set(data?.map(item => item.category).filter(Boolean))];
    console.log(`✅ BlogService.getCategories: Found ${categories.length} categories`);
    return categories as string[];
  }

  /**
   * Obtener todos los tags únicos
   */
  async getTags(): Promise<string[]> {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('tags');

    if (error) {
      console.error('❌ Error fetching tags:', error);
      throw error;
    }

    const allTags = data?.flatMap(item => item.tags || []) || [];
    const uniqueTags = [...new Set(allTags)];
    console.log(`✅ BlogService.getTags: Found ${uniqueTags.length} unique tags`);
    return uniqueTags;
  }

  /**
   * Obtener estadísticas del blog - OPTIMIZADO: usa RPC en lugar de cargar todos los posts
   */
  async getStats() {
    // Intentar usar RPC optimizado primero
    // @ts-ignore - get_blog_stats RPC may not be in generated types yet
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_blog_stats');

    if (!rpcError && rpcData) {
      console.log(`📊 BlogService.getStats (RPC):`, rpcData);
      return rpcData as {
        total: number;
        published: number;
        drafts: number;
        review: number;
      };
    }

    // Fallback: query tradicional si RPC no existe
    console.warn('⚠️ get_blog_stats RPC not available, using fallback');
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, status', { count: 'exact', head: false });

    if (error) {
      console.error('❌ Error fetching stats:', error);
      throw error;
    }

    const stats = {
      total: data?.length || 0,
      published: data?.filter(p => p.status === 'published').length || 0,
      drafts: data?.filter(p => p.status === 'draft').length || 0,
      review: data?.filter(p => p.status === 'review').length || 0,
    };

    console.log(`📊 BlogService.getStats (fallback):`, stats);
    return stats;
  }

  /**
   * Incrementar contador de vistas
   */
  async incrementViews(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('blog_posts')
        .update({ view_count: supabase.sql`view_count + 1` })
        .eq('id', id);

      if (error) {
        console.warn('⚠️ Error incrementing views for post', id, ':', error.message);
      }
    } catch (err) {
      console.warn('⚠️ Error incrementing views for post', id, ':', err);
    }
  }

  /**
   * Aprobar un post que está en revisión (Solo administradores)
   */
  async approvePost(id: string): Promise<DomainPost> {
    console.log(`✅ BlogService.approvePost: Approving post ${id}`);

    const { data, error } = await supabase
      .from('blog_posts')
      .update({ 
        status: 'published',
        published_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'review') // Solo aprobar posts en revisión
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      console.error('❌ Error approving post:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Post no encontrado o no está en revisión');
    }

    console.log(`✅ BlogService.approvePost: Post '${data?.title}' aprobado`);
    return toDomain(data as BlogPost);
  }

  /**
   * Rechazar un post que está en revisión (Solo administradores)
   */
  async rejectPost(id: string, reason?: string): Promise<DomainPost> {
    console.log(`❌ BlogService.rejectPost: Rejecting post ${id}`);

    const { data, error } = await supabase
      .from('blog_posts')
      .update({ 
        status: 'draft',
        // Opcionalmente podrías agregar un campo 'rejection_reason' si existe
        ...(reason && { rejection_reason: reason })
      })
      .eq('id', id)
      .eq('status', 'review') // Solo rechazar posts en revisión
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      console.error('❌ Error rejecting post:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Post no encontrado o no está en revisión');
    }

    console.log(`❌ BlogService.rejectPost: Post '${data?.title}' rechazado`);
    return toDomain(data as BlogPost);
  }

  /**
   * ====================================
   * ALIAS DE COMPATIBILIDAD
   * ====================================
   */

  async createPost(post: Partial<BlogPost>): Promise<DomainPost> {
    return this.create(post);
  }

  async updatePost(id: string, updates: Partial<BlogPost>): Promise<DomainPost> {
    return this.update(id, updates);
  }

  async deletePost(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async getPostBySlug(slug: string): Promise<DomainPost | null> {
    return this.getBySlug(slug);
  }

  async getAllTags(): Promise<string[]> {
    return this.getTags();
  }

  async getAllCategories(): Promise<string[]> {
    return this.getCategories();
  }

  /**
   * ====================================
   * UTILIDADES PRIVADAS
   * ====================================
   */

  /**
   * Generar slug a partir del título
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .replace(/[^a-z0-9]+/g, '-')     // Reemplazar caracteres especiales
      .replace(/^-+|-+$/g, '');        // Remover guiones al inicio y final
  }

  /**
   * Calcular tiempo de lectura estimado
   */
  calculateReadingTime(content: string, wordsPerMinute = 200): number {
    const words = content.trim().split(/\s+/).length;
    return Math.max(1, Math.round(words / wordsPerMinute));
  }

  /**
   * Generar excerpt automático si no existe
   */
  generateExcerpt(content: string, maxLength = 160): string {
    return content
      .replace(/<[^>]*>/g, '') // Remover HTML
      .replace(/\s+/g, ' ')    // Normalizar espacios
      .trim()
      .slice(0, maxLength)
      .trim() + (content.length > maxLength ? '...' : '');
  }

  /**
   * Get the paired translation slug for a post.
   * Convention: EN slug = "2026-02-14-article", ES slug = "2026-02-14-article-es"
   */
  getTranslationSlug(slug: string, currentLocale: 'en' | 'es'): string {
    if (currentLocale === 'es') {
      // We're viewing ES → paired EN slug removes the -es suffix
      return slug.replace(/-es$/, '');
    }
    // We're viewing EN → paired ES slug adds -es
    return `${slug}-es`;
  }

  /**
   * Check if a translated version of a post exists
   */
  async getTranslation(slug: string, currentLocale: 'en' | 'es'): Promise<DomainPost | null> {
    const pairedSlug = this.getTranslationSlug(slug, currentLocale);
    return this.getBySlug(pairedSlug);
  }
}

// Exportar instancia singleton
export const blogService = new BlogService();