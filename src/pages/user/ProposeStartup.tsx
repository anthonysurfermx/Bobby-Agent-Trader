// src/pages/user/ProposeStartup.tsx
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
import { StartupProposalData } from '@/types/proposals';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Building2 } from 'lucide-react';

const startupSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().min(50, 'La descripción debe tener al menos 50 caracteres'),
  short_description: z.string().optional(),
  logo_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  cover_image_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  category: z.string().min(1, 'La categoría es requerida'),
  tags: z.string().optional(),
  country: z.string().default('Mexico'),
  city: z.string().optional(),
  website_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  twitter_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  linkedin_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  github_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  stage: z.string().min(1, 'El stage es requerido'),
  funding_stage: z.string().optional(),
  total_funding: z.number().min(0).optional(),
  employee_count: z.number().int().min(0).optional(),
  founded_year: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
});

type StartupFormData = z.infer<typeof startupSchema>;

export default function ProposeStartup() {
  const navigate = useNavigate();
  const { createProposal } = useProposals({ autoFetch: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<StartupFormData>({
    resolver: zodResolver(startupSchema),
    defaultValues: {
      country: 'Mexico',
    },
  });

  const onSubmit = async (data: StartupFormData) => {
    setIsSubmitting(true);

    try {
      const proposalData: StartupProposalData = {
        ...data,
        tags: data.tags ? data.tags.split(',').map(t => t.trim()) : [],
        total_funding: data.total_funding || undefined,
        employee_count: data.employee_count || undefined,
        founded_year: data.founded_year || undefined,
      };

      const { error } = await createProposal('startup', proposalData);

      if (!error) {
        toast.success('¡Propuesta enviada!', {
          description: 'Tu propuesta de startup será revisada por el equipo.',
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
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>Proponer Startup DeFi</CardTitle>
              <CardDescription>
                Registra tu startup en el ecosistema DeFi México
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Información Básica */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Información Básica</h3>

              <div className="space-y-2">
                <Label htmlFor="name">Nombre de la Startup *</Label>
                <Input
                  id="name"
                  placeholder="Ej: DeFi Wallet México"
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="short_description">Descripción Corta</Label>
                <Input
                  id="short_description"
                  placeholder="Una breve descripción de tu startup"
                  {...register('short_description')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción Completa *</Label>
                <Textarea
                  id="description"
                  rows={6}
                  placeholder="Describe tu startup, qué problema resuelve, tu propuesta de valor..."
                  {...register('description')}
                />
                {errors.description && (
                  <p className="text-sm text-destructive">{errors.description.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Categoría *</Label>
                <Select onValueChange={(value) => setValue('category', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mvp_hackathon">MVP Hackathon</SelectItem>
                    <SelectItem value="defi">DeFi</SelectItem>
                    <SelectItem value="lending">Lending</SelectItem>
                    <SelectItem value="dex">DEX</SelectItem>
                    <SelectItem value="wallet">Wallet</SelectItem>
                    <SelectItem value="nft">NFT</SelectItem>
                    <SelectItem value="bridge">Bridge</SelectItem>
                    <SelectItem value="stablecoin">Stablecoin</SelectItem>
                    <SelectItem value="infrastructure">Infraestructura</SelectItem>
                    <SelectItem value="analytics">Analytics</SelectItem>
                    <SelectItem value="otros">Otros</SelectItem>
                  </SelectContent>
                </Select>
                {errors.category && (
                  <p className="text-sm text-destructive">{errors.category.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Etiquetas (separadas por comas)</Label>
                <Input
                  id="tags"
                  placeholder="defi, blockchain, fintech"
                  {...register('tags')}
                />
              </div>
            </div>

            {/* Imágenes */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Imágenes</h3>

              <div className="space-y-2">
                <Label htmlFor="logo_url">URL del Logo</Label>
                <Input
                  id="logo_url"
                  type="url"
                  placeholder="https://ejemplo.com/logo.png"
                  {...register('logo_url')}
                />
                {errors.logo_url && (
                  <p className="text-sm text-destructive">{errors.logo_url.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cover_image_url">URL de la Imagen de Portada</Label>
                <Input
                  id="cover_image_url"
                  type="url"
                  placeholder="https://ejemplo.com/cover.jpg"
                  {...register('cover_image_url')}
                />
                {errors.cover_image_url && (
                  <p className="text-sm text-destructive">{errors.cover_image_url.message}</p>
                )}
              </div>
            </div>

            {/* Enlaces y Redes Sociales */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Enlaces y Redes Sociales</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="website_url">Sitio Web</Label>
                  <Input
                    id="website_url"
                    type="url"
                    placeholder="https://ejemplo.com"
                    {...register('website_url')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="twitter_url">Twitter/X</Label>
                  <Input
                    id="twitter_url"
                    type="url"
                    placeholder="https://twitter.com/..."
                    {...register('twitter_url')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="linkedin_url">LinkedIn</Label>
                  <Input
                    id="linkedin_url"
                    type="url"
                    placeholder="https://linkedin.com/company/..."
                    {...register('linkedin_url')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="github_url">GitHub</Label>
                  <Input
                    id="github_url"
                    type="url"
                    placeholder="https://github.com/..."
                    {...register('github_url')}
                  />
                </div>
              </div>
            </div>

            {/* Ubicación */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Ubicación</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">Ciudad</Label>
                  <Input
                    id="city"
                    placeholder="Ciudad de México"
                    {...register('city')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">País</Label>
                  <Input
                    id="country"
                    placeholder="Mexico"
                    {...register('country')}
                  />
                </div>
              </div>
            </div>

            {/* Información Empresarial */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Información Empresarial</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stage">Stage de la Startup *</Label>
                  <Select onValueChange={(value) => setValue('stage', value)}>
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
                  {errors.stage && (
                    <p className="text-sm text-destructive">{errors.stage.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Los proyectos MVP aparecerán en la sección "MVPs Hackathon"
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="founded_year">Año de Fundación</Label>
                  <Input
                    id="founded_year"
                    type="number"
                    placeholder="2024"
                    {...register('founded_year', { valueAsNumber: true })}
                  />
                  {errors.founded_year && (
                    <p className="text-sm text-destructive">{errors.founded_year.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="employee_count">Número de Empleados</Label>
                  <Input
                    id="employee_count"
                    type="number"
                    placeholder="10"
                    {...register('employee_count', { valueAsNumber: true })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="total_funding">Financiamiento Total (USD)</Label>
                  <Input
                    id="total_funding"
                    type="number"
                    placeholder="100000"
                    {...register('total_funding', { valueAsNumber: true })}
                  />
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
