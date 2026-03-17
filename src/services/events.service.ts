// src/services/events.service.ts
import { supabase } from '@/lib/supabase';

// Tipos basados en la estructura real de la tabla events en Supabase
export interface Event {
  id: string;
  title: string;
  slug: string | null;
  subtitle: string | null;
  description: string;
  agenda: Array<{
    time?: string;
    title: string;
    description?: string;
  }> | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string;
  event_type: 'presencial' | 'online' | 'hibrido';
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_country: string | null;
  venue_postal_code: string | null;
  venue_latitude: number | null;
  venue_longitude: number | null;
  online_platform: string | null;
  online_url: string | null;
  image_url: string | null;
  banner_url: string | null;
  video_url: string | null;
  capacity: number | null;
  current_attendees: number;
  waitlist_enabled: boolean;
  waitlist_count: number;
  registration_required: boolean;
  registration_url: string | null;
  registration_deadline: string | null;
  is_free: boolean;
  price: number;
  early_bird_price: number | null;
  early_bird_deadline: string | null;
  currency: string;
  payment_methods: string[] | null;
  category: string | null;
  tags: string[] | null;
  difficulty_level: string | null;
  language: string[] | null;
  organizer_id: string | null;
  organizer_name: string | null;
  organizer_email: string | null;
  organizer_phone: string | null;
  sponsors: Array<{
    name: string;
    logo?: string;
    website?: string;
  }> | null;
  partners: Array<{
    name: string;
    logo?: string;
    website?: string;
  }> | null;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  cancellation_reason: string | null;
  is_featured: boolean;
  view_count: number;
  share_count: number;
  created_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type EventInsert = Partial<Omit<Event, 'id' | 'created_at' | 'updated_at'>> & {
  title: string;
  description: string;
  start_date: string;
  event_type: 'presencial' | 'online' | 'hibrido';
  timezone: string;
};

export type EventUpdate = Partial<Omit<Event, 'id' | 'created_at' | 'updated_at'>>;

// Tipos adicionales para el frontend
export type EventType = 'presencial' | 'online' | 'hibrido';
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';

// Interfaz para filtros
export interface EventFilters {
  search?: string;
  status?: EventStatus;
  event_type?: EventType;
  category?: string;
  is_featured?: boolean;
  start_date_from?: string;
  start_date_to?: string;
  limit?: number;
  offset?: number;
}

// Response types para manejar errores
export interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
}

class EventsService {
  // Obtener todos los eventos con filtros
  async getAll(filters?: EventFilters): Promise<ServiceResponse<Event[]>> {
    try {
      let query = supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: false })
        .order('start_time', { ascending: false });

      // Aplicar filtros
      if (filters?.status) {
        query = query.eq('status', filters.status);
      } else {
        // Por defecto solo mostrar eventos publicados
        query = query.eq('status', 'published');
      }

      if (filters?.event_type) {
        query = query.eq('event_type', filters.event_type);
      }

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }

      if (filters?.is_featured !== undefined) {
        query = query.eq('is_featured', filters.is_featured);
      }

      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      if (filters?.start_date_from) {
        query = query.gte('start_date', filters.start_date_from);
      }

      if (filters?.start_date_to) {
        query = query.lte('start_date', filters.start_date_to);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching events:', error);
        return { data: null, error: error.message };
      }

      return { data: data || [], error: null };
    } catch (err) {
      console.error('Error in getAll:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Obtener eventos próximos
  async getUpcoming(limit: number = 6): Promise<ServiceResponse<Event[]>> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('Error fetching upcoming events:', error);
        return { data: null, error: error.message };
      }

      return { data: data || [], error: null };
    } catch (err) {
      console.error('Error in getUpcoming:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Obtener eventos pasados
  async getPast(limit: number = 10): Promise<ServiceResponse<Event[]>> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .lt('start_date', today)
        .order('start_date', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching past events:', error);
        return { data: null, error: error.message };
      }

      return { data: data || [], error: null };
    } catch (err) {
      console.error('Error in getPast:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Obtener eventos destacados
  async getFeatured(limit: number = 4): Promise<ServiceResponse<Event[]>> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .eq('is_featured', true)
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('Error fetching featured events:', error);
        return { data: null, error: error.message };
      }

      return { data: data || [], error: null };
    } catch (err) {
      console.error('Error in getFeatured:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Obtener evento por ID
  async getById(id: string): Promise<ServiceResponse<Event>> {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { data: null, error: 'Evento no encontrado' };
        }
        console.error('Error fetching event:', error);
        return { data: null, error: error.message };
      }

      // Incrementar contador de vistas
      if (data) {
        await supabase
          .from('events')
          .update({ view_count: (data.view_count || 0) + 1 })
          .eq('id', id);
      }

      return { data, error: null };
    } catch (err) {
      console.error('Error in getById:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Obtener evento por slug
  async getBySlug(slug: string): Promise<ServiceResponse<Event>> {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { data: null, error: 'Evento no encontrado' };
        }
        console.error('Error fetching event by slug:', error);
        return { data: null, error: error.message };
      }

      // Incrementar contador de vistas
      if (data) {
        await supabase
          .from('events')
          .update({ view_count: (data.view_count || 0) + 1 })
          .eq('slug', slug);
      }

      return { data, error: null };
    } catch (err) {
      console.error('Error in getBySlug:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Crear evento
  async create(event: EventInsert): Promise<ServiceResponse<Event>> {
    try {
      const { data, error } = await supabase
        .from('events')
        .insert(event)
        .select()
        .single();

      if (error) {
        console.error('Error creating event:', error);
        return { data: null, error: error.message };
      }

      return { data, error: null };
    } catch (err) {
      console.error('Error in create:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Actualizar evento
  async update(id: string, updates: EventUpdate): Promise<ServiceResponse<Event>> {
    try {
      const { data, error } = await supabase
        .from('events')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating event:', error);
        return { data: null, error: error.message };
      }

      return { data, error: null };
    } catch (err) {
      console.error('Error in update:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Eliminar evento (soft delete - cambiar status a cancelled)
  async delete(id: string): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase
        .from('events')
        .update({
          status: 'cancelled',
          cancellation_reason: 'Evento cancelado por el administrador',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        console.error('Error deleting event:', error);
        return { data: false, error: error.message };
      }

      return { data: true, error: null };
    } catch (err) {
      console.error('Error in delete:', err);
      return {
        data: false,
        error: err instanceof Error ? err.message : 'Error desconocido'
      };
    }
  }

  // Eliminar evento permanentemente
  async permanentlyDelete(id: string): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error permanently deleting event:', error);
        return { data: false, error: error.message };
      }

      return { data: true, error: null };
    } catch (err) {
      console.error('Error in permanentlyDelete:', err);
      return {
        data: false,
        error: err instanceof Error ? err.message : 'Error desconocido'
      };
    }
  }

  // Obtener estadísticas
  async getStats(): Promise<ServiceResponse<{
    total: number;
    upcoming: number;
    past: number;
    cancelled: number;
    totalAttendees: number;
  }>> {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Obtener conteos
      const [totalResult, upcomingResult, pastResult, cancelledResult] = await Promise.all([
        supabase.from('events').select('*', { count: 'exact', head: true }),
        supabase.from('events').select('*', { count: 'exact', head: true })
          .eq('status', 'published')
          .gte('start_date', today),
        supabase.from('events').select('*', { count: 'exact', head: true })
          .eq('status', 'published')
          .lt('start_date', today),
        supabase.from('events').select('*', { count: 'exact', head: true })
          .eq('status', 'cancelled')
      ]);

      // Obtener total de asistentes
      const { data: eventsWithAttendees } = await supabase
        .from('events')
        .select('current_attendees')
        .not('current_attendees', 'is', null);

      const totalAttendees = eventsWithAttendees?.reduce(
        (sum, event) => sum + (event.current_attendees || 0), 
        0
      ) || 0;

      return {
        data: {
          total: totalResult.count || 0,
          upcoming: upcomingResult.count || 0,
          past: pastResult.count || 0,
          cancelled: cancelledResult.count || 0,
          totalAttendees
        },
        error: null
      };
    } catch (err) {
      console.error('Error in getStats:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Registrar asistente
  async registerAttendee(eventId: string): Promise<ServiceResponse<boolean>> {
    try {
      // Primero obtener el evento
      const { data: event, error: fetchError } = await supabase
        .from('events')
        .select('current_attendees, capacity')
        .eq('id', eventId)
        .single();

      if (fetchError || !event) {
        return { data: false, error: 'Evento no encontrado' };
      }

      // Verificar capacidad
      if (event.capacity && event.current_attendees >= event.capacity) {
        return { data: false, error: 'Evento lleno' };
      }

      // Actualizar contador
      const { error } = await supabase
        .from('events')
        .update({ 
          current_attendees: (event.current_attendees || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', eventId);

      if (error) {
        console.error('Error registering attendee:', error);
        return { data: false, error: error.message };
      }

      return { data: true, error: null };
    } catch (err) {
      console.error('Error in registerAttendee:', err);
      return { 
        data: false, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }
}

export const eventsService = new EventsService();

// Export for backwards compatibility
export const eventService = eventsService;