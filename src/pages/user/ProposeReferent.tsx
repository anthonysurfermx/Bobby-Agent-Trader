// src/pages/user/ProposeReferent.tsx
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
import { ReferentProposalData, ReferentCategory } from '@/types/proposals';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Users } from 'lucide-react';

const referentSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  description: z.string().min(50, 'La descripción debe tener al menos 50 caracteres'),
  avatar_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  category: z.enum(['programadores', 'abogados', 'financieros', 'diseñadores', 'marketers', 'otros'], {
    required_error: 'Debes seleccionar una categoría',
  }),
  twitter_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  github_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  linkedin_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  website_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  company: z.string().optional(),
  position: z.string().optional(),
  location: z.string().optional(),
  expertise_areas: z.string().optional(),
});

type ReferentFormData = z.infer<typeof referentSchema>;

export default function ProposeReferent() {
  const navigate = useNavigate();
  const { createProposal } = useProposals({ autoFetch: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<ReferentFormData>({
    resolver: zodResolver(referentSchema),
  });

  const onSubmit = async (data: ReferentFormData) => {
    setIsSubmitting(true);

    try {
      const proposalData: ReferentProposalData = {
        ...data,
        expertise_areas: data.expertise_areas ? data.expertise_areas.split(',').map(a => a.trim()) : [],
      };

      const { error } = await createProposal('referent', proposalData);

      if (!error) {
        toast.success('¡Propuesta enviada!', {
          description: 'Tu propuesta de referente será revisada por el equipo.',
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
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>Proponer Referente DeFi</CardTitle>
              <CardDescription>
                Nomina a un referente del ecosistema DeFi en México
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
                <Label htmlFor="name">Nombre Completo *</Label>
                <Input
                  id="name"
                  placeholder="Ej: Juan Pérez"
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción / Biografía *</Label>
                <Textarea
                  id="description"
                  rows={6}
                  placeholder="Describe la trayectoria, logros y contribuciones al ecosistema DeFi..."
                  {...register('description')}
                />
                {errors.description && (
                  <p className="text-sm text-destructive">{errors.description.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Mínimo 50 caracteres
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Categoría *</Label>
                <Select onValueChange={(value) => setValue('category', value as ReferentCategory)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="programadores">Programadores</SelectItem>
                    <SelectItem value="abogados">Abogados</SelectItem>
                    <SelectItem value="financieros">Financieros</SelectItem>
                    <SelectItem value="diseñadores">Diseñadores</SelectItem>
                    <SelectItem value="marketers">Marketers</SelectItem>
                    <SelectItem value="otros">Otros</SelectItem>
                  </SelectContent>
                </Select>
                {errors.category && (
                  <p className="text-sm text-destructive">{errors.category.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatar_url">URL de la Foto de Perfil</Label>
                <Input
                  id="avatar_url"
                  type="url"
                  placeholder="https://ejemplo.com/foto.jpg"
                  {...register('avatar_url')}
                />
                {errors.avatar_url && (
                  <p className="text-sm text-destructive">{errors.avatar_url.message}</p>
                )}
              </div>
            </div>

            {/* Información Profesional */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Información Profesional</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Empresa / Organización</Label>
                  <Input
                    id="company"
                    placeholder="Ej: DeFi Startup México"
                    {...register('company')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="position">Cargo / Posición</Label>
                  <Input
                    id="position"
                    placeholder="Ej: CEO, Developer, Abogado"
                    {...register('position')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Ubicación</Label>
                <Input
                  id="location"
                  placeholder="Ej: Ciudad de México, México"
                  {...register('location')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expertise_areas">Áreas de Expertise (separadas por comas)</Label>
                <Input
                  id="expertise_areas"
                  placeholder="Smart Contracts, Solidity, DeFi, Auditoría"
                  {...register('expertise_areas')}
                />
                <p className="text-xs text-muted-foreground">
                  Separa las áreas con comas
                </p>
              </div>
            </div>

            {/* Redes Sociales y Enlaces */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Redes Sociales y Enlaces</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="twitter_url">Twitter/X</Label>
                  <Input
                    id="twitter_url"
                    type="url"
                    placeholder="https://twitter.com/..."
                    {...register('twitter_url')}
                  />
                  {errors.twitter_url && (
                    <p className="text-sm text-destructive">{errors.twitter_url.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="linkedin_url">LinkedIn</Label>
                  <Input
                    id="linkedin_url"
                    type="url"
                    placeholder="https://linkedin.com/in/..."
                    {...register('linkedin_url')}
                  />
                  {errors.linkedin_url && (
                    <p className="text-sm text-destructive">{errors.linkedin_url.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="github_url">GitHub</Label>
                  <Input
                    id="github_url"
                    type="url"
                    placeholder="https://github.com/..."
                    {...register('github_url')}
                  />
                  {errors.github_url && (
                    <p className="text-sm text-destructive">{errors.github_url.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website_url">Sitio Web Personal</Label>
                  <Input
                    id="website_url"
                    type="url"
                    placeholder="https://ejemplo.com"
                    {...register('website_url')}
                  />
                  {errors.website_url && (
                    <p className="text-sm text-destructive">{errors.website_url.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Info Box */}
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-blue-900 dark:text-blue-100">
                      ¿Por qué es importante esta persona para el ecosistema?
                    </p>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      Asegúrate de explicar claramente las contribuciones y el impacto de este referente en el ecosistema DeFi mexicano. Esto ayudará al equipo a evaluar la propuesta.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

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
