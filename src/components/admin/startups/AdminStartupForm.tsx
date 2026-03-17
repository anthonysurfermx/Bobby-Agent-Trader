import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Eye, Plus, X, Loader2 } from "lucide-react";
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
  is_featured: boolean;
}

const AdminStartupForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
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
    is_featured: false
  });

  const availableTags = ["DeFi", "NFT", "DAO", "DEX", "Lending", "Staking", "Gaming", "Infrastructure"];
  const yearOptions = Array.from({ length: 50 }, (_, i) => new Date().getFullYear() - i);

  // Cargar datos si es edición
  useEffect(() => {
    if (id) {
      loadStartup();
    }
  }, [id]);

  const loadStartup = async () => {
    if (!id) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('startups')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          name: data.name || "",
          description: data.description || "",
          website: data.website || "",
          logo_url: data.logo_url || "",
          founded_year: data.founded_year || new Date().getFullYear(),
          founders: data.founders || [],
          tags: data.tags || [],
          tvl: data.tvl?.toString() || "",
          users: data.users?.toString() || "",
          transactions: data.transactions?.toString() || "",
          twitter: data.twitter || "",
          linkedin: data.linkedin || "",
          github: data.github || "",
          category: data.category || "",
          is_featured: data.is_featured || false
        });
      }
    } catch (error: any) {
      console.error('Error loading startup:', error);
      toast({
        title: "Error al cargar",
        description: "No se pudo cargar la startup",
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
    // Limpia formato: "10,000+" → 10000, "$1.5M" → 1500000
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
    if (!validateForm()) return;
    
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Error de autenticación",
          description: "Debes estar logueado para guardar",
          variant: "destructive"
        });
        return;
      }

      const payload = {
        name: formData.name.trim(),
        slug: generateSlug(formData.name),
        description: formData.description?.trim() || null,
        website: normalizeUrl(formData.website),
        logo_url: normalizeUrl(formData.logo_url),
        founded_year: formData.founded_year,
        founders: formData.founders.length > 0 ? formData.founders : null,
        tags: formData.tags.length > 0 ? formData.tags : null,
        category: formData.category || formData.tags[0] || null,
        tvl: parseNumber(formData.tvl),
        users: parseNumber(formData.users),
        transactions: parseNumber(formData.transactions),
        twitter: normalizeUrl(formData.twitter),
        linkedin: normalizeUrl(formData.linkedin),
        github: normalizeUrl(formData.github),
        is_featured: formData.is_featured,
        created_by: user.id,
        status: 'draft',
        updated_at: new Date().toISOString()
      };

      const { error } = id 
        ? await supabase.from('startups').update(payload).eq('id', id)
        : await supabase.from('startups').insert(payload);

      if (error) throw error;

      toast({
        title: "✅ Borrador guardado",
        description: "Los cambios se han guardado como borrador."
      });
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast({
        title: "Error al guardar",
        description: error.message || "No se pudo guardar el borrador",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!validateForm()) return;
    
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Error de autenticación",
          description: "Debes estar logueado para publicar",
          variant: "destructive"
        });
        return;
      }

      const payload = {
        name: formData.name.trim(),
        slug: generateSlug(formData.name),
        description: formData.description?.trim() || null,
        website: normalizeUrl(formData.website),
        logo_url: normalizeUrl(formData.logo_url),
        founded_year: formData.founded_year,
        founders: formData.founders.length > 0 ? formData.founders : null,
        tags: formData.tags.length > 0 ? formData.tags : null,
        category: formData.category || formData.tags[0] || null,
        tvl: parseNumber(formData.tvl),
        users: parseNumber(formData.users),
        transactions: parseNumber(formData.transactions),
        twitter: normalizeUrl(formData.twitter),
        linkedin: normalizeUrl(formData.linkedin),
        github: normalizeUrl(formData.github),
        is_featured: formData.is_featured,
        created_by: user.id,
        status: 'published',
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = id 
        ? await supabase.from('startups').update(payload).eq('id', id).select()
        : await supabase.from('startups').insert(payload).select();

      if (error) throw error;

      toast({
        title: "✅ Startup publicada",
        description: "La startup ha sido publicada exitosamente."
      });
      
      // Redirigir después de guardar
      setTimeout(() => {
        navigate('/admin/startups');
      }, 1500);
    } catch (error: any) {
      console.error('Error publishing:', error);
      toast({
        title: "Error al publicar",
        description: error.message || "No se pudo publicar la startup",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/admin/startups')}
            disabled={isLoading}
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

        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            onClick={() => setIsPreview(!isPreview)}
            className="flex items-center"
            disabled={isLoading}
          >
            <Eye className="w-4 h-4 mr-2" />
            {isPreview ? "Editar" : "Preview"}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleSaveDraft}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Guardar Borrador
          </Button>
          <Button 
            onClick={handlePublish} 
            className="bg-green-600 hover:bg-green-700 text-white font-semibold shadow-lg"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Publicando...
              </>
            ) : (
              '🚀 Publicar Startup'
            )}
          </Button>
        </div>
      </div>

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
                            {availableTags.map(cat => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="founders">
                  <Card>
                    <CardHeader>
                      <CardTitle>Fundadores</CardTitle>
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
                      <div className="space-y-2">
                        <Label htmlFor="tvl">TVL (Total Value Locked)</Label>
                        <Input
                          id="tvl"
                          value={formData.tvl}
                          onChange={(e) => handleInputChange("tvl", e.target.value)}
                          placeholder="$1.5M o 1500000"
                        />
                        <p className="text-xs text-muted-foreground">
                          Puedes usar formato: 1.5M, 1500000, $1.5M
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="users">Usuarios</Label>
                        <Input
                          id="users"
                          value={formData.users}
                          onChange={(e) => handleInputChange("users", e.target.value)}
                          placeholder="10000 o 10K"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="transactions">Transacciones</Label>
                        <Input
                          id="transactions"
                          value={formData.transactions}
                          onChange={(e) => handleInputChange("transactions", e.target.value)}
                          placeholder="50000 o 50K"
                        />
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
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="linkedin">LinkedIn</Label>
                        <Input
                          id="linkedin"
                          value={formData.linkedin}
                          onChange={(e) => handleInputChange("linkedin", e.target.value)}
                          placeholder="https://linkedin.com/company/startup"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="github">GitHub</Label>
                        <Input
                          id="github"
                          value={formData.github}
                          onChange={(e) => handleInputChange("github", e.target.value)}
                          placeholder="https://github.com/startup"
                        />
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