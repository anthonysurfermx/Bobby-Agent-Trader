// src/services/startups.service.ts
import { supabase, handleSupabaseError, queryWrapper } from '../lib/supabase';
import type { 
  StartupApplication,
  StartupApplicationInsert,
  ServiceResponse 
} from '../types';
import { platformService } from './platform.service';

// Interface para la tabla startups real
interface Startup {
  id: string;
  name: string;
  slug: string;
  description?: string;
  website?: string;
  logo_url?: string;
  founded_date?: string;
  linkedin_url?: string;
  twitter_url?: string;
  github_url?: string;
  tags?: string[];
  categories?: string[];
  total_users?: number;
  is_featured?: boolean;
  status: string;
  country?: string;
  city?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  // Campos adicionales que podrías tener
  stage?: string;
  funding_stage?: string;
  employee_range?: string;
  verification_status?: string;
}

export const startupsService = {
  // Obtener todas las startups publicadas (excluyendo MVP stage)
  async getAll(): Promise<Startup[]> {
    try {
      const { data, error } = await supabase
        .from('startups')
        .select('*')
        .in('status', ['published', 'approved']) // Buscar ambos estados
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching startups:', error);
        return [];
      }

      // Excluir proyectos con stage='MVP' del directorio principal
      const filteredData = (data || []).filter(startup => {
        return startup.stage !== 'MVP';
      });

      return filteredData;
    } catch (error) {
      console.error('Error in getAll:', error);
      return [];
    }
  },

  // Obtener startups por estado específico
  async getByStatus(status: string): Promise<ServiceResponse<Startup[]>> {
    return queryWrapper(() =>
      supabase
        .from('startups')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false })
    );
  },

  // Obtener startups destacadas
  async getFeatured(limit: number = 3): Promise<ServiceResponse<Startup[]>> {
    return queryWrapper(() =>
      supabase
        .from('startups')
        .select('*')
        .in('status', ['published', 'approved'])
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(limit)
    );
  },

  // Obtener una startup por ID
  async getById(id: string): Promise<ServiceResponse<Startup>> {
    return queryWrapper(() =>
      supabase
        .from('startups')
        .select('*')
        .eq('id', id)
        .single()
    );
  },

  // Obtener una startup por slug
  async getBySlug(slug: string): Promise<ServiceResponse<Startup>> {
    return queryWrapper(() =>
      supabase
        .from('startups')
        .select('*')
        .eq('slug', slug)
        .single()
    );
  },

  // Crear nueva startup
  async create(startup: Partial<Startup>): Promise<ServiceResponse<Startup>> {
    const result = await queryWrapper(() =>
      supabase
        .from('startups')
        .insert(startup)
        .select()
        .single()
    );
    
    if (result.data) {
      // Log creación
      await platformService.logEvent(
        'startup_created',
        { 
          startup_name: startup.name,
          startup_id: result.data.id
        },
        'info',
        `New startup created: ${startup.name}`
      );
    }
    
    return result;
  },

  // Actualizar startup
  async update(id: string, updates: Partial<Startup>): Promise<ServiceResponse<Startup>> {
    const result = await queryWrapper(() =>
      supabase
        .from('startups')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
    );
    
    if (result.data) {
      // Log actualización
      await platformService.logEvent(
        'startup_updated',
        { 
          startup_id: id,
          updates: Object.keys(updates)
        },
        'info'
      );
    }
    
    return result;
  },

  // Actualizar estado de startup
  async updateStatus(
    id: string, 
    status: string
  ): Promise<ServiceResponse<Startup>> {
    const result = await queryWrapper(() =>
      supabase
        .from('startups')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
    );
    
    if (result.data) {
      // Log cambio de estado
      await platformService.logEvent(
        'startup_status_changed',
        { 
          startup_id: id,
          new_status: status
        },
        'info'
      );
    }
    
    return result;
  },

  // Eliminar startup (soft delete - cambiar a draft)
  async delete(id: string): Promise<ServiceResponse<void>> {
    const result = await queryWrapper(() =>
      supabase
        .from('startups')
        .update({ status: 'draft' })
        .eq('id', id)
    );

    if (!result.error) {
      // Log eliminación
      await platformService.logEvent(
        'startup_deactivated',
        { startup_id: id },
        'warning'
      );
    }

    return result;
  },

  // Eliminar startup permanentemente
  async permanentlyDelete(id: string): Promise<ServiceResponse<void>> {
    const result = await queryWrapper(() =>
      supabase
        .from('startups')
        .delete()
        .eq('id', id)
    );

    if (!result.error) {
      // Log eliminación permanente
      await platformService.logEvent(
        'startup_permanently_deleted',
        { startup_id: id },
        'warning'
      );
    }

    return result;
  },

  // Obtener estadísticas de startups
  async getStats(): Promise<ServiceResponse<any>> {
    const result = await queryWrapper(() =>
      supabase
        .from('startups')
        .select('status, categories, tags, is_featured')
        .order('created_at', { ascending: false })
    );
    
    if (!result.data) {
      return { data: null, error: result.error };
    }
    
    // Procesar estadísticas
    const stats = {
      total: result.data.length,
      published: result.data.filter(s => s.status === 'published' || s.status === 'approved').length,
      draft: result.data.filter(s => s.status === 'draft').length,
      featured: result.data.filter(s => s.is_featured).length,
      byStatus: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      byTag: {} as Record<string, number>
    };
    
    result.data.forEach(startup => {
      // Por estado
      stats.byStatus[startup.status] = (stats.byStatus[startup.status] || 0) + 1;
      
      // Por categorías
      if (startup.categories && Array.isArray(startup.categories)) {
        startup.categories.forEach(cat => {
          stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
        });
      }
      
      // Por tags
      if (startup.tags && Array.isArray(startup.tags)) {
        startup.tags.forEach(tag => {
          stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
        });
      }
    });
    
    return { data: stats, error: null };
  },

  // Buscar startups
  async search(query: string): Promise<ServiceResponse<Startup[]>> {
    return queryWrapper(() =>
      supabase
        .from('startups')
        .select('*')
        .in('status', ['published', 'approved'])
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .order('created_at', { ascending: false })
    );
  },

  // Obtener proyectos MVP Hackathon (filtrados por stage='MVP')
  async getHackathonProjects(): Promise<Startup[]> {
    try {
      const { data, error } = await supabase
        .from('startups')
        .select('*')
        .in('status', ['published', 'approved'])
        .eq('stage', 'MVP')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching hackathon projects:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getHackathonProjects:', error);
      return [];
    }
  },

  // ========== MÉTODOS LEGACY PARA STARTUP_APPLICATIONS ==========
  // Mantener para compatibilidad si todavía usas la tabla startup_applications

  // Crear nueva aplicación
  async apply(application: StartupApplicationInsert): Promise<ServiceResponse<StartupApplication>> {
    const result = await queryWrapper(() =>
      supabase
        .from('startup_applications')
        .insert(application)
        .select()
        .single()
    );
    
    if (result.data) {
      // Log aplicación
      await platformService.logEvent(
        'startup_application_submitted',
        { 
          startup_name: application.startup_name,
          founder_email: application.founder_email,
          funding_stage: application.funding_stage
        },
        'info',
        `New startup application: ${application.startup_name}`
      );
    }
    
    return result;
  },

  // Obtener aplicaciones por estado
  async getApplicationsByStatus(status: string): Promise<ServiceResponse<StartupApplication[]>> {
    return queryWrapper(() =>
      supabase
        .from('startup_applications')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false })
    );
  }
};