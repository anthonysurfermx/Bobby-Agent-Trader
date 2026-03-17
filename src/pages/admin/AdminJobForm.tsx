import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Briefcase, Save, X, Plus } from "lucide-react";
import { jobsService, type Job, type JobInsert } from "@/services/jobs.service";
import { toast } from "sonner";

const categories = ['Engineering', 'Product', 'Marketing', 'Security', 'Legal & Compliance', 'Design', 'Operations', 'Finance'];
const experienceLevels = [
  'Entry (0-1 años)',
  'Entry-Mid (1-3 años)',
  'Mid (2-4 años)',
  'Mid-Senior (3-5 años)',
  'Senior (5+ años)',
  'Lead/Staff (7+ años)',
  'Director/VP'
];
const currencies = ['USD', 'MXN', 'EUR'];

const AdminJobForm = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTag, setNewTag] = useState("");

  const [formData, setFormData] = useState<Partial<JobInsert>>({
    title: '',
    company: '',
    company_logo: '',
    location: '',
    job_type: 'remote',
    category: 'Engineering',
    salary_min: undefined,
    salary_max: undefined,
    salary_currency: 'USD',
    experience_level: 'Mid (2-4 años)',
    tags: [],
    description: '',
    requirements: '',
    benefits: '',
    apply_url: '',
    apply_email: '',
    is_featured: false,
    status: 'draft',
  });

  useEffect(() => {
    if (isEditing && id) {
      loadJob(id);
    }
  }, [id, isEditing]);

  const loadJob = async (jobId: string) => {
    try {
      setLoading(true);
      const { data, error } = await jobsService.getById(jobId);

      if (error) throw new Error(error);
      if (data) {
        setFormData({
          title: data.title,
          company: data.company,
          company_logo: data.company_logo || '',
          location: data.location,
          job_type: data.job_type,
          category: data.category,
          salary_min: data.salary_min,
          salary_max: data.salary_max,
          salary_currency: data.salary_currency || 'USD',
          experience_level: data.experience_level,
          tags: data.tags || [],
          description: data.description,
          requirements: data.requirements || '',
          benefits: data.benefits || '',
          apply_url: data.apply_url,
          apply_email: data.apply_email || '',
          is_featured: data.is_featured,
          status: data.status,
        });
      }
    } catch (error) {
      console.error('Error loading job:', error);
      toast.error('Error al cargar el trabajo');
      navigate('/admin/jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validaciones básicas
    if (!formData.title?.trim()) {
      toast.error('El título es requerido');
      return;
    }
    if (!formData.company?.trim()) {
      toast.error('La empresa es requerida');
      return;
    }
    if (!formData.apply_url?.trim()) {
      toast.error('La URL de aplicación es requerida');
      return;
    }

    try {
      setSaving(true);

      const jobData: JobInsert = {
        title: formData.title!,
        company: formData.company!,
        company_logo: formData.company_logo || undefined,
        location: formData.location || 'México',
        job_type: formData.job_type || 'remote',
        category: formData.category || 'Engineering',
        salary_min: formData.salary_min,
        salary_max: formData.salary_max,
        salary_currency: formData.salary_currency,
        experience_level: formData.experience_level || 'Mid (2-4 años)',
        tags: formData.tags || [],
        description: formData.description || '',
        requirements: formData.requirements,
        benefits: formData.benefits,
        apply_url: formData.apply_url!,
        apply_email: formData.apply_email,
        is_featured: formData.is_featured || false,
        status: formData.status || 'draft',
      };

      if (isEditing && id) {
        const { error } = await jobsService.update(id, jobData);
        if (error) throw new Error(error);
        toast.success('Trabajo actualizado correctamente');
      } else {
        const { error } = await jobsService.create(jobData);
        if (error) throw new Error(error);
        toast.success('Trabajo creado correctamente');
      }

      navigate('/admin/jobs');
    } catch (error) {
      console.error('Error saving job:', error);
      toast.error('Error al guardar el trabajo');
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags?.includes(newTag.trim())) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), newTag.trim()]
      });
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter(tag => tag !== tagToRemove) || []
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/admin/jobs')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary" />
            {isEditing ? 'Editar Trabajo' : 'Nuevo Trabajo'}
          </h1>
          <p className="text-muted-foreground">
            {isEditing ? 'Actualiza los detalles del trabajo' : 'Publica una nueva oferta de trabajo'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Información básica */}
        <Card>
          <CardHeader>
            <CardTitle>Información del Trabajo</CardTitle>
            <CardDescription>Detalles básicos de la oferta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título del puesto *</Label>
                <Input
                  id="title"
                  placeholder="Ej: Senior Solidity Developer"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Empresa *</Label>
                <Input
                  id="company"
                  placeholder="Ej: Bitso"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company_logo">URL del Logo (opcional)</Label>
                <Input
                  id="company_logo"
                  type="url"
                  placeholder="https://..."
                  value={formData.company_logo}
                  onChange={(e) => setFormData({ ...formData, company_logo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Ubicación</Label>
                <Input
                  id="location"
                  placeholder="Ej: Ciudad de México, Remoto México"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Tipo de trabajo</Label>
                <Select
                  value={formData.job_type}
                  onValueChange={(value) => setFormData({ ...formData, job_type: value as Job['job_type'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remote">🌎 Remoto</SelectItem>
                    <SelectItem value="hybrid">🏢 Híbrido</SelectItem>
                    <SelectItem value="onsite">📍 Presencial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nivel de experiencia</Label>
                <Select
                  value={formData.experience_level}
                  onValueChange={(value) => setFormData({ ...formData, experience_level: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {experienceLevels.map(level => (
                      <SelectItem key={level} value={level}>{level}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Salario */}
        <Card>
          <CardHeader>
            <CardTitle>Salario (opcional)</CardTitle>
            <CardDescription>Rango salarial para la posición</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Mínimo</Label>
                <Input
                  type="number"
                  placeholder="40000"
                  value={formData.salary_min || ''}
                  onChange={(e) => setFormData({ ...formData, salary_min: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
              <div className="space-y-2">
                <Label>Máximo</Label>
                <Input
                  type="number"
                  placeholder="80000"
                  value={formData.salary_max || ''}
                  onChange={(e) => setFormData({ ...formData, salary_max: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select
                  value={formData.salary_currency}
                  onValueChange={(value) => setFormData({ ...formData, salary_currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map(curr => (
                      <SelectItem key={curr} value={curr}>{curr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Descripción */}
        <Card>
          <CardHeader>
            <CardTitle>Descripción</CardTitle>
            <CardDescription>Detalles sobre el puesto</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Descripción del puesto</Label>
              <Textarea
                placeholder="Describe las responsabilidades y el rol..."
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Requisitos (opcional)</Label>
              <Textarea
                placeholder="Lista los requisitos y habilidades necesarias..."
                rows={4}
                value={formData.requirements}
                onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Beneficios (opcional)</Label>
              <Textarea
                placeholder="Describe los beneficios y perks..."
                rows={3}
                value={formData.benefits}
                onChange={(e) => setFormData({ ...formData, benefits: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tags */}
        <Card>
          <CardHeader>
            <CardTitle>Tecnologías y Tags</CardTitle>
            <CardDescription>Añade tags relevantes para la posición</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Ej: Solidity, React, Web3..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              />
              <Button type="button" onClick={addTag} variant="outline">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags?.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => removeTag(tag)}
                  />
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Aplicación */}
        <Card>
          <CardHeader>
            <CardTitle>Cómo aplicar</CardTitle>
            <CardDescription>Información para que los candidatos apliquen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apply_url">URL de aplicación *</Label>
              <Input
                id="apply_url"
                type="url"
                placeholder="https://company.com/careers/job-123"
                value={formData.apply_url}
                onChange={(e) => setFormData({ ...formData, apply_url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apply_email">Email de contacto (opcional)</Label>
              <Input
                id="apply_email"
                type="email"
                placeholder="jobs@company.com"
                value={formData.apply_email}
                onChange={(e) => setFormData({ ...formData, apply_email: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Opciones */}
        <Card>
          <CardHeader>
            <CardTitle>Opciones de publicación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Trabajo destacado</Label>
                <p className="text-sm text-muted-foreground">
                  Los trabajos destacados aparecen primero en la lista
                </p>
              </div>
              <Switch
                checked={formData.is_featured}
                onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
              />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as Job['status'] })}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="published">Publicado</SelectItem>
                  <SelectItem value="closed">Cerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/jobs')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {isEditing ? 'Actualizar' : 'Crear Trabajo'}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AdminJobForm;
