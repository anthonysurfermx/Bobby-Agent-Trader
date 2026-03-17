// src/pages/user/ProposeEvent.tsx
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProposals } from '@/hooks/useProposals';
import { EventProposalData } from '@/types/proposals';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Calendar } from 'lucide-react';

const eventSchema = z.object({
  title: z.string().min(5, 'El título debe tener al menos 5 caracteres'),
  description: z.string().min(50, 'La descripción debe tener al menos 50 caracteres'),
  short_description: z.string().optional(),
  cover_image_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  event_type: z.string().optional(),
  format: z.string().optional(),
  start_date: z.string().min(1, 'La fecha es requerida'),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  timezone: z.string().default('America/Mexico_City'),
  location: z.string().optional(),
  venue_name: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default('Mexico'),
  registration_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  website_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  streaming_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  organizer_name: z.string().optional(),
  organizer_logo_url: z.string().url('Debe ser una URL válida').optional().or(z.literal('')),
  sponsors: z.string().optional(),
  max_attendees: z.number().int().min(0).optional(),
  is_free: z.boolean().default(true),
  price_info: z.string().optional(),
  tags: z.string().optional(),
  topics: z.string().optional(),
});

type EventFormData = z.infer<typeof eventSchema>;

export default function ProposeEvent() {
  const navigate = useNavigate();
  const { createProposal } = useProposals({ autoFetch: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFree, setIsFree] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      country: 'Mexico',
      timezone: 'America/Mexico_City',
      is_free: true,
    },
  });

  const onSubmit = async (data: EventFormData) => {
    setIsSubmitting(true);

    try {
      const proposalData: EventProposalData = {
        ...data,
        tags: data.tags ? data.tags.split(',').map(t => t.trim()) : [],
        topics: data.topics ? data.topics.split(',').map(t => t.trim()) : [],
        sponsors: data.sponsors ? data.sponsors.split(',').map(s => s.trim()) : [],
        max_attendees: data.max_attendees || undefined,
        is_free: isFree,
      };

      const { error } = await createProposal('event', proposalData);

      if (!error) {
        toast.success('¡Propuesta enviada!', {
          description: 'Tu propuesta de evento será revisada por el equipo.',
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
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>Proponer Evento DeFi</CardTitle>
              <CardDescription>
                Añade un evento DeFi a la plataforma
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
                <Label htmlFor="title">Título del Evento *</Label>
                <Input
                  id="title"
                  placeholder="Ej: DeFi Summit México 2025"
                  {...register('title')}
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="short_description">Descripción Corta</Label>
                <Input
                  id="short_description"
                  placeholder="Una breve descripción del evento"
                  {...register('short_description')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción Completa *</Label>
                <Textarea
                  id="description"
                  rows={6}
                  placeholder="Describe el evento, agenda, speakers, etc..."
                  {...register('description')}
                />
                {errors.description && (
                  <p className="text-sm text-destructive">{errors.description.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="event_type">Tipo de Evento</Label>
                  <Select onValueChange={(value) => setValue('event_type', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conference">Conferencia</SelectItem>
                      <SelectItem value="meetup">Meetup</SelectItem>
                      <SelectItem value="workshop">Workshop</SelectItem>
                      <SelectItem value="webinar">Webinar</SelectItem>
                      <SelectItem value="hackathon">Hackathon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="format">Formato</Label>
                  <Select onValueChange={(value) => setValue('format', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un formato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="presencial">Presencial</SelectItem>
                      <SelectItem value="virtual">Virtual</SelectItem>
                      <SelectItem value="híbrido">Híbrido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cover_image_url">URL de la Imagen de Portada</Label>
                <Input
                  id="cover_image_url"
                  type="url"
                  placeholder="https://ejemplo.com/cover.jpg"
                  {...register('cover_image_url')}
                />
              </div>
            </div>

            {/* Fecha y Ubicación */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Fecha y Ubicación</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Fecha del Evento *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    {...register('start_date')}
                    className="text-base"
                  />
                  {errors.start_date && (
                    <p className="text-sm text-destructive">{errors.start_date.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="start_time">Hora de Inicio</Label>
                  <Input
                    id="start_time"
                    type="time"
                    {...register('start_time')}
                    className="text-base"
                    defaultValue="10:00"
                  />
                  <p className="text-xs text-muted-foreground">Ejemplo: 10:00</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end_time">Hora de Fin</Label>
                  <Input
                    id="end_time"
                    type="time"
                    {...register('end_time')}
                    className="text-base"
                    defaultValue="18:00"
                  />
                  <p className="text-xs text-muted-foreground">Ejemplo: 18:00</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                <div className="space-y-2">
                  <Label htmlFor="timezone">Zona Horaria</Label>
                  <Input
                    id="timezone"
                    placeholder="America/Mexico_City"
                    {...register('timezone')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="venue_name">Nombre del Lugar</Label>
                <Input
                  id="venue_name"
                  placeholder="Centro de Convenciones"
                  {...register('venue_name')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Dirección</Label>
                <Input
                  id="address"
                  placeholder="Calle, Número, Colonia"
                  {...register('address')}
                />
              </div>
            </div>

            {/* Enlaces */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Enlaces</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="registration_url">URL de Registro</Label>
                  <Input
                    id="registration_url"
                    type="url"
                    placeholder="https://evento.com/registro"
                    {...register('registration_url')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website_url">Sitio Web del Evento</Label>
                  <Input
                    id="website_url"
                    type="url"
                    placeholder="https://evento.com"
                    {...register('website_url')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="streaming_url">URL de Streaming</Label>
                  <Input
                    id="streaming_url"
                    type="url"
                    placeholder="https://youtube.com/..."
                    {...register('streaming_url')}
                  />
                </div>
              </div>
            </div>

            {/* Organizador */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Organizador</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="organizer_name">Nombre del Organizador</Label>
                  <Input
                    id="organizer_name"
                    placeholder="DeFi México"
                    {...register('organizer_name')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="organizer_logo_url">URL del Logo del Organizador</Label>
                  <Input
                    id="organizer_logo_url"
                    type="url"
                    placeholder="https://ejemplo.com/logo.png"
                    {...register('organizer_logo_url')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sponsors">Patrocinadores (separados por comas)</Label>
                <Input
                  id="sponsors"
                  placeholder="Empresa A, Empresa B, Empresa C"
                  {...register('sponsors')}
                />
              </div>
            </div>

            {/* Información Adicional */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Información Adicional</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max_attendees">Cupo Máximo</Label>
                  <Input
                    id="max_attendees"
                    type="number"
                    placeholder="100"
                    {...register('max_attendees', { valueAsNumber: true })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Precio</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="is_free"
                      checked={isFree}
                      onCheckedChange={(checked) => {
                        setIsFree(checked as boolean);
                        setValue('is_free', checked as boolean);
                      }}
                    />
                    <Label htmlFor="is_free" className="font-normal cursor-pointer">
                      Evento Gratuito
                    </Label>
                  </div>
                </div>
              </div>

              {!isFree && (
                <div className="space-y-2">
                  <Label htmlFor="price_info">Información de Precio</Label>
                  <Input
                    id="price_info"
                    placeholder="$500 MXN - Early Bird, $800 MXN - Regular"
                    {...register('price_info')}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="tags">Etiquetas (separadas por comas)</Label>
                <Input
                  id="tags"
                  placeholder="defi, blockchain, mexico"
                  {...register('tags')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="topics">Temas (separados por comas)</Label>
                <Input
                  id="topics"
                  placeholder="Smart Contracts, DeFi, NFTs"
                  {...register('topics')}
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
