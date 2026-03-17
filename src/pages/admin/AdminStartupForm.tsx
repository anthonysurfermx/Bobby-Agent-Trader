import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Eye, Plus, X, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

interface StartupFormData {
  name: string;
  description: string;
  website: string;
  logo_url: string;
  founded_year: number;
  founders: string[];
  tags: string[];
  tvl: string;
  users: string;
  transactions: string;
  twitter: string;
  linkedin: string;
  github: string;
  category: string;
  stage: string;
  is_featured: boolean;
}

const AdminStartupForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { hasRole, isAdmin } = useAuth();
  
  // Verificar permisos
  const isStartupOwner = hasRole('startup_owner');
  const canEdit = isAdmin() || hasRole('editor');
  const canPublish = isAdmin() || hasRole('editor');
  
  // Debug logs
  console.log('🔍 AdminStartupForm - isStartupOwner:', isStartupOwner);
  console.log('🔍 AdminStartupForm - canEdit:', canEdit);
  console.log('🔍 AdminStartupForm - canPublish:', canPublish);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [newFounder, setNewFounder] = useState("");
  
  const [formData, setFormData] = useState<StartupFormData>({
    name: "",
    description: "",
    website: "",
    logo_url: "",
    founded_year: new Date().getFullYear(),
    founders: [],
    tags: [],
    tvl: "",
    users: "",
    transactions: "",
    twitter: "",
    linkedin: "",
    github: "",
    category: "",
    stage: "",
    is_featured: false
  });

  // Categorías disponibles - El valor se usa tanto para display como para guardar
  // IMPORTANTE: "mvp_hackathon" se guarda así en la BD para filtrar proyectos de hackathon
  const availableCategories = [
    { value: "mvp_hackathon", label: "MVP Hackathon" },
    { value: "DeFi", label: "DeFi" },
    { value: "NFT", label: "NFT" },
    { value: "DAO", label: "DAO" },
    { value: "DEX", label: "DEX" },
    { value: "Lending", label: "Lending" },
    { value: "Staking", label: "Staking" },
    { value: "Gaming", label: "Gaming" },
    { value: "Infrastructure", label: "Infrastructure" }
  ];
  const availableTags = ["DeFi", "NFT", "DAO", "DEX", "Lending", "Staking", "Gaming", "Infrastructure"];
  const yearOptions = Array.from({ length: 50 }, (_, i) => new Date().getFullYear() - i);

  // Verificar permisos para edición
  useEffect(() => {
    // Solo admins y editores pueden editar startups existentes
    if (id && isStartupOwner && !canEdit) {
      toast({
        title: "Acceso Denegado",
        description: "No tienes permisos para editar startups existentes.",
        variant: "destructive",
      });
      navigate('/user');
      return;
    }
    
    // Cargar datos si es edición
    if (id) {
      loadStartup();
    }
  }, [id, isStartupOwner, canEdit]);
  
  // Función para determinar el botón de vuelta según el rol
  const getBackRoute = () => {
    if (isStartupOwner) {
      return '/user';
    }
    return '/admin/startups';
  };

  const loadStartup = async () => {
    if (!id) return;
    
    setIsLoading(true);
    try {
      console.log('📥 Cargando startup con ID:', id);
      
      const { data, error } = await supabase
        .from('startups')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        console.log('✅ Datos cargados:', data);
        
        // Mapear los datos de la tabla a nuestro formulario
        setFormData({
          name: data.name || "",
          description: data.description || "",
          website: data.website || "",
          logo_url: data.logo_url || "",
          founded_year: data.founded_date ? new Date(data.founded_date).getFullYear() : new Date().getFullYear(),
          founders: [], // No existe en la tabla actual
          tags: data.tags || [],
          tvl: "", // No existe directamente
          users: data.total_users?.toString() || "",
          transactions: "", // No existe directamente
          twitter: data.twitter_url || "",
          linkedin: data.linkedin_url || "",
          github: data.github_url || "",
          category: data.categories?.[0] || "",
          stage: data.stage || "",
          is_featured: data.is_featured || false
        });
      }
    } catch (error: any) {
      console.error('❌ Error loading startup:', error);
      toast({
        title: "Error al cargar",
        description: error.message || "No se pudo cargar la startup",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Utilidades
  const normalizeUrl = (url: string) => {
    if (!url) return "";
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const parseNumber = (value: string): number | null => {
    if (!value) return null;
    const cleaned = value.replace(/[$,+]/g, "")
      .replace(/M$/i, "000000")
      .replace(/K$/i, "000");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  };

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleInputChange = (field: keyof StartupFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const addFounder = () => {
    if (newFounder.trim() && !formData.founders.includes(newFounder.trim())) {
      setFormData(prev => ({
        ...prev,
        founders: [...prev.founders, newFounder.trim()]
      }));
      setNewFounder("");
    }
  };

  const removeFounder = (founder: string) => {
    setFormData(prev => ({
      ...prev,
      founders: prev.founders.filter(f => f !== founder)
    }));
  };

  const addTag = (tag: string) => {
    if (!formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast({
        title: "Error de validación",
        description: "El nombre es obligatorio",
        variant: "destructive"
      });
      return false;
    }

    // Validar URLs si existen
    const urlFields = ['website', 'twitter', 'linkedin', 'github'] as const;
    for (const field of urlFields) {
      const value = formData[field];
      if (value && !/^https?:\/\/.+/.test(value)) {
        toast({
          title: "Error de validación",
          description: `${field} debe ser una URL válida (empezar con http:// o https://)`,
          variant: "destructive"
        });
        return false;
      }
    }

    return true;
  };

  const handleSaveDraft = async () => {
    console.log('💾 Intentando guardar borrador...');
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "El nombre es obligatorio",
        variant: "destructive"
      });
      return;
    }
    
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('❌ Usuario no autenticado');
        toast({
          title: "Error de autenticación",
          description: "Debes estar logueado para guardar",
          variant: "destructive"
        });
        return;
      }

      // Payload adaptado a la estructura real de la tabla
      const payload = {
        name: formData.name.trim(),
        slug: generateSlug(formData.name),
        description: formData.description?.trim() || 'Sin descripción', // Valor por defecto en lugar de null
        website: normalizeUrl(formData.website),
        logo_url: normalizeUrl(formData.logo_url),
        founded_date: formData.founded_year ? `${formData.founded_year}-01-01` : null,
        // Mapear las redes sociales a los campos correctos
        linkedin_url: normalizeUrl(formData.linkedin),
        twitter_url: normalizeUrl(formData.twitter),
        github_url: normalizeUrl(formData.github),
        // Arrays
        tags: formData.tags.length > 0 ? formData.tags : null,
        categories: formData.category ? [formData.category] : null,
        // Stage de la startup
        stage: formData.stage || null,
        // Números
        total_users: parseNumber(formData.users),
        // Campos requeridos por la tabla
        is_featured: canEdit ? formData.is_featured : false, // Solo admins/editores pueden marcar como featured
        status: isStartupOwner ? 'pending' : 'draft', // Startup owners envían directo a revisión
        country: 'México',
        city: 'Ciudad de México',
        created_by: user.id
      };

      console.log('📦 Enviando borrador:', payload);

      const { data, error } = id 
        ? await supabase.from('startups').update(payload).eq('id', id).select()
        : await supabase.from('startups').insert([payload]).select();

      if (error) {
        console.error('❌ Error de Supabase:', error);
        throw error;
      }

      console.log('✅ Borrador guardado:', data);

      const successTitle = isStartupOwner ? "✅ Startup enviada para revisión" : "✅ Borrador guardado";
      const successMessage = isStartupOwner 
        ? "Tu startup ha sido enviada para revisión. Te notificaremos cuando sea aprobada."
        : "Los cambios se han guardado como borrador.";
      
      toast({
        title: successTitle,
        description: successMessage
      });
      
      // Redirección según el rol
      console.log('🚀 Guardado exitoso, verificando redirección...');
      console.log('🚀 isStartupOwner:', isStartupOwner);
      console.log('🚀 data:', data);
      
      if (isStartupOwner) {
        // Startup owners van de vuelta a su dashboard
        console.log('🚀 Redirigiendo startup owner a dashboard...');
        navigate('/user');
      } else if (!id && data && data[0]) {
        // Admins/editores van a la página de edición si es nuevo
        console.log('🚀 Redirigiendo admin a edición...');
        navigate(`/admin/startups/edit/${data[0].id}`, { replace: true });
      } else {
        console.log('🚀 No hay redirección específica configurada');
      }
    } catch (error: any) {
      console.error('❌ Error saving draft:', error);
      toast({
        title: "Error al guardar",
        description: error.message || "No se pudo guardar el borrador",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    // Limpiar consola para ver solo este intento
    console.clear();
    console.log('%c🚀 INICIANDO PUBLICACIÓN...', 'color: yellow; font-size: 20px; font-weight: bold');
    console.log('📋 Datos del formulario:', formData);
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "El nombre es obligatorio",
        variant: "destructive"
      });
      return;
    }
    
    setIsPublishing(true);
    try {
      // Test de conexión primero
      console.log('🔌 Probando conexión con Supabase...');
      const { data: testData, error: testError } = await supabase
        .from('startups')
        .select('count')
        .limit(1);
      
      if (testError) {
        console.error('❌ Error de conexión:', testError);
        alert(`Error de conexión: ${testError.message}`);
        throw testError;
      }
      console.log('✅ Conexión exitosa');

      // Verificar autenticación
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Error de autenticación",
          description: "Debes estar logueado para publicar",
          variant: "destructive"
        });
        return;
      }

      // Payload adaptado a la estructura real de la tabla
      const payload = {
        name: formData.name.trim(),
        slug: generateSlug(formData.name),
        description: formData.description?.trim() || null,
        website: normalizeUrl(formData.website) || null,
        logo_url: normalizeUrl(formData.logo_url) || null,
        founded_date: formData.founded_year ? `${formData.founded_year}-01-01` : null,
        // Mapear las redes sociales a los campos correctos
        linkedin_url: normalizeUrl(formData.linkedin) || null,
        twitter_url: normalizeUrl(formData.twitter) || null,
        github_url: normalizeUrl(formData.github) || null,
        // Arrays
        tags: formData.tags.length > 0 ? formData.tags : null,
        categories: formData.category ? [formData.category] : null,
        // Stage de la startup
        stage: formData.stage || null,
        // Números
        total_users: parseNumber(formData.users),
        // Campos requeridos por la tabla
        is_featured: formData.is_featured || false,
        status: 'published',
        country: 'México',
        city: 'Ciudad de México',
        created_by: user.id
      };

      console.log('📦 Payload a enviar:', JSON.stringify(payload, null, 2));

      // Debug específico del status
      console.log('🏷️ Status que estamos enviando:', payload.status);
      console.log('🏷️ Tipo de dato status:', typeof payload.status);

      // Intentar insertar
      console.log('📤 Enviando a Supabase...');
      const { data, error } = id 
        ? await supabase.from('startups').update(payload).eq('id', id).select()
        : await supabase.from('startups').insert([payload]).select();

      console.log('📥 Respuesta de Supabase:', { data, error });

      if (error) {
        console.error('%c❌ ERROR DE SUPABASE:', 'color: red; font-size: 16px; font-weight: bold');
        console.error('Mensaje:', error.message);
        console.error('Detalles:', error.details);
        console.error('Hint:', error.hint);
        console.error('Código:', error.code);
        
        // Mostrar error en un alert para asegurarnos de verlo
        alert(`
ERROR DE SUPABASE:
================
Mensaje: ${error.message}
Detalles: ${error.details || 'N/A'}
Hint: ${error.hint || 'N/A'}
Código: ${error.code || 'N/A'}

Revisa la consola para más detalles.
        `);
        
        throw error;
      }

      console.log('%c✅ STARTUP PUBLICADA EXITOSAMENTE!', 'color: green; font-size: 16px; font-weight: bold');
      console.log('Datos guardados:', data);

      toast({
        title: "🚀 Startup publicada",
        description: "La startup ha sido publicada exitosamente."
      });
      
      // Redirigir después de guardar
      setTimeout(() => {
        navigate('/admin/startups');
      }, 1500);
    } catch (error: any) {
      console.error('%c💥 ERROR CAPTURADO:', 'color: red; font-size: 14px; font-weight: bold', error);
      toast({
        title: "Error al publicar",
        description: error.message || "No se pudo publicar la startup",
        variant: "destructive"
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // Preview Card Component
  const PreviewCard = () => (
    <Card className="bg-gradient-dark border-border hover:border-primary/30 transition-all duration-300 max-w-sm">
      <CardContent className="p-6">
        <div className="flex items-center space-x-4 mb-4">
          <Avatar className="w-16 h-16">
            <AvatarImage src={formData.logo_url} alt={formData.name} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg">
              {formData.name.slice(0, 2).toUpperCase() || "ST"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground truncate">
              {formData.name || "Nombre de Startup"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Fundada en {formData.founded_year}
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
          {formData.description || "Descripción de la startup..."}
        </p>

        {formData.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {formData.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center">
          <Button size="sm" variant="outline">
            Ver más
          </Button>
          {formData.website && (
            <Button size="sm" variant="ghost" asChild>
              <a href={normalizeUrl(formData.website)} target="_blank" rel="noopener noreferrer">
                🔗
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header - Responsive */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center space-x-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate(getBackRoute())}
            disabled={isLoading || isSaving || isPublishing}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {id ? 'Editar Startup' : 'Nueva Startup'}
            </h1>
            <p className="text-muted-foreground">
              {id ? 'Modifica los datos de la startup' : 'Agrega una nueva startup al directorio'}
            </p>
          </div>
        </div>

        {/* Botones de acción - Responsive */}
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setIsPreview(!isPreview)}
            disabled={isLoading}
          >
            <Eye className="w-4 h-4 mr-2" />
            {isPreview ? "Editar" : "Preview"}
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleSaveDraft}
            disabled={isSaving || isPublishing}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
{isStartupOwner ? 'Enviar para Revisión' : 'Guardar Borrador'}
          </Button>
          
          {/* BOTÓN PUBLICAR - Solo para admins y editores */}
          {canPublish && (
            <Button 
              onClick={handlePublish} 
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              disabled={isPublishing || isSaving}
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publicando...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Publicar Startup
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Alerta informativa */}
      {!id && (
        <Card className="mb-6 border-blue-500/20 bg-blue-500/5">
          <CardContent className="py-3 px-4">
            <p className="text-sm text-blue-400">
              💡 <strong>Tip:</strong> Usa "Guardar Borrador" para guardar sin publicar. 
              Usa "Publicar Startup" cuando esté lista para ser visible públicamente.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Debug Info en desarrollo */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="mb-6 border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-yellow-400 font-mono">
              🐛 Debug: Abre la consola (F12) para ver los logs del proceso
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2">
          {isPreview ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="flex justify-center"
            >
              <PreviewCard />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Tabs defaultValue="basic" className="space-y-6">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="basic">Básico</TabsTrigger>
                  <TabsTrigger value="founders">Founders</TabsTrigger>
                  <TabsTrigger value="metrics">Métricas</TabsTrigger>
                  <TabsTrigger value="social">Enlaces</TabsTrigger>
                </TabsList>

                <TabsContent value="basic">
                  <Card>
                    <CardHeader>
                      <CardTitle>Información Básica</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Nombre *</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => handleInputChange("name", e.target.value)}
                            placeholder="Nombre de la startup"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="founded_year">Año de Fundación</Label>
                          <Select 
                            value={formData.founded_year.toString()} 
                            onValueChange={(value) => handleInputChange("founded_year", parseInt(value))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {yearOptions.map(year => (
                                <SelectItem key={year} value={year.toString()}>
                                  {year}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Descripción</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => handleInputChange("description", e.target.value)}
                          placeholder="Describe qué hace la startup..."
                          rows={4}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="website">Website</Label>
                          <Input
                            id="website"
                            value={formData.website}
                            onChange={(e) => handleInputChange("website", e.target.value)}
                            placeholder="https://ejemplo.com"
                            type="url"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="logo_url">Logo URL</Label>
                          <Input
                            id="logo_url"
                            value={formData.logo_url}
                            onChange={(e) => handleInputChange("logo_url", e.target.value)}
                            placeholder="https://ejemplo.com/logo.png"
                            type="url"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Categoría</Label>
                          <Select
                            value={formData.category}
                            onValueChange={(value) => handleInputChange("category", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona una categoría" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableCategories.map(cat => (
                                <SelectItem key={cat.value} value={cat.value}>
                                  {cat.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Stage *</Label>
                          <Select
                            value={formData.stage}
                            onValueChange={(value) => handleInputChange("stage", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona el stage" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MVP">MVP (Hackathon)</SelectItem>
                              <SelectItem value="Grants">Grants</SelectItem>
                              <SelectItem value="Pre-seed">Pre-seed</SelectItem>
                              <SelectItem value="Seed">Seed</SelectItem>
                              <SelectItem value="Series A">Series A</SelectItem>
                              <SelectItem value="Series B">Series B</SelectItem>
                              <SelectItem value="Series C+">Series C+</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Los proyectos MVP aparecerán en "MVPs Hackathon"
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Tags</Label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {formData.tags.map(tag => (
                            <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                              {tag}
                              <X 
                                className="w-3 h-3 cursor-pointer" 
                                onClick={() => removeTag(tag)}
                              />
                            </Badge>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {availableTags.filter(tag => !formData.tags.includes(tag)).map(tag => (
                            <Badge 
                              key={tag} 
                              variant="outline" 
                              className="cursor-pointer hover:bg-primary/10"
                              onClick={() => addTag(tag)}
                            >
                              + {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Solo admins/editores pueden marcar como destacada */}
                      {canEdit && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="is_featured"
                            checked={formData.is_featured}
                            onChange={(e) => handleInputChange("is_featured", e.target.checked)}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="is_featured">Startup destacada</Label>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="founders">
                  <Card>
                    <CardHeader>
                      <CardTitle>Fundadores</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        ⚠️ Nota: Los fundadores se guardarán en una tabla separada en futuras actualizaciones.
                        Por ahora, esta información es solo visual.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Fundadores</Label>
                        <div className="flex gap-2">
                          <Input
                            value={newFounder}
                            onChange={(e) => setNewFounder(e.target.value)}
                            placeholder="Nombre del fundador"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addFounder();
                              }
                            }}
                          />
                          <Button onClick={addFounder} type="button">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {formData.founders.map(founder => (
                            <div key={founder} className="flex items-center justify-between p-2 bg-secondary/20 rounded">
                              <span>{founder}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeFounder(founder)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="metrics">
                  <Card>
                    <CardHeader>
                      <CardTitle>Métricas</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2 opacity-50">
                        <Label htmlFor="tvl">TVL (Total Value Locked)</Label>
                        <Input
                          id="tvl"
                          value={formData.tvl}
                          onChange={(e) => handleInputChange("tvl", e.target.value)}
                          placeholder="$1.5M o 1500000"
                          disabled
                        />
                        <p className="text-xs text-muted-foreground">
                          ⚠️ Este campo se agregará en futuras actualizaciones
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="users">Usuarios Totales</Label>
                        <Input
                          id="users"
                          value={formData.users}
                          onChange={(e) => handleInputChange("users", e.target.value)}
                          placeholder="10000 o 10K"
                        />
                        <p className="text-xs text-muted-foreground">
                          Puedes usar formato: 10000, 10K, 10M
                        </p>
                      </div>
                      
                      <div className="space-y-2 opacity-50">
                        <Label htmlFor="transactions">Transacciones</Label>
                        <Input
                          id="transactions"
                          value={formData.transactions}
                          onChange={(e) => handleInputChange("transactions", e.target.value)}
                          placeholder="50000 o 50K"
                          disabled
                        />
                        <p className="text-xs text-muted-foreground">
                          ⚠️ Este campo se agregará en futuras actualizaciones
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="social">
                  <Card>
                    <CardHeader>
                      <CardTitle>Redes Sociales</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="twitter">Twitter/X</Label>
                        <Input
                          id="twitter"
                          value={formData.twitter}
                          onChange={(e) => handleInputChange("twitter", e.target.value)}
                          placeholder="https://twitter.com/startup"
                        />
                        <p className="text-xs text-muted-foreground">
                          URL completa de Twitter/X
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="linkedin">LinkedIn</Label>
                        <Input
                          id="linkedin"
                          value={formData.linkedin}
                          onChange={(e) => handleInputChange("linkedin", e.target.value)}
                          placeholder="https://linkedin.com/company/startup"
                        />
                        <p className="text-xs text-muted-foreground">
                          URL completa de LinkedIn
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="github">GitHub</Label>
                        <Input
                          id="github"
                          value={formData.github}
                          onChange={(e) => handleInputChange("github", e.target.value)}
                          placeholder="https://github.com/startup"
                        />
                        <p className="text-xs text-muted-foreground">
                          URL completa de GitHub
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </div>

        {/* Live Preview */}
        {!isPreview && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:col-span-1"
          >
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-sm">Preview en Vivo</CardTitle>
              </CardHeader>
              <CardContent>
                <PreviewCard />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AdminStartupForm;