import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  PixelCalendar,
  PixelClock,
  PixelMapPin,
  PixelUsers,
  PixelExternalLink,
  PixelGlobe,
  PixelAlertCircle,
  PixelFilter,
  PixelSearch,
  PixelChevronRight,
  PixelTicket,
  PixelPlus
} from "@/components/ui/pixel-icons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { eventsService, type Event, type EventType } from "@/services/events.service";
import { useAuth } from "@/hooks/useAuth";

const EventosPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [pastEvents, setPastEvents] = useState<Event[]>([]);
  const [featuredEvents, setFeaturedEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState<EventType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Función para agregar evento
  const handleAddEvent = () => {
    if (user) {
      navigate('/user/eventos/nuevo');
    } else {
      navigate('/login?redirectTo=/user/eventos/nuevo');
    }
  };
  
  // Cargar eventos desde Supabase
  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar eventos en paralelo
      const [upcomingResult, pastResult, featuredResult] = await Promise.all([
        eventsService.getUpcoming(20),
        eventsService.getPast(10),
        eventsService.getFeatured(4)
      ]);

      if (upcomingResult.error) {
        throw new Error(upcomingResult.error);
      }
      if (pastResult.error) {
        throw new Error(pastResult.error);
      }
      if (featuredResult.error) {
        throw new Error(featuredResult.error);
      }

      setUpcomingEvents(upcomingResult.data || []);
      setPastEvents(pastResult.data || []);
      setFeaturedEvents(featuredResult.data || []);

    } catch (err) {
      console.error('Error loading events:', err);
      setError(t('events.noResults'));
    } finally {
      setLoading(false);
    }
  };

  // Filtrar eventos
  const filteredUpcomingEvents = upcomingEvents.filter(event => {
    const matchesSearch = searchTerm === "" || 
      event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = eventTypeFilter === "all" || event.event_type === eventTypeFilter;
    const matchesCategory = categoryFilter === "all" || event.category === categoryFilter;
    
    return matchesSearch && matchesType && matchesCategory;
  });

  const filteredPastEvents = pastEvents.filter(event => {
    const matchesSearch = searchTerm === "" || 
      event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = eventTypeFilter === "all" || event.event_type === eventTypeFilter;
    const matchesCategory = categoryFilter === "all" || event.category === categoryFilter;
    
    return matchesSearch && matchesType && matchesCategory;
  });

  // Función para formatear fecha
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Función para formatear hora
  const formatTime = (timeString: string | null) => {
    if (!timeString) return "Por definir";
    
    // Si el tiempo ya viene formateado como HH:mm
    if (timeString.match(/^\d{2}:\d{2}/)) {
      return timeString.substring(0, 5);
    }
    
    return timeString;
  };

  // Obtener badge variant basado en el tipo de evento
  const getEventTypeBadge = (eventType: EventType) => {
    switch (eventType) {
      case 'presencial':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Presencial</Badge>;
      case 'online':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Online</Badge>;
      case 'hibrido':
        return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">Híbrido</Badge>;
      default:
        return <Badge variant="outline">Evento</Badge>;
    }
  };

  // Componente de tarjeta de evento
  const EventCard = ({ event, index, isPast = false }: { event: Event; index: number; isPast?: boolean }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1 * index }}
    >
      <Card className="bg-card hover:shadow-elegant transition-all duration-300 border-border hover:border-primary/30 h-full flex flex-col">
        {/* Imagen del evento si existe */}
        {event.image_url && (
          <div className="relative h-48 overflow-hidden rounded-t-lg">
            <img 
              src={event.image_url} 
              alt={event.title}
              className="w-full h-full object-cover"
            />
            {event.is_featured && (
              <Badge className="absolute top-3 right-3 bg-yellow-500/90 text-yellow-900">
                Destacado
              </Badge>
            )}
          </div>
        )}
        
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            {getEventTypeBadge(event.event_type)}
            <Badge variant={isPast ? "secondary" : "default"} className="text-xs">
              {isPast ? "Finalizado" : "Próximo"}
            </Badge>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-foreground line-clamp-2">{event.title}</h3>
            {event.subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{event.subtitle}</p>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 flex-1 flex flex-col">
          <p className="text-muted-foreground text-sm line-clamp-3">
            {event.description}
          </p>

          <div className="space-y-3 flex-1">
            {/* Fecha */}
            <div className="flex items-center text-sm text-muted-foreground">
              <PixelCalendar size={16} className="mr-2 text-primary flex-shrink-0" />
              <span className="line-clamp-1">{formatDate(event.start_date)}</span>
            </div>
            
            {/* Hora */}
            <div className="flex items-center text-sm text-muted-foreground">
              <PixelClock size={16} className="mr-2 text-primary flex-shrink-0" />
              <span>{formatTime(event.start_time)}</span>
            </div>
            
            {/* Ubicación */}
            <div className="flex items-center text-sm text-muted-foreground">
              {event.event_type === 'online' ? (
                <>
                  <PixelGlobe size={16} className="mr-2 text-primary flex-shrink-0" />
                  <span>{event.online_platform || "Online"}</span>
                </>
              ) : (
                <>
                  <PixelMapPin size={16} className="mr-2 text-primary flex-shrink-0" />
                  <span className="line-clamp-1">
                    {event.venue_name || event.venue_city || "Por definir"}
                  </span>
                </>
              )}
            </div>

            {/* Capacidad */}
            {event.capacity && (
              <div className="flex items-center text-sm text-muted-foreground">
                <PixelUsers size={16} className="mr-2 text-primary flex-shrink-0" />
                <span>
                  {event.current_attendees || 0} / {event.capacity} asistentes
                </span>
              </div>
            )}

            {/* Precio */}
            <div className="flex items-center text-sm">
              <PixelTicket size={16} className="mr-2 text-primary flex-shrink-0" />
              {event.is_free ? (
                <Badge variant="outline" className="text-green-500 border-green-500/50">
                  GRATIS
                </Badge>
              ) : (
                <span className="font-semibold">
                  {event.currency} ${event.price?.toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="pt-4 space-y-2">
            {!isPast && (
              <>
                {event.registration_url ? (
                  <a 
                    href={event.registration_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Button className="w-full bg-gradient-primary text-primary-foreground hover:shadow-neon">
                      Registrarse
                      <PixelExternalLink size={16} className="ml-2" />
                    </Button>
                  </a>
                ) : (
                  <Button className="w-full bg-gradient-primary text-primary-foreground hover:shadow-neon">
                    Más información
                  </Button>
                )}
              </>
            )}
            
            <Link to={`/eventos/${event.slug || event.id}`}>
              <Button variant="outline" className="w-full">
                Ver detalles
                <PixelChevronRight size={16} className="ml-2" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  // Loading skeleton
  const EventSkeleton = () => (
    <Card className="bg-card">
      <div className="h-48 bg-muted animate-pulse rounded-t-lg" />
      <CardHeader className="space-y-4">
        <div className="flex justify-between">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-16" />
        </div>
        <Skeleton className="h-7 w-3/4" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1"
          >
            <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-4">
              Eventos <span className="text-gradient">DeFi México</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-3xl">
              Únete a nuestra vibrante comunidad en eventos, workshops y meetups.
              Aprende de expertos, conecta con otros desarrolladores y mantente
              al día con las últimas tendencias DeFi.
            </p>
          </motion.div>
          <Button
            size="lg"
            onClick={handleAddEvent}
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            <PixelPlus size={20} className="mr-2" />
            Agrega tu evento
          </Button>
        </div>

        {/* Filtros */}
        {!loading && !error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8 p-4 bg-card rounded-lg border border-border"
          >
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Búsqueda */}
              <div className="flex-1">
                <div className="relative">
                  <PixelSearch size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar eventos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Filtro por tipo */}
              <Select value={eventTypeFilter} onValueChange={(value: any) => setEventTypeFilter(value)}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <PixelFilter size={16} className="mr-2" />
                  <SelectValue placeholder="Tipo de evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="presencial">Presencial</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="hibrido">Híbrido</SelectItem>
                </SelectContent>
              </Select>

              {/* Limpiar filtros */}
              {(searchTerm || eventTypeFilter !== "all") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm("");
                    setEventTypeFilter("all");
                    setCategoryFilter("all");
                  }}
                >
                  Limpiar filtros
                </Button>
              )}
            </div>
          </motion.div>
        )}

        {/* Error state */}
        {error && (
          <Alert className="mb-8">
            <PixelAlertCircle size={16} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Loading state */}
        {loading && (
          <div className="space-y-16">
            {/* Upcoming events skeleton */}
            <section>
              <div className="mb-8">
                <Skeleton className="h-8 w-48 mb-4" />
                <Skeleton className="h-4 w-64" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <EventSkeleton key={i} />
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Featured Events */}
        {!loading && !error && featuredEvents.length > 0 && (
          <section className="mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-8"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-2 h-8 bg-yellow-500 rounded-full" />
                <h2 className="text-3xl font-bold text-foreground">Eventos Destacados</h2>
              </div>
              <p className="text-muted-foreground">
                Los eventos más importantes que no te puedes perder
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              {featuredEvents.slice(0, 2).map((event, index) => (
                <EventCard key={event.id} event={event} index={index} />
              ))}
            </div>
          </section>
        )}

        {/* Upcoming Events */}
        {!loading && !error && (
          filteredUpcomingEvents.length > 0 ? (
            <section className="mb-16">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mb-8"
              >
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-2 h-8 bg-gradient-primary rounded-full" />
                  <h2 className="text-3xl font-bold text-foreground">Próximos Eventos</h2>
                </div>
                <p className="text-muted-foreground">
                  No te pierdas estos increíbles eventos que vienen
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredUpcomingEvents.map((event, index) => (
                  <EventCard key={event.id} event={event} index={index} />
                ))}
              </div>
            </section>
          ) : (
            <section className="mb-16">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="text-center py-12"
              >
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <PixelCalendar size={32} className="text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No hay eventos próximos
                </h3>
                <p className="text-muted-foreground mb-4">
                  Mantente atento a nuestras redes sociales para conocer los próximos eventos.
                </p>
              </motion.div>
            </section>
          )
        )}

        {/* Past Events */}
        {!loading && !error && filteredPastEvents.length > 0 && (
          <section>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mb-8"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-2 h-8 bg-muted rounded-full" />
                <h2 className="text-3xl font-bold text-foreground">Eventos Pasados</h2>
              </div>
              <p className="text-muted-foreground">
                Revisa los eventos que hemos organizado anteriormente
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPastEvents.map((event, index) => (
                <EventCard key={event.id} event={event} index={index} isPast />
              ))}
            </div>
          </section>
        )}

        {/* CTA Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 text-center"
        >
          <div className="bg-gradient-dark p-8 rounded-2xl border border-border">
            <PixelUsers size={48} className="text-primary mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-foreground mb-4">
              ¿Quieres organizar un evento?
            </h3>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              Si tienes una idea para un evento, workshop o meetup relacionado con DeFi, 
              nos encantaría colaborar contigo para hacerlo realidad.
            </p>
            <Button size="lg" onClick={handleAddEvent} className="bg-gradient-primary text-primary-foreground hover:shadow-neon">
              Proponer Evento
            </Button>
          </div>
        </motion.section>
      </div>
    </div>
  );
};

export default EventosPage;