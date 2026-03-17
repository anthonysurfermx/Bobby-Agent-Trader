// src/types/blog.ts - ACTUALIZADO para tu esquema real
export interface BlogPost {
  id: string;
  author_id?: string;
  co_authors?: string[];
  editor_id?: string;
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
  meta_title?: string;
  meta_description?: string;
  canonical_url?: string;
  status: 'draft' | 'published' | 'archived' | 'scheduled';
  is_featured: boolean;
  is_premium: boolean;
  allow_comments: boolean;
  reading_time_minutes?: number;
  view_count: number;
  views_count: number;
  unique_readers: number;
  like_count: number;
  likes_count: number;
  share_count: number;
  comment_count: number;
  published_at?: string;
  scheduled_for?: string;
  created_at: string;
  updated_at: string;
}

export interface BlogPostFormData {
  title: string;
  slug: string;
  subtitle?: string;
  content: string;
  excerpt?: string;
  featured_image?: string;
  featured_image_alt?: string;
  category?: string;
  tags?: string[];
  meta_title?: string;
  meta_description?: string;
  canonical_url?: string;
  status: 'draft' | 'published' | 'archived' | 'scheduled';
  is_featured?: boolean;
  is_premium?: boolean;
  allow_comments?: boolean;
  published_at?: string;
  scheduled_for?: string;
}

export interface BlogPostFilters {
  status?: 'all' | 'draft' | 'published' | 'archived' | 'scheduled';
  author?: string;
  search?: string;
  featured?: boolean;
  premium?: boolean;
  tags?: string[];
  category?: string;
}

export interface BlogStats {
  total_posts: number;
  published_posts: number;
  draft_posts: number;
  scheduled_posts: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
}