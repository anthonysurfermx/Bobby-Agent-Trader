// src/pages/BlogPostPage.tsx - ACTUALIZADA
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import DOMPurify from 'dompurify';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Eye,
  Heart,
  Share2,
  User,
  Tag,
  ChevronRight,
  FileText,
  Loader2,
  Globe,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { blogService, type DomainPost } from '@/services/blog.service';
import { DefiChart } from '@/components/charts/DefiChart';
import { EntityComments } from '@/components/BlogComments';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// Helper function para formatear fechas
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

// Helper function para formatear tiempo relativo
const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Hace un momento';
  if (diffInSeconds < 3600) return `Hace ${Math.floor(diffInSeconds / 60)} min`;
  if (diffInSeconds < 86400) return `Hace ${Math.floor(diffInSeconds / 3600)} h`;
  if (diffInSeconds < 604800) return `Hace ${Math.floor(diffInSeconds / 86400)} días`;
  
  return formatDate(dateString);
};

// Helper function para calcular tiempo de lectura
const calculateReadTime = (content: string): number => {
  const wordsPerMinute = 200;
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / wordsPerMinute));
};

// Markdown to HTML converter (for non-chart segments)
const markdownToHtml = (md: string) => {
  // Preserve iframes by extracting them first
  const iframes: string[] = [];
  let processed = md.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, (match) => {
    iframes.push(`<div class="my-8 flex justify-center"><div class="w-full max-w-3xl aspect-video">${match.replace(/width="[^"]*"/, 'width="100%"').replace(/height="[^"]*"/, 'height="100%"')}</div></div>`);
    return `%%IFRAME_${iframes.length - 1}%%`;
  });

  processed = processed
    .replace(/^# (.*$)/gm, '<h1 class="text-3xl font-bold mb-6 mt-8 first:mt-0">$1</h1>')
    .replace(/^## (.*$)/gm, '<h2 class="text-2xl font-bold mb-4 mt-8">$1</h2>')
    .replace(/^### (.*$)/gm, '<h3 class="text-xl font-bold mb-3 mt-6">$1</h3>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 mb-1 list-disc text-muted-foreground">$1</li>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-muted px-2 py-1 rounded text-sm font-mono text-foreground">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/\n/g, '<br>');

  // Restore iframes
  iframes.forEach((iframe, i) => {
    processed = processed.replace(`%%IFRAME_${i}%%`, iframe);
  });

  return processed;
};

// Splits content into alternating HTML segments and DefiChart components
const PostContent = ({ content }: { content: string }) => {
  // Split on [defichart:type:identifier] tags
  const chartPattern = /\[defichart:([a-z_]+):([a-zA-Z0-9_-]+)\]/g;
  const segments: Array<{ type: 'html'; html: string } | { type: 'chart'; chartType: string; identifier: string }> = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = chartPattern.exec(content)) !== null) {
    // Add HTML segment before this chart tag
    if (match.index > lastIndex) {
      const mdSegment = content.slice(lastIndex, match.index);
      segments.push({ type: 'html', html: markdownToHtml(mdSegment) });
    }
    // Add chart segment
    segments.push({ type: 'chart', chartType: match[1], identifier: match[2] });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining HTML
  if (lastIndex < content.length) {
    const mdSegment = content.slice(lastIndex);
    segments.push({ type: 'html', html: markdownToHtml(mdSegment) });
  }

  // If no chart tags found, render everything as HTML (fast path)
  if (segments.length === 0) {
    const htmlContent = `<div class="prose-content"><p class="mb-4">${markdownToHtml(content)}</p></div>`;
    return (
      <div
        className="prose prose-lg max-w-none text-foreground prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:text-foreground prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground [&_iframe]:rounded-xl [&_iframe]:border [&_iframe]:border-border"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling'] }) }}
      />
    );
  }

  return (
    <div className="prose prose-lg max-w-none text-foreground prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:text-foreground prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground [&_iframe]:rounded-xl [&_iframe]:border [&_iframe]:border-border">
      {segments.map((seg, i) =>
        seg.type === 'html' ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(`<p class="mb-4">${seg.html}</p>`, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling'] }) }} />
        ) : (
          <DefiChart key={i} type={seg.chartType} identifier={seg.identifier} />
        )
      )}
    </div>
  );
};

// Componente de breadcrumbs
const Breadcrumbs = ({ title }: { title: string }) => (
  <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-8">
    <Link to="/" className="hover:text-foreground transition-colors">
      Inicio
    </Link>
    <ChevronRight className="w-4 h-4" />
    <Link to="/blog" className="hover:text-foreground transition-colors">
      Blog
    </Link>
    <ChevronRight className="w-4 h-4" />
    <span className="text-foreground font-medium truncate">{title}</span>
  </nav>
);

// Componente para posts relacionados
const RelatedPosts = ({ currentSlug, tags, categories }: { 
  currentSlug: string; 
  tags: string[];
  categories: string[];
}) => {
  const [relatedPosts, setRelatedPosts] = useState<DomainPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRelated = async () => {
      try {
        // Intentar usar el método getRelated si existe
        if (blogService.getRelated && tags.length > 0) {
          const posts = await blogService.getRelated(currentSlug, tags, 3);
          setRelatedPosts(posts);
        } else {
          // Fallback: buscar posts de la misma categoría
          const category = categories[0];
          if (category) {
            const response = await blogService.getPosts(1, 6, {
              status: 'published',
              category: category
            });
            
            const filtered = response.data
              .filter(post => post.slug !== currentSlug)
              .slice(0, 3);
            
            setRelatedPosts(filtered);
          }
        }
      } catch (error) {
        console.error('Error loading related posts:', error);
        setRelatedPosts([]);
      } finally {
        setLoading(false);
      }
    };

    if (tags.length > 0 || categories.length > 0) {
      loadRelated();
    } else {
      setLoading(false);
    }
  }, [currentSlug, tags, categories]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (relatedPosts.length === 0) {
    return null;
  }

  return (
    <section className="mt-12 pt-8 border-t">
      <h3 className="text-2xl font-bold mb-6">Artículos relacionados</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {relatedPosts.map((post) => (
          <Link 
            key={post.id} 
            to={`/blog/${post.slug}`}
            className="group block bg-card border rounded-lg overflow-hidden hover:border-primary/50 transition-all duration-300"
          >
            {post.image_url ? (
              <div className="aspect-video bg-muted overflow-hidden">
                <img 
                  src={post.image_url} 
                  alt={post.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            ) : (
              <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                <FileText className="w-8 h-8 text-primary/40" />
              </div>
            )}
            <div className="p-4">
              {post.categories.length > 0 && (
                <Badge variant="secondary" className="mb-2 text-xs">
                  {post.categories[0]}
                </Badge>
              )}
              <h4 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-2 mb-2">
                {post.title}
              </h4>
              {post.excerpt && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                  {post.excerpt}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatTimeAgo(post.published_at || post.created_at)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};

// Componente principal del post
const BlogPostPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const [post, setPost] = useState<DomainPost | null>(null);
  const [translationSlug, setTranslationSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Like logic - cast to any since likes table is not in typed schema
  const db = supabase as any;

  const loadLikes = useCallback(async () => {
    if (!post) return;
    const { count } = await db
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('entity_id', post.id)
      .eq('entity_type', 'blog_post');
    setLikeCount(count || 0);

    if (user) {
      const { data } = await db
        .from('likes')
        .select('id')
        .eq('entity_id', post.id)
        .eq('entity_type', 'blog_post')
        .eq('user_id', user.id)
        .maybeSingle();
      setLiked(!!data);
    }
  }, [post?.id, user]);

  useEffect(() => {
    if (post) loadLikes();
  }, [loadLikes, post]);

  const toggleLike = async () => {
    if (!user) {
      toast.error('Inicia sesión para dar like');
      return;
    }
    if (likeBusy || !post) return;
    setLikeBusy(true);

    if (liked) {
      await db
        .from('likes')
        .delete()
        .eq('entity_id', post.id)
        .eq('entity_type', 'blog_post')
        .eq('user_id', user.id);
      setLiked(false);
      setLikeCount(c => Math.max(0, c - 1));
    } else {
      await db.from('likes').insert({
        entity_id: post.id,
        entity_type: 'blog_post',
        user_id: user.id,
      });
      setLiked(true);
      setLikeCount(c => c + 1);
    }
    setLikeBusy(false);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: post?.title || '', url });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copiado');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Cargar el post
  useEffect(() => {
    const loadPost = async () => {
      if (!slug) {
        setError('Slug del artículo no encontrado');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        console.log(`🔍 Loading blog post with slug: ${slug}`);
        const postData = await blogService.getBySlug(slug);
        
        if (!postData) {
          setError('Artículo no encontrado');
          return;
        }

        // Solo mostrar posts publicados
        if (postData.status !== 'published') {
          setError('Este artículo no está disponible públicamente');
          return;
        }

        setPost(postData);
        console.log(`✅ Loaded blog post: ${postData.title}`);

        // Check if a translated version exists
        try {
          const translation = await blogService.getTranslation(slug, postData.locale);
          if (translation && translation.status === 'published') {
            setTranslationSlug(translation.slug);
          } else {
            setTranslationSlug(null);
          }
        } catch {
          setTranslationSlug(null);
        }

        // Incrementar contador de vistas si el método existe
        if (blogService.incrementViews) {
          try {
            await blogService.incrementViews(postData.id);
          } catch (viewError) {
            console.warn('Could not increment view count:', viewError);
          }
        }
        
      } catch (err) {
        console.error('❌ Error loading blog post:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar el artículo');
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [slug]);

  // Estados de carga y error
  if (loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Cargando artículo...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-20">
            <div className="text-6xl mb-6">📄</div>
            <h1 className="text-3xl font-bold mb-4">Artículo no encontrado</h1>
            <p className="text-muted-foreground mb-8">
              {error || 'El artículo que buscas no existe o ha sido movido.'}
            </p>
            <div className="flex gap-4 justify-center">
              <Button onClick={() => navigate(-1)} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver
              </Button>
              <Button asChild>
                <Link to="/blog">Ver todos los artículos</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const readTime = post.reading_time_minutes || calculateReadTime(post.content);
  const publishedDate = post.published_at || post.created_at;

  const canonicalUrl = `https://defimexico.org/blog/${post.slug}`;
  const metaDescription = post.excerpt || post.subtitle || post.title;

  return (
    <div className="min-h-screen py-8">
      <Helmet>
        <title>{post.title} - DeFi México Blog</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={canonicalUrl} />
        {post.image_url && <meta property="og:image" content={post.image_url} />}
        <meta property="article:published_time" content={post.published_at || post.created_at} />
        <meta property="article:author" content={post.author} />
        {post.tags?.map(tag => <meta key={tag} property="article:tag" content={tag} />)}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={metaDescription} />
        {post.image_url && <meta name="twitter:image" content={post.image_url} />}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": post.title,
            "description": metaDescription,
            "image": post.image_url || undefined,
            "author": { "@type": "Person", "name": post.author },
            "datePublished": post.published_at || post.created_at,
            "dateModified": post.updated_at,
            "publisher": { "@type": "Organization", "name": "DeFi México" },
            "mainEntityOfPage": canonicalUrl,
          })}
        </script>
      </Helmet>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <Breadcrumbs title={post.title} />

        {/* Artículo principal */}
        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          {/* Header del artículo */}
          <header className="mb-8">
            {/* Tags y status */}
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="secondary" className="text-xs">
                Publicado
              </Badge>
              {post.is_featured && (
                <Badge variant="default" className="text-xs">
                  Destacado
                </Badge>
              )}
              {post.categories.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {post.categories[0]}
                </Badge>
              )}
            </div>

            {/* Título */}
            <h1 className="text-4xl lg:text-5xl font-bold mb-4 leading-tight">
              {post.title}
            </h1>

            {/* Subtítulo si existe */}
            {post.subtitle && (
              <p className="text-xl text-muted-foreground mb-6 leading-relaxed">
                {post.subtitle}
              </p>
            )}

            {/* Excerpt como subtítulo alternativo */}
            {!post.subtitle && post.excerpt && (
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                {post.excerpt}
              </p>
            )}

            {/* Meta información */}
            <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground mb-6">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(publishedDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{readTime} min de lectura</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span>{post.author}</span>
              </div>
              {(post.view_count || 0) > 0 && (
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  <span>{post.view_count} vistas</span>
                </div>
              )}
            </div>

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-8">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/blog?tag=${encodeURIComponent(tag)}`}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm hover:bg-primary/20 transition-colors"
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                  </Link>
                ))}
              </div>
            )}
          </header>

          {/* Language toggle */}
          {translationSlug && (
            <Link
              to={`/blog/${translationSlug}`}
              className="flex items-center gap-2 mb-6 px-4 py-2.5 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors w-fit text-sm"
            >
              <Globe className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">
                {post.locale === 'en' ? 'Leer en Español' : 'Read in English'}
              </span>
            </Link>
          )}

          {/* Imagen destacada */}
          {post.image_url && (
            <div className="mb-8 rounded-xl overflow-hidden">
              <img
                src={post.image_url}
                alt={post.title}
                className="w-full h-96 object-cover"
              />
            </div>
          )}

          {/* Contenido del artículo */}
          <div className="mb-8">
            <PostContent content={post.content} />
          </div>

          {/* Footer del artículo */}
          <footer className="mt-12 pt-8 border-t border-border">
            <div className="flex items-center justify-between">
              {/* Información del autor */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{post.author}</p>
                  <p className="text-sm text-muted-foreground">
                    Publicado el {formatDate(publishedDate)}
                  </p>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center gap-4">
                <Button
                  variant={liked ? "default" : "outline"}
                  size="sm"
                  onClick={toggleLike}
                  disabled={likeBusy}
                >
                  <Heart className={`w-4 h-4 mr-2 ${liked ? 'fill-current' : ''}`} />
                  {likeCount > 0 ? likeCount : 'Me gusta'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const text = encodeURIComponent(post.title);
                    const shareUrl = encodeURIComponent(canonicalUrl);
                    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${shareUrl}`, '_blank', 'width=550,height=420');
                  }}
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  Tweet
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const shareUrl = encodeURIComponent(canonicalUrl);
                    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`, '_blank', 'width=550,height=420');
                  }}
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                  LinkedIn
                </Button>
                <Button variant="outline" size="sm" onClick={handleShare}>
                  {copied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                  {copied ? 'Copiado' : 'Link'}
                </Button>
              </div>
            </div>
          </footer>
        </motion.article>

        {/* Comentarios */}
        <EntityComments entityId={post.id} entityType="blog_post" countTable="blog_posts" />

        {/* Posts relacionados */}
        <RelatedPosts
          currentSlug={post.slug}
          tags={post.tags}
          categories={post.categories}
        />

        {/* CTA Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-12 text-center bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 rounded-xl border border-primary/20 p-8"
        >
          <h3 className="text-2xl font-bold mb-4">
            ¿Te gustó este artículo?
          </h3>
          <p className="text-muted-foreground mb-6">
            Suscríbete a nuestro newsletter para recibir más contenido sobre DeFi y blockchain
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild>
              <Link to="/blog">Ver más artículos</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/#newsletter">Suscribirse al newsletter</Link>
            </Button>
          </div>
        </motion.section>
      </div>
    </div>
  );
};

export default BlogPostPage;