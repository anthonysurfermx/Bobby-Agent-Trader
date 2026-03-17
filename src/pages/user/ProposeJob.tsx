// src/pages/user/ProposeJob.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProposals } from '@/hooks/useProposals';
import { JobProposalData } from '@/types/proposals';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Briefcase } from 'lucide-react';

const jobSchema = z.object({
  title: z.string().min(5, 'El título debe tener al menos 5 caracteres'),
  company: z.string().min(2, 'El nombre de la empresa es requerido'),
  company_logo: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  description: z.string().min(100, 'La descripción debe tener al menos 100 caracteres'),
  location: z.string().min(2, 'La ubicación es requerida'),
  job_type: z.enum(['remote', 'hybrid', 'onsite']),
  category: z.string().min(1, 'La categoría es requerida'),
  salary_min: z.number().min(0).optional(),
  salary_max: z.number().min(0).optional(),
  salary_currency: z.string().default('USD'),
  experience_level: z.string().min(1, 'El nivel de experiencia es requerido'),
  requirements: z.string().optional(),
  benefits: z.string().optional(),
  tags: z.string().optional(),
  apply_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  apply_email: z.string().email('Debe ser un email válido').optional().or(z.literal('')),
});

type JobFormData = z.infer<typeof jobSchema>;

const categories = [
  'Engineering',
  'Product',
  'Marketing',
  'Security',
  'Legal & Compliance',
  'Design',
  'Operations',
  'Finance',
];

const experienceLevels = [
  { value: 'Junior (0-2 años)', label: 'Junior (0-2 años)' },
  { value: 'Mid (2-4 años)', label: 'Mid (2-4 años)' },
  { value: 'Senior (5+ años)', label: 'Senior (5+ años)' },
  { value: 'Lead/Manager', label: 'Lead/Manager' },
];

export default function ProposeJob() {
  const navigate = useNavigate();
  const { createProposal } = useProposals({ autoFetch: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      salary_currency: 'USD',
      job_type: 'remote',
    },
  });

  const onSubmit = async (data: JobFormData) => {
    setIsSubmitting(true);

    try {
      const proposalData: JobProposalData = {
        ...data,
        tags: data.tags ? data.tags.split(',').map(t => t.trim()) : [],
        salary_min: data.salary_min || undefined,
        salary_max: data.salary_max || undefined,
      };

      const { error } = await createProposal('job', proposalData);

      if (!error) {
        toast.success('¡Propuesta enviada!', {
          description: 'Tu oferta de trabajo será revisada por el equipo.',
        });
        navigate('/user');
      }
    } catch (error) {
      console.error('Error submitting proposal:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Button
        variant="ghost"
        onClick={() => navigate('/user')}
        className="mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Volver al Dashboard
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>Publicar Trabajo Web3</CardTitle>
              <CardDescription>
                Publica una oferta de trabajo en el ecosistema DeFi México
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Información del Puesto */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Información del Puesto</h3>

              <div className="space-y-2">
                <Label htmlFor="title">Título del Puesto *</Label>
                <Input
                  id="title"
                  placeholder="Ej: Senior Solidity Developer"
                  {...register('title')}
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Categoría *</Label>
                  <Select onValueChange={(value) => setValue('category', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.category && (
                    <p className="text-sm text-destructive">{errors.category.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experience_level">Nivel de Experiencia *</Label>
                  <Select onValueChange={(value) => setValue('experience_level', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el nivel" />
                    </SelectTrigger>
                    <SelectContent>
                      {experienceLevels.map(level => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.experience_level && (
                    <p className="text-sm text-destructive">{errors.experience_level.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción del Puesto *</Label>
                <Textarea
                  id="description"
                  rows={6}
                  placeholder="Describe las responsabilidades, proyectos y el impacto del rol..."
                  {...register('description')}
                />
                {errors.description && (
                  <p className="text-sm text-destructive">{errors.description.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tecnologías y Skills (separadas por comas)</Label>
                <Input
                  id="tags"
                  placeholder="Solidity, React, Web3.js, TypeScript"
                  {...register('tags')}
                />
              </div>
            </div>

            {/* Información de la Empresa */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Información de la Empresa</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Nombre de la Empresa *</Label>
                  <Input
                    id="company"
                    placeholder="Ej: DeFi Protocol"
                    {...register('company')}
                  />
                  {errors.company && (
                    <p className="text-sm text-destructive">{errors.company.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company_logo">URL del Logo de la Empresa</Label>
                  <Input
                    id="company_logo"
                    type="url"
                    placeholder="https://ejemplo.com/logo.png"
                    {...register('company_logo')}
                  />
                  {errors.company_logo && (
                    <p className="text-sm text-destructive">{errors.company_logo.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Ubicación y Modalidad */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Ubicación y Modalidad</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Ubicación *</Label>
                  <Input
                    id="location"
                    placeholder="Ej: Ciudad de México, México o Remoto LATAM"
                    {...register('location')}
                  />
                  {errors.location && (
                    <p className="text-sm text-destructive">{errors.location.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job_type">Modalidad de Trabajo *</Label>
                  <Select
                    defaultValue="remote"
                    onValueChange={(value) => setValue('job_type', value as 'remote' | 'hybrid' | 'onsite')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona la modalidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="remote">🌎 Remoto</SelectItem>
                      <SelectItem value="hybrid">🏢 Híbrido</SelectItem>
                      <SelectItem value="onsite">📍 Presencial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Salario */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Compensación (Opcional)</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="salary_min">Salario Mínimo</Label>
                  <Input
                    id="salary_min"
                    type="number"
                    placeholder="50000"
                    {...register('salary_min', { valueAsNumber: true })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="salary_max">Salario Máximo</Label>
                  <Input
                    id="salary_max"
                    type="number"
                    placeholder="80000"
                    {...register('salary_max', { valueAsNumber: true })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="salary_currency">Moneda</Label>
                  <Select
                    defaultValue="USD"
                    onValueChange={(value) => setValue('salary_currency', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Moneda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="MXN">MXN</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Requisitos y Beneficios */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Requisitos y Beneficios</h3>

              <div className="space-y-2">
                <Label htmlFor="requirements">Requisitos (uno por línea)</Label>
                <Textarea
                  id="requirements"
                  rows={4}
                  placeholder="- 3+ años de experiencia en Solidity&#10;- Experiencia con protocolos DeFi&#10;- Inglés avanzado"
                  {...register('requirements')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="benefits">Beneficios (uno por línea)</Label>
                <Textarea
                  id="benefits"
                  rows={4}
                  placeholder="- Trabajo 100% remoto&#10;- Tokens de equity&#10;- Días de vacaciones ilimitados"
                  {...register('benefits')}
                />
              </div>
            </div>

            {/* Cómo Aplicar */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Cómo Aplicar</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="apply_url">URL para Aplicar</Label>
                  <Input
                    id="apply_url"
                    type="url"
                    placeholder="https://empresa.com/careers/puesto"
                    {...register('apply_url')}
                  />
                  {errors.apply_url && (
                    <p className="text-sm text-destructive">{errors.apply_url.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apply_email">Email para Aplicar</Label>
                  <Input
                    id="apply_email"
                    type="email"
                    placeholder="jobs@empresa.com"
                    {...register('apply_email')}
                  />
                  {errors.apply_email && (
                    <p className="text-sm text-destructive">{errors.apply_email.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/user')}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar Propuesta'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
