import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Eye, Plus, X, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface BlogFormData {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImage: string;
  category: string;
  tags: string[];
  author: string;
  publishDate: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  keywords: string[];
  status: "draft" | "published" | "scheduled";
  visibility: "public" | "private" | "members";
  allowComments: boolean;
  featured: boolean;
  newsletter: boolean;
  readingTime: number;
}

const AdminBlogForm = () => {
  const { toast } = useToast();
  const [isPreview, setIsPreview] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  
  const [formData, setFormData] = useState<BlogFormData>({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    featuredImage: "",
    category: "",
    tags: [],
    author: "",
    publishDate: new Date().toISOString().split('T')[0],
    metaTitle: "",
    metaDescription: "",
    canonicalUrl: "",
    keywords: [],
    status: "draft",
    visibility: "public",
    allowComments: true,
    featured: false,
    newsletter: false,
    readingTime: 5
  });

  const categories = ["DeFi", "Blockchain", "Tutoriales", "Noticias", "Análisis", "Eventos"];
  const authors = ["Admin", "Editorial", "Invitado"];

  const handleInputChange = (field: keyof BlogFormData, value: string | number | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Auto-generate slug from title
    if (field === "title" && typeof value === "string") {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
      setFormData(prev => ({ ...prev, slug }));
    }
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !formData.keywords.includes(newKeyword.trim())) {
      setFormData(prev => ({
        ...prev,
        keywords: [...prev.keywords, newKeyword.trim()]
      }));
      setNewKeyword("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setFormData(prev => ({
      ...prev,
      keywords: prev.keywords.filter(k => k !== keyword)
    }));
  };

  const handleSaveDraft = () => {
    toast({
      title: "Borrador guardado",
      description: "El artículo se ha guardado como borrador.",
    });
  };

  const handlePublish = () => {
    toast({
      title: "Artículo publicado",
      description: "El artículo ha sido publicado exitosamente.",
    });
  };

  // Preview Card Component
  const PreviewCard = () => (
    <Card className="bg-gradient-dark border-border hover:border-primary/30 transition-all duration-300">
      <CardContent className="p-0">
        {formData.featuredImage && (
          <div className="aspect-video bg-muted rounded-t-lg overflow-hidden">
            <img 
              src={formData.featuredImage} 
              alt={formData.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-3">
            {formData.category && (
              <Badge variant="secondary" className="text-xs">
                {formData.category}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {formData.readingTime} min lectura
            </span>
          </div>
          
          <h3 className="text-lg font-semibold text-foreground mb-2 line-clamp-2">
            {formData.title || "Título del artículo"}
          </h3>
          
          <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
            {formData.excerpt || "Extracto del artículo..."}
          </p>
          
          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-4">
              {formData.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formData.author || "Autor"}</span>
            <span>{new Date(formData.publishDate).toLocaleDateString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/blog">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Nuevo Artículo</h1>
            <p className="text-muted-foreground">
              Crea un nuevo artículo para el blog
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            onClick={() => setIsPreview(!isPreview)}
            className="flex items-center"
          >
            <Eye className="w-4 h-4 mr-2" />
            {isPreview ? "Editar" : "Preview"}
          </Button>
          <Button variant="outline" onClick={handleSaveDraft}>
            <Save className="w-4 h-4 mr-2" />
            Guardar Borrador
          </Button>
          <Button onClick={handlePublish} className="bg-gradient-primary text-primary-foreground">
            {formData.status === "scheduled" ? "Programar" : "Publicar"}
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
              <Tabs defaultValue="content" className="space-y-6">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="content">Contenido</TabsTrigger>
                  <TabsTrigger value="categorization">Categorización</TabsTrigger>
                  <TabsTrigger value="seo">SEO</TabsTrigger>
                  <TabsTrigger value="settings">Configuración</TabsTrigger>
                </TabsList>

                <TabsContent value="content">
                  <Card>
                    <CardHeader>
                      <CardTitle>Información del Artículo</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="title">Título del Artículo *</Label>
                        <Input
                          id="title"
                          value={formData.title}
                          onChange={(e) => handleInputChange("title", e.target.value)}
                          placeholder="Título del artículo..."
                          className="text-lg font-medium"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="slug">Slug</Label>
                        <div className="flex items-center">
                          <span className="text-sm text-muted-foreground mr-2">defi-mexico.com/blog/</span>
                          <Input
                            id="slug"
                            value={formData.slug}
                            onChange={(e) => handleInputChange("slug", e.target.value)}
                            placeholder="url-del-articulo"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="excerpt">Extracto *</Label>
                        <Textarea
                          id="excerpt"
                          value={formData.excerpt}
                          onChange={(e) => handleInputChange("excerpt", e.target.value)}
                          placeholder="Breve descripción del artículo..."
                          rows={3}
                          maxLength={160}
                        />
                        <div className="text-xs text-muted-foreground text-right">
                          {formData.excerpt.length}/160 caracteres
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="content">Contenido Principal *</Label>
                        <Textarea
                          id="content"
                          value={formData.content}
                          onChange={(e) => handleInputChange("content", e.target.value)}
                          placeholder="Escribe el contenido del artículo en Markdown..."
                          rows={12}
                          className="font-mono"
                        />
                        <div className="text-xs text-muted-foreground">
                          Soporta Markdown: **negrita**, *cursiva*, # Encabezados, [enlaces](url), etc.
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="featuredImage">Imagen Destacada</Label>
                        <Input
                          id="featuredImage"
                          type="url"
                          value={formData.featuredImage}
                          onChange={(e) => handleInputChange("featuredImage", e.target.value)}
                          placeholder="https://ejemplo.com/imagen.jpg"
                        />
                        <div className="text-xs text-muted-foreground">
                          Arrastra una imagen o pega la URL
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="categorization">
                  <Card>
                    <CardHeader>
                      <CardTitle>Categorías y Tags</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="category">Categoría Principal *</Label>
                          <Select value={formData.category} onValueChange={(value) => handleInputChange("category", value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar categoría" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map(category => (
                                <SelectItem key={category} value={category}>
                                  {category}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="author">Autor *</Label>
                          <Select value={formData.author} onValueChange={(value) => handleInputChange("author", value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar autor" />
                            </SelectTrigger>
                            <SelectContent>
                              {authors.map(author => (
                                <SelectItem key={author} value={author}>
                                  {author}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Tags</Label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {formData.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                              <Hash className="w-3 h-3" />
                              {tag}
                              <button onClick={() => removeTag(tag)}>
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            placeholder="Escribe y presiona Enter para agregar tags..."
                            onKeyPress={(e) => e.key === "Enter" && addTag()}
                          />
                          <Button onClick={addTag} type="button">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="publishDate">Fecha de Publicación *</Label>
                        <Input
                          id="publishDate"
                          type="date"
                          value={formData.publishDate}
                          onChange={(e) => handleInputChange("publishDate", e.target.value)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="seo">
                  <Card>
                    <CardHeader>
                      <CardTitle>Optimización SEO</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="metaTitle">Meta Título</Label>
                        <Input
                          id="metaTitle"
                          value={formData.metaTitle}
                          onChange={(e) => handleInputChange("metaTitle", e.target.value)}
                          placeholder="Título para motores de búsqueda..."
                          maxLength={60}
                        />
                        <div className="text-xs text-muted-foreground text-right">
                          {formData.metaTitle.length}/60 caracteres
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="metaDescription">Meta Descripción</Label>
                        <Textarea
                          id="metaDescription"
                          value={formData.metaDescription}
                          onChange={(e) => handleInputChange("metaDescription", e.target.value)}
                          placeholder="Descripción para motores de búsqueda..."
                          rows={3}
                          maxLength={160}
                        />
                        <div className="text-xs text-muted-foreground text-right">
                          {formData.metaDescription.length}/160 caracteres
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="canonicalUrl">URL Canónica</Label>
                        <Input
                          id="canonicalUrl"
                          type="url"
                          value={formData.canonicalUrl}
                          onChange={(e) => handleInputChange("canonicalUrl", e.target.value)}
                          placeholder="https://defi-mexico.com/blog/articulo"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Palabras Clave</Label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {formData.keywords.map((keyword) => (
                            <Badge key={keyword} variant="outline" className="flex items-center gap-1">
                              {keyword}
                              <button onClick={() => removeKeyword(keyword)}>
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={newKeyword}
                            onChange={(e) => setNewKeyword(e.target.value)}
                            placeholder="Agregar palabra clave..."
                            onKeyPress={(e) => e.key === "Enter" && addKeyword()}
                          />
                          <Button onClick={addKeyword} type="button">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="settings">
                  <Card>
                    <CardHeader>
                      <CardTitle>Opciones de Publicación</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-4">
                        <Label>Estado de Publicación</Label>
                        <div className="flex gap-4">
                          {[
                            { value: "draft", label: "Borrador" },
                            { value: "published", label: "Publicado" },
                            { value: "scheduled", label: "Programado" }
                          ].map((option) => (
                            <div key={option.value} className="flex items-center space-x-2">
                              <input
                                type="radio"
                                id={option.value}
                                name="status"
                                checked={formData.status === option.value}
                                onChange={() => handleInputChange("status", option.value)}
                              />
                              <Label htmlFor={option.value}>{option.label}</Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <Label>Visibilidad</Label>
                        <div className="flex gap-4">
                          {[
                            { value: "public", label: "Público" },
                            { value: "private", label: "Privado" },
                            { value: "members", label: "Solo miembros" }
                          ].map((option) => (
                            <div key={option.value} className="flex items-center space-x-2">
                              <input
                                type="radio"
                                id={`visibility-${option.value}`}
                                name="visibility"
                                checked={formData.visibility === option.value}
                                onChange={() => handleInputChange("visibility", option.value)}
                              />
                              <Label htmlFor={`visibility-${option.value}`}>{option.label}</Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <Label>Opciones</Label>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="allowComments">Permitir comentarios</Label>
                            <Switch
                              id="allowComments"
                              checked={formData.allowComments}
                              onCheckedChange={(checked) => handleInputChange("allowComments", checked)}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="featured">Destacar en homepage</Label>
                            <Switch
                              id="featured"
                              checked={formData.featured}
                              onCheckedChange={(checked) => handleInputChange("featured", checked)}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="newsletter">Enviar newsletter al publicar</Label>
                            <Switch
                              id="newsletter"
                              checked={formData.newsletter}
                              onCheckedChange={(checked) => handleInputChange("newsletter", checked)}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="readingTime">Tiempo de Lectura (minutos)</Label>
                        <Input
                          id="readingTime"
                          type="number"
                          min="1"
                          max="60"
                          value={formData.readingTime}
                          onChange={(e) => handleInputChange("readingTime", parseInt(e.target.value))}
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

export default AdminBlogForm;