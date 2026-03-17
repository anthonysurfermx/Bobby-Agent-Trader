import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, MapPin, Share2, Download, Clock, Mail } from "lucide-react";
import { eventsService, type Event } from "@/services/events.service";
import { EntityComments } from "@/components/BlogComments";


export default function EventDetailPage() {
  const { id = "1" } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function loadEvent() {
      try {
        setLoading(true);
        
        // Primero intenta cargar por slug (si el ID parece un slug)
        let result: Awaited<ReturnType<typeof eventsService.getById>>;
        if (id.includes('-') && !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          // Parece un slug, intenta getBySlug
          result = await eventsService.getBySlug(id);
        } else {
          // Parece un UUID, intenta getById
          result = await eventsService.getById(id);
        }
        
        // Si no encontró nada y el primer intento fue por slug, intenta por ID
        if ((result.error || !result.data) && id.includes('-')) {
          console.log('🔄 No encontrado por slug, intentando por ID...');
          result = await eventsService.getById(id);
        }
        
        if (result.error || !result.data) {
          setError(new Error(result.error || 'Evento no encontrado'));
          return;
        }
        
        setEvent(result.data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Error al cargar el evento'));
      } finally {
        setLoading(false);
      }
    }
    loadEvent();
  }, [id]);

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!event || !event.registration_required) return;
    setSubmitting(true);
    try {
      const result = await eventsService.registerAttendee(event.id);
      if (result.error) {
        throw new Error(result.error);
      }
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "No se pudo registrar, intenta de nuevo.");
    } finally { 
      setSubmitting(false); 
    }
  }

  if (error) return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    </div>
  );

  const metaTitle = event?.title ? `${event.title} - DeFi México Eventos` : 'Evento - DeFi México';
  const metaDescription = event?.description || 'Evento del ecosistema DeFi mexicano';
  const metaImage = event?.image_url || event?.banner_url || 'https://defimexico.org/maincover.jpeg';

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {event && (
        <Helmet>
          <title>{metaTitle}</title>
          <meta name="description" content={metaDescription} />
          <meta property="og:type" content="website" />
          <meta property="og:title" content={metaTitle} />
          <meta property="og:description" content={metaDescription} />
          <meta property="og:image" content={metaImage} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={metaTitle} />
          <meta name="twitter:description" content={metaDescription} />
          <meta name="twitter:image" content={metaImage} />
          <script type="application/ld+json">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Event",
              "name": event.title,
              "description": event.description,
              "startDate": event.start_date,
              "endDate": event.end_date || undefined,
              "location": event.venue_name ? {
                "@type": "Place",
                "name": event.venue_name,
                "address": event.venue_address || undefined,
              } : undefined,
              "organizer": event.organizer_name ? {
                "@type": "Organization",
                "name": event.organizer_name,
              } : undefined,
              "image": event.image_url || event.banner_url || undefined,
            })}
          </script>
        </Helmet>
      )}

      {loading || !event ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{event.title}</h1>
              <p className="text-muted-foreground flex items-center gap-4 mt-1">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-4 w-4"/>
                  {event.start_date ? new Date(event.start_date).toLocaleDateString() : 'Fecha por confirmar'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4"/>
                  {event.venue_name || 'Ubicación por confirmar'}
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2">
                <Share2 className="h-4 w-4"/>Compartir
              </Button>
              <Button className="gap-2" variant="secondary">
                <Download className="h-4 w-4"/>.ics
              </Button>
            </div>
          </div>

          <Card className="mt-6 overflow-hidden">
            {(event.image_url || event.banner_url) && (
              <div className="h-48 w-full overflow-hidden">
                <img src={event.image_url || event.banner_url} alt={event.title} className="w-full h-full object-cover" />
              </div>
            )}
            <CardContent className="pt-6">
              <p className="text-muted-foreground">{event.description}</p>
            </CardContent>
          </Card>

          {/* Registro */}
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Registro</CardTitle>
                <CardDescription>
                  {event.registration_required 
                    ? `Reserva tu lugar. ${event.capacity ? `Cupos: ${event.current_attendees}/${event.capacity}` : 'Cupos limitados'}` 
                    : 'Evento sin registro requerido'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {submitted ? (
                  <Alert>
                    <AlertTitle>¡Listo!</AlertTitle>
                    <AlertDescription>Te enviamos un correo con la confirmación.</AlertDescription>
                  </Alert>
                ) : (
                  event.registration_required ? (
                    event.registration_url ? (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Este evento requiere registro externo.
                        </p>
                        <Button asChild className="gap-2">
                          <a href={event.registration_url} target="_blank" rel="noopener noreferrer">
                            <Mail className="h-4 w-4"/>
                            Registrarse
                          </a>
                        </Button>
                      </div>
                    ) : (
                      <form onSubmit={onRegister} className="space-y-4">
                        <div className="grid gap-2">
                          <Label htmlFor="email">Email</Label>
                          <Input 
                            id="email" 
                            type="email" 
                            required 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            placeholder="tu@email.com"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="note">Notas (opcional)</Label>
                          <Textarea 
                            id="note" 
                            value={note} 
                            onChange={(e) => setNote(e.target.value)} 
                            placeholder="Tu rol, expectativas, etc."
                          />
                        </div>
                        <Button type="submit" disabled={submitting} className="gap-2">
                          <Mail className="h-4 w-4"/>
                          {submitting ? "Registrando..." : "Registrarme"}
                        </Button>
                      </form>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Este es un evento abierto, no se requiere registro.
                    </p>
                  )
                )}
              </CardContent>
            </Card>

            {/* Información adicional */}
            <Card>
              <CardHeader>
                <CardTitle>Información del evento</CardTitle>
                <CardDescription>Detalles importantes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {event.start_time && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{event.start_time}{event.end_time && ` - ${event.end_time}`}</span>
                  </div>
                )}
                {event.event_type && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Modalidad:</span>
                    <span className="text-sm capitalize">{event.event_type}</span>
                  </div>
                )}
                {event.venue_address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{event.venue_address}</span>
                  </div>
                )}
                {event.organizer_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Organizado por:</span>
                    <span className="text-sm">{event.organizer_name}</span>
                  </div>
                )}
                {event.tags && event.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {event.tags.map((tag, index) => (
                      <span 
                        key={index} 
                        className="bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Agenda */}
          {event.agenda && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5"/>Agenda
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Array.isArray(event.agenda) ? (
                    event.agenda.map((item: any, idx: number) => (
                      <div key={idx} className="grid gap-2 rounded-xl border p-4 md:grid-cols-[140px_1fr]">
                        <div className="text-sm font-medium">{item.time || `${idx + 1}. `}</div>
                        <div>
                          <div className="font-medium">{item.title || item}</div>
                          {item.description && (
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <p>{typeof event.agenda === 'string' ? event.agenda : 'Agenda por confirmar'}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comentarios */}
          <EntityComments entityId={event.id} entityType="event" />
        </>
      )}
    </div>
  );
}