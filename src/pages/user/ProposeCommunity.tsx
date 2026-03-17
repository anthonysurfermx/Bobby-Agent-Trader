// src/pages/user/ProposeCommunity.tsx
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
import { CommunityProposalData } from '@/types/proposals';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Globe } from 'lucide-react';

const communitySchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  description: z.string().min(50, 'La descripción debe tener al menos 50 caracteres'),
  short_description: z.string().optional(),
  logo_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  cover_image_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  community_type: z.string().optional(),
  focus_area: z.string().optional(),
  main_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  telegram_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  discord_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  twitter_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  github_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  member_count: z.number().int().min(0).optional(),
  city: z.string().optional(),
  country: z.string().default('Mexico'),
  tags: z.string().optional(),
});

type CommunityFormData = z.infer<typeof communitySchema>;

export default function ProposeCommunity() {
  const navigate = useNavigate();
  const { createProposal } = useProposals({ autoFetch: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<CommunityFormData>({
    resolver: zodResolver(communitySchema),
    defaultValues: {
      country: 'Mexico',
    },
  });

  const onSubmit = async (data: CommunityFormData) => {
    setIsSubmitting(true);

    try {
      const proposalData: CommunityProposalData = {
        ...data,
        tags: data.tags ? data.tags.split(',').map(t => t.trim()) : [],
        member_count: data.member_count || undefined,
      };

      const { error } = await createProposal('community', proposalData);

      if (!error) {
        toast.success('¡Propuesta enviada!', {
          description: 'Tu propuesta de comunidad será revisada por el equipo.',
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
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>Proponer Comunidad DeFi</CardTitle>
              <CardDescription>
                Añade una comunidad DeFi mexicana a la plataforma
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
                <Label htmlFor="name">Nombre de la Comunidad *</Label>
                <Input
                  id="name"
                  placeholder="Ej: DeFi México DAO"
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
                  placeholder="Una breve descripción de la comunidad"
                  {...register('short_description')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción Completa *</Label>
                <Textarea
                  id="description"
                  rows={6}
                  placeholder="Describe la comunidad, sus objetivos, actividades principales..."
                  {...register('description')}
                />
                {errors.description && (
                  <p className="text-sm text-destructive">{errors.description.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="community_type">Tipo de Comunidad</Label>
                  <Select onValueChange={(value) => setValue('community_type', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dao">DAO</SelectItem>
                      <SelectItem value="telegram">Grupo Telegram</SelectItem>
                      <SelectItem value="discord">Servidor Discord</SelectItem>
                      <SelectItem value="meetup">Meetup</SelectItem>
                      <SelectItem value="otros">Otros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="focus_area">Área de Enfoque</Label>
                  <Select onValueChange={(value) => setValue('focus_area', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un área" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="defi">DeFi</SelectItem>
                      <SelectItem value="nft">NFT</SelectItem>
                      <SelectItem value="desarrollo">Desarrollo</SelectItem>
                      <SelectItem value="inversión">Inversión</SelectItem>
                      <SelectItem value="educación">Educación</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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

            {/* Redes Sociales y Enlaces */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Redes Sociales y Enlaces</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="main_url">Sitio Web Principal</Label>
                  <Input
                    id="main_url"
                    type="url"
                    placeholder="https://ejemplo.com"
                    {...register('main_url')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telegram_url">Telegram</Label>
                  <Input
                    id="telegram_url"
                    type="url"
                    placeholder="https://t.me/..."
                    {...register('telegram_url')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discord_url">Discord</Label>
                  <Input
                    id="discord_url"
                    type="url"
                    placeholder="https://discord.gg/..."
                    {...register('discord_url')}
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

            {/* Información Adicional */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Información Adicional</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="member_count">Número de Miembros</Label>
                  <Input
                    id="member_count"
                    type="number"
                    placeholder="500"
                    {...register('member_count', { valueAsNumber: true })}
                  />
                </div>

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

              <div className="space-y-2">
                <Label htmlFor="tags">Etiquetas (separadas por comas)</Label>
                <Input
                  id="tags"
                  placeholder="defi, web3, crypto"
                  {...register('tags')}
                />
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
