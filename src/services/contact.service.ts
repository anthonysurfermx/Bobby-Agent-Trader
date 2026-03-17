import { supabase, handleSupabaseError, queryWrapper } from '../lib/supabase';
import type { 
  ContactForm, 
  ContactFormInsert, 
  ContactFormFilters,
  ServiceResponse 
} from '../types';
import { platformService } from './platform.service';

export const contactService = {
  // Crear nuevo mensaje de contacto
  async create(contact: ContactFormInsert): Promise<ServiceResponse<ContactForm>> {
    const result = await queryWrapper(() =>
      supabase
        .from('contact_forms')
        .insert(contact)
        .select()
        .single()
    );
    
    if (result.data) {
      // Log the contact form submission
      await platformService.logEvent(
        'contact_form_submitted',
        { form_id: result.data.id, email: contact.email },
        'info',
        `New contact form from ${contact.email}`
      );
    }
    
    return result;
  },

  // Obtener todos los mensajes con filtros
  async getAll(filters?: ContactFormFilters): Promise<ServiceResponse<ContactForm[]>> {
    return queryWrapper(() => {
      let query = supabase
        .from('contact_forms')
        .select('*', { count: 'exact' });

      // Aplicar filtros
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.priority) {
        query = query.eq('priority', filters.priority);
      }
      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }
      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      // Ordenar por prioridad y fecha
      query = query.order('priority', { ascending: false })
                   .order('created_at', { ascending: false });

      return query;
    });
  },

  // Actualizar estado del mensaje
  async updateStatus(id: string, status: string, assignedTo?: string): Promise<ServiceResponse<ContactForm>> {
    const updates: any = { status };
    if (assignedTo !== undefined) {
      updates.assigned_to = assignedTo;
    }

    return queryWrapper(() =>
      supabase
        .from('contact_forms')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
    );
  }
};
