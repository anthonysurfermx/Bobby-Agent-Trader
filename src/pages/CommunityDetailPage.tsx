// src/pages/CommunityDetailPage.tsx - CONECTADO CON BASE DE DATOS REAL
import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  PixelArrowLeft,
  PixelCalendar,
  PixelUsers,
  PixelExternalLink,
  PixelMessageCircle,
  PixelMapPin,
  PixelShield,
  PixelStar,
  PixelLoader,
  PixelAlertCircle,
  PixelGlobe,
  PixelHash,
  PixelTrendingUp
} from "@/components/ui/pixel-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";

// Importar tu servicio existente
import { communitiesService } from "@/services/communities.service";
import type { Community } from "@/types";
import { EntityComments } from "@/components/BlogComments";

// Helper para obtener avatar de Twitter/X usando unavatar.io
const getTwitterAvatar = (twitterUrl: string): string | null => {
  try {
    // Soporta tanto twitter.com como x.com
    let username = twitterUrl.split('twitter.com/')[1]?.split(/[/?#]/)[0];
    if (!username) {
      username = twitterUrl.split('x.com/')[1]?.split(/[/?#]/)[0];
    }
    if (username) {
      username = username.replace('@', '');
      return `https://unavatar.io/twitter/${username}`;
    }
    return null;
  } catch {
    return null;
  }
};

const CommunityDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // Estados
  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cargar datos de la comunidad
  useEffect(() => {
    const loadCommunity = async () => {
      if (!id) {
        setError('ID de comunidad no proporcionado');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Intentar obtener por ID primero, luego por slug si falla
        let result = await communitiesService.getById(id);
        
        // Si no se encuentra por ID, intentar por slug
        if (!result.data && result.error) {
          result = await communitiesService.getBySlug(id);
        }

        if (result.data) {
          setCommunity(result.data);
        } else {
          setError(result.error || 'Comunidad no encontrada');
        }
      } catch (err) {
        console.error('Error loading community:', err);
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    loadCommunity();
  }, [id]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-20">
            <PixelLoader size={32} className="mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Cargando comunidad...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !community) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-20">
            <PixelAlertCircle size={32} className="mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">Comunidad no encontrada</h3>
            <p className="text-muted-foreground mb-4">
              {error || 'La comunidad que buscas no existe o ha sido eliminada'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => navigate(-1)}>
                <PixelArrowLeft size={16} className="mr-2" />
                Volver
              </Button>
              <Button asChild>
                <Link to="/comunidades">
                  Ver todas las comunidades
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Extraer datos seguros de la comunidad
  const socialLinks = community.links || {};
  const twitterAvatar = socialLinks?.twitter ? getTwitterAvatar(socialLinks.twitter as string) : null;
  const logoUrl = community.image_url?.toString() || twitterAvatar || '';
  const bannerUrl = community.banner_url?.toString() || '';

  // Debug: ver qué datos llegan
  console.log('🔍 Debug Community:', {
    name: community.name,
    image_url: community.image_url,
    links: community.links,
    socialLinks,
    twitterAvatar,
    logoUrl
  });
  const tags = Array.isArray(community.tags) ? community.tags : [];
  const moderators = community.moderators && typeof community.moderators === 'object' 
    ? Object.keys(community.moderators) 
    : [];
  const rules = community.rules || {};
  const longDescription = community.long_description || community.description;

  const metaDescription = community.description || `${community.name} - Comunidad DeFi en México`;
  const metaImage = logoUrl || 'https://defimexico.org/maincover.jpeg';

  return (
    <div className="min-h-screen py-8">
      <Helmet>
        <title>{community.name} - DeFi México Comunidades</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={`https://defimexico.org/comunidades/${community.slug || community.id}`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`${community.name} - DeFi México`} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:image" content={metaImage} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={`${community.name} - DeFi México`} />
        <meta name="twitter:description" content={metaDescription} />
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <Button variant="ghost" asChild className="hover:bg-muted">
            <Link to="/comunidades">
              <PixelArrowLeft size={16} className="mr-2" />
              Volver a comunidades
            </Link>
          </Button>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Main Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-2 space-y-8"
          >
            
            {/* Hero Section */}
            <Card className="overflow-hidden">
              {bannerUrl && (
                <div className="h-32 bg-gradient-to-r from-primary/20 to-secondary/20 relative overflow-hidden">
                  <img 
                    src={bannerUrl} 
                    alt={`${community.name} banner`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/20" />
                </div>
              )}
              
              <CardContent className="p-8">
                <div className="flex items-start gap-6">
                  {/* Logo */}
                  <div className="flex-shrink-0">
                    {logoUrl ? (
                      <img 
                        src={logoUrl} 
                        alt={community.name}
                        className="w-20 h-20 rounded-2xl object-cover border-2 border-border"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-2xl">
                        {community.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h1 className="text-3xl font-bold text-foreground">
                        {community.name}
                      </h1>
                      
                      {/* Badges */}
                      <div className="flex gap-2">
                        {community.is_verified && (
                          <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
                            <PixelShield size={12} className="mr-1" />
                            Verificada
                          </Badge>
                        )}
                        {community.is_featured && (
                          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                            <PixelStar size={12} className="mr-1" />
                            Destacada
                          </Badge>
                        )}
                        {community.is_official && (
                          <Badge variant="default">
                            <PixelShield size={12} className="mr-1" />
                            Oficial
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Category and Meta */}
                    <div className="flex items-center gap-4 text-muted-foreground mb-4">
                      {community.category && (
                        <div className="flex items-center gap-1">
                          <PixelHash size={16} />
                          <span className="capitalize">{community.category}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <PixelCalendar size={16} />
                        <span>Creada en {new Date(community.created_at).getFullYear()}</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <div className="text-2xl font-bold text-primary">
                          {community.member_count?.toLocaleString() || '0'}
                        </div>
                        <div className="text-xs text-muted-foreground">Miembros</div>
                      </div>
                      
                      <div className="text-center p-3 rounded-lg bg-secondary/5 border border-secondary/20">
                        <div className="text-2xl font-bold text-secondary">
                          {community.active_members_count?.toLocaleString() || '0'}
                        </div>
                        <div className="text-xs text-muted-foreground">Activos</div>
                      </div>
                      
                      <div className="text-center p-3 rounded-lg bg-muted/50 border border-border">
                        <div className="text-2xl font-bold text-foreground">
                          {community.post_count?.toLocaleString() || '0'}
                        </div>
                        <div className="text-xs text-muted-foreground">Posts</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-6">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle>Sobre la comunidad</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-neutral dark:prose-invert max-w-none">
                  <p className="text-muted-foreground leading-relaxed">
                    {typeof longDescription === 'string' 
                      ? longDescription 
                      : community.description
                    }
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Rules (si existen) */}
            {rules && Object.keys(rules).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Reglas de la comunidad</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(rules).map(([key, value], index) => (
                      <div key={key} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold flex-shrink-0">
                          {index + 1}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>

          {/* Sidebar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="space-y-6"
          >
            
            {/* Social Links */}
            {Object.keys(socialLinks).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Enlaces</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(socialLinks).map(([platform, url]) => {
                      if (!url || typeof url !== 'string') return null;
                      
                      // Icon mapping
                      const getIcon = (platform: string) => {
                        switch (platform.toLowerCase()) {
                          case 'discord': return '💬';
                          case 'telegram': return '✈️';
                          case 'twitter': return '🐦';
                          case 'github': return '🐙';
                          case 'linkedin': return '💼';
                          case 'website': return '🌐';
                          default: return '🔗';
                        }
                      };

                      return (
                        <Button
                          key={platform}
                          variant="outline"
                          size="sm"
                          asChild
                          className="w-full justify-start"
                        >
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            <span className="mr-2">{getIcon(platform)}</span>
                            <span className="capitalize">{platform}</span>
                            <PixelExternalLink size={12} className="ml-auto" />
                          </a>
                        </Button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Moderators */}
            {moderators.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Moderadores</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {moderators.slice(0, 5).map((moderator) => (
                      <div key={moderator} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-sm font-semibold">
                          {moderator.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </div>
                        <span className="text-sm font-medium">{moderator}</span>
                      </div>
                    ))}
                    {moderators.length > 5 && (
                      <p className="text-xs text-muted-foreground">
                        +{moderators.length - 5} más
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Community Info */}
            <Card>
              <CardHeader>
                <CardTitle>Información</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Categoría</span>
                  <span className="font-medium capitalize">
                    {community.category || 'General'}
                  </span>
                </div>

                <Separator />

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Miembros</span>
                  <span className="font-medium">
                    {community.member_count?.toLocaleString() || '0'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Miembros Activos</span>
                  <span className="font-medium">
                    {community.active_members_count?.toLocaleString() || '0'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Posts</span>
                  <span className="font-medium">
                    {community.post_count?.toLocaleString() || '0'}
                  </span>
                </div>

                <Separator />

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Creada</span>
                  <span className="font-medium">
                    {new Date(community.created_at).toLocaleDateString('es-MX', {
                      year: 'numeric',
                      month: 'long'
                    })}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Última actualización</span>
                  <span className="font-medium">
                    {new Date(community.updated_at).toLocaleDateString('es-MX', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Join CTA */}
            <Card className="bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary mx-auto mb-4 flex items-center justify-center">
                  <PixelUsers size={24} className="text-white" />
                </div>
                <h3 className="font-semibold mb-2">¡Únete a la comunidad!</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Conecta con {community.member_count?.toLocaleString() || 'otros'} miembros de la comunidad DeFi mexicana
                </p>
                
                {/* Primary link (first social link or website) */}
                {Object.entries(socialLinks).length > 0 && (
                  <Button size="sm" className="w-full" asChild>
                    <a 
                      href={Object.values(socialLinks)[0] as string} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      Unirse ahora
                      <PixelExternalLink size={16} className="ml-2" />
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Comentarios */}
        <div className="max-w-4xl mx-auto">
          <EntityComments entityId={community.id} entityType="community" />
        </div>
      </div>
    </div>
  );
};

export default CommunityDetailPage;