import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft,
  Clock,
  Users,
  Star,
  CheckCircle2,
  ExternalLink,
  PlayCircle,
  Target,
  User,
  Loader2,
  Share2,
  Heart
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { coursesService, type Course } from '@/services/courses.service';

const CourseDetailPage = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [relatedCourses, setRelatedCourses] = useState<Course[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    const loadCourseData = async () => {
      if (!courseId) return;
      
      try {
        setLoading(true);
        console.log('🔄 Cargando curso:', courseId);
        
        // Cargar curso específico
        const { data: courseData, error: courseError } = await coursesService.getCourseById(courseId);
        
        if (courseError || !courseData) {
          console.error('❌ Error cargando curso:', courseError);
          navigate('/academia');
          return;
        }
        
        setCourse(courseData);
        
        // Cargar cursos relacionados (misma categoría)
        const { data: relatedData } = await coursesService.getCoursesByCategory(
          courseData.category, 
          4
        );
        
        if (relatedData) {
          setRelatedCourses(relatedData.filter(c => c.id !== courseId));
        }
      } catch (error) {
        console.error('❌ Error:', error);
        navigate('/academia');
      } finally {
        setLoading(false);
      }
    };

    loadCourseData();
  }, [courseId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando curso...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Curso no encontrado</p>
          <Button asChild>
            <Link to="/academia">Volver a Academia</Link>
          </Button>
        </div>
      </div>
    );
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Principiante': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'Intermedio': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'Avanzado': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'defi': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'defai': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'fintech': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400';
      case 'trading': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: course.title,
        text: course.description,
        url: window.location.href
      });
    } else {
      // Fallback: copiar al portapapeles
      navigator.clipboard.writeText(window.location.href);
      alert('Enlace copiado al portapapeles');
    }
  };

  // Construir URL completa para compartir
  const currentUrl = window.location.href;
  const siteUrl = window.location.origin;
  
  // Imagen por defecto o del curso
  const courseImage = course.thumbnail_url || `${siteUrl}/og-defi-academy.jpg`;
  
  // Descripción mejorada para compartir
  const shareDescription = `${course.description} | ${course.duration} | ${course.students.toLocaleString()} estudiantes | ⭐ ${course.rating.toFixed(1)}/5`;

  return (
    <>
      {/* Metatags dinámicos para compartir */}
      <Helmet>
        <title>{course.title} - DeFi Academy México</title>
        <meta name="description" content={shareDescription} />
        
        {/* Open Graph para Facebook, WhatsApp, LinkedIn */}
        <meta property="og:title" content={`${course.title} - DeFi Academy México`} />
        <meta property="og:description" content={shareDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={currentUrl} />
        <meta property="og:image" content={courseImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="DeFi México Academy" />
        <meta property="og:locale" content="es_MX" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@DeFiMexico" />
        <meta name="twitter:title" content={`${course.title} - DeFi Academy`} />
        <meta name="twitter:description" content={shareDescription} />
        <meta name="twitter:image" content={courseImage} />
        <meta name="twitter:image:alt" content={course.title} />
        
        {/* Adicionales para SEO */}
        <meta name="author" content={course.instructor} />
        <meta name="keywords" content={`DeFi, ${course.category}, ${course.level}, blockchain, crypto, México, ${course.topics?.join(', ')}`} />
        
        {/* Schema.org estructurado para Google */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Course",
            "name": course.title,
            "description": course.description,
            "provider": {
              "@type": "Organization",
              "name": "DeFi México Academy",
              "sameAs": siteUrl
            },
            "instructor": {
              "@type": "Person",
              "name": course.instructor
            },
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": course.rating,
              "ratingCount": course.students,
              "bestRating": "5",
              "worstRating": "1"
            },
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "MXN",
              "availability": "https://schema.org/InStock"
            },
            "courseMode": "online",
            "educationalLevel": course.level,
            "inLanguage": "es-MX",
            "numberOfStudents": course.students,
            "timeRequired": course.duration,
            "hasCourseInstance": {
              "@type": "CourseInstance",
              "courseMode": "online",
              "courseWorkload": course.duration
            }
          })}
        </script>
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header con imagen de fondo */}
        <div className="relative h-[400px] bg-gradient-to-br from-primary/20 to-primary/5">
        <div className="absolute inset-0 bg-gradient-dark opacity-50" />
        
        <div className="relative container mx-auto px-4 h-full flex flex-col justify-between py-8">
          {/* Navegación superior */}
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/academia')}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver a Academia
            </Button>
            
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFavorite(!isFavorite)}
                className="text-white hover:bg-white/20"
              >
                <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleShare}
                className="text-white hover:bg-white/20"
              >
                <Share2 className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Información del curso */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-white"
          >
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge className={getLevelColor(course.level)}>
                {course.level}
              </Badge>
              <Badge className={getCategoryColor(course.category)}>
                {course.category.toUpperCase()}
              </Badge>
              {course.featured && (
                <Badge className="bg-yellow-500 text-white">
                  ⭐ Destacado
                </Badge>
              )}
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {course.title}
            </h1>
            
            <p className="text-xl text-white/90 max-w-3xl">
              {course.description}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="container mx-auto px-4 py-8 -mt-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Columna principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Estadísticas del curso */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <Users className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="text-2xl font-bold">{course.students.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Estudiantes</div>
                  </div>
                  <div className="text-center">
                    <Clock className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <div className="text-2xl font-bold">{course.duration}</div>
                    <div className="text-sm text-muted-foreground">Duración</div>
                  </div>
                  <div className="text-center">
                    <Star className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                    <div className="text-2xl font-bold">{course.rating.toFixed(1)}</div>
                    <div className="text-sm text-muted-foreground">Calificación</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs de contenido */}
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="overview">Vista General</TabsTrigger>
                <TabsTrigger value="instructor">Instructor</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Lo que aprenderás</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {course.topics.map((topic, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{topic}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

{course.requirements && course.requirements.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Requisitos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {course.requirements.map((requirement, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <Target className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <span className="text-sm">{requirement}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

{course.target_audience && course.target_audience.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Para quién es este curso</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {course.target_audience.map((audience, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <Users className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <span className="text-sm">{audience}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              
              <TabsContent value="instructor" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Acerca del Instructor</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-start gap-4">
                      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-10 h-10 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold mb-2">{course.instructor}</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Experto en {course.category === 'defi' ? 'Finanzas Descentralizadas' :
                          course.category === 'defai' ? 'DeFi e Inteligencia Artificial' :
                          course.category === 'fintech' ? 'Tecnología Financiera' :
                          'Trading y Análisis Técnico'}
                        </p>
                        <div className="flex gap-4 text-sm">
                          <div>
                            <span className="font-semibold">15+</span>
                            <span className="text-muted-foreground ml-1">años de experiencia</span>
                          </div>
                          <div>
                            <span className="font-semibold">10K+</span>
                            <span className="text-muted-foreground ml-1">estudiantes</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Columna lateral */}
          <div className="space-y-6">
            {/* Card de inscripción */}
            <Card className="sticky top-4">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary mb-2">
                      Gratis
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Acceso completo al curso
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-3">
                    <Button 
                      className="w-full" 
                      size="lg"
                      onClick={() => navigate('/login')}
                    >
                      <PlayCircle className="w-5 h-5 mr-2" />
                      Registro previo
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="w-full"
                      asChild
                    >
                      <a href={course.circle_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Ver en Circle.so
                      </a>
                    </Button>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>Acceso de por vida</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>Certificado de finalización</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>Actualizaciones incluidas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>Comunidad de estudiantes</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Información adicional */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Información del Curso</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Última actualización</span>
                  <span>{new Date(course.updated_at).toLocaleDateString('es-MX')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Idioma</span>
                  <span>Español</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nivel</span>
                  <span>{course.level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Categoría</span>
                  <span className="uppercase">{course.category}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Cursos relacionados */}
        {relatedCourses.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold mb-6">Cursos Relacionados</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedCourses.slice(0, 3).map((relatedCourse) => (
                <Card 
                  key={relatedCourse.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => navigate(`/curso/${relatedCourse.id}`)}
                >
                  <CardContent className="pt-6">
                    <Badge className={`${getCategoryColor(relatedCourse.category)} mb-2`}>
                      {relatedCourse.category.toUpperCase()}
                    </Badge>
                    <h3 className="font-semibold mb-2 line-clamp-2">{relatedCourse.title}</h3>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {relatedCourse.description}
                    </p>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500" />
                        <span>{relatedCourse.rating.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span>{relatedCourse.students}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span>{relatedCourse.duration}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );
};

export default CourseDetailPage;