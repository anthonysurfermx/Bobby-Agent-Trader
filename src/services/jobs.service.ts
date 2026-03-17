// src/services/jobs.service.ts
import { supabase, queryWrapper } from '../lib/supabase';
import type { ServiceResponse } from '../types';
import { platformService } from './platform.service';

// Interface para la tabla jobs
export interface Job {
  id: string;
  title: string;
  company: string;
  company_logo?: string;
  location: string;
  job_type: 'remote' | 'hybrid' | 'onsite';
  category: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  experience_level: string;
  tags: string[];
  description: string;
  requirements?: string;
  benefits?: string;
  apply_url: string;
  apply_email?: string;
  is_featured: boolean;
  status: 'draft' | 'published' | 'closed' | 'expired';
  expires_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export type JobInsert = Omit<Job, 'id' | 'created_at' | 'updated_at'>;
export type JobUpdate = Partial<JobInsert>;

export const jobsService = {
  // Obtener todos los trabajos publicados
  async getAll(): Promise<Job[]> {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'published')
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching jobs:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAll:', error);
      return [];
    }
  },

  // Obtener trabajos por estado específico (para admin)
  async getByStatus(status: string): Promise<ServiceResponse<Job[]>> {
    return queryWrapper(() =>
      supabase
        .from('jobs')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false })
    );
  },

  // Obtener todos los trabajos (para admin)
  async getAllAdmin(): Promise<ServiceResponse<Job[]>> {
    return queryWrapper(() =>
      supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
    );
  },

  // Obtener trabajos destacados
  async getFeatured(limit: number = 5): Promise<ServiceResponse<Job[]>> {
    return queryWrapper(() =>
      supabase
        .from('jobs')
        .select('*')
        .eq('status', 'published')
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(limit)
    );
  },

  // Obtener un trabajo por ID
  async getById(id: string): Promise<ServiceResponse<Job>> {
    return queryWrapper(() =>
      supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .single()
    );
  },

  // Crear nuevo trabajo
  async create(job: JobInsert): Promise<ServiceResponse<Job>> {
    const result = await queryWrapper(() =>
      supabase
        .from('jobs')
        .insert({
          ...job,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()
    );

    if (result.data) {
      await platformService.logEvent(
        'job_created',
        {
          job_title: job.title,
          company: job.company,
          job_id: result.data.id
        },
        'info',
        `New job posting created: ${job.title} at ${job.company}`
      );
    }

    return result;
  },

  // Actualizar trabajo
  async update(id: string, updates: JobUpdate): Promise<ServiceResponse<Job>> {
    const result = await queryWrapper(() =>
      supabase
        .from('jobs')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
    );

    if (result.data) {
      await platformService.logEvent(
        'job_updated',
        {
          job_id: id,
          updates: Object.keys(updates)
        },
        'info'
      );
    }

    return result;
  },

  // Actualizar estado del trabajo
  async updateStatus(id: string, status: Job['status']): Promise<ServiceResponse<Job>> {
    const result = await queryWrapper(() =>
      supabase
        .from('jobs')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
    );

    if (result.data) {
      await platformService.logEvent(
        'job_status_changed',
        {
          job_id: id,
          new_status: status
        },
        'info'
      );
    }

    return result;
  },

  // Marcar como destacado
  async toggleFeatured(id: string, isFeatured: boolean): Promise<ServiceResponse<Job>> {
    return queryWrapper(() =>
      supabase
        .from('jobs')
        .update({
          is_featured: isFeatured,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
    );
  },

  // Eliminar trabajo (soft delete - cambiar a draft)
  async delete(id: string): Promise<ServiceResponse<void>> {
    const result = await queryWrapper(() =>
      supabase
        .from('jobs')
        .update({ status: 'closed' })
        .eq('id', id)
    );

    if (!result.error) {
      await platformService.logEvent(
        'job_closed',
        { job_id: id },
        'warning'
      );
    }

    return result;
  },

  // Eliminar trabajo permanentemente
  async permanentlyDelete(id: string): Promise<ServiceResponse<void>> {
    const result = await queryWrapper(() =>
      supabase
        .from('jobs')
        .delete()
        .eq('id', id)
    );

    if (!result.error) {
      await platformService.logEvent(
        'job_permanently_deleted',
        { job_id: id },
        'warning'
      );
    }

    return result;
  },

  // Obtener estadísticas
  async getStats(): Promise<ServiceResponse<{
    total: number;
    published: number;
    draft: number;
    closed: number;
    featured: number;
    byCategory: Record<string, number>;
    byType: Record<string, number>;
  }>> {
    const result = await queryWrapper(() =>
      supabase
        .from('jobs')
        .select('status, category, job_type, is_featured')
    );

    if (!result.data) {
      return { data: null, error: result.error };
    }

    const stats = {
      total: result.data.length,
      published: result.data.filter(j => j.status === 'published').length,
      draft: result.data.filter(j => j.status === 'draft').length,
      closed: result.data.filter(j => j.status === 'closed').length,
      featured: result.data.filter(j => j.is_featured).length,
      byCategory: {} as Record<string, number>,
      byType: {} as Record<string, number>
    };

    result.data.forEach(job => {
      if (job.category) {
        stats.byCategory[job.category] = (stats.byCategory[job.category] || 0) + 1;
      }
      if (job.job_type) {
        stats.byType[job.job_type] = (stats.byType[job.job_type] || 0) + 1;
      }
    });

    return { data: stats, error: null };
  },

  // Buscar trabajos
  async search(query: string): Promise<ServiceResponse<Job[]>> {
    return queryWrapper(() =>
      supabase
        .from('jobs')
        .select('*')
        .eq('status', 'published')
        .or(`title.ilike.%${query}%,company.ilike.%${query}%,description.ilike.%${query}%`)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
    );
  },

  // Filtrar por categoría
  async getByCategory(category: string): Promise<ServiceResponse<Job[]>> {
    return queryWrapper(() =>
      supabase
        .from('jobs')
        .select('*')
        .eq('status', 'published')
        .eq('category', category)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
    );
  },

  // Filtrar por tipo de trabajo
  async getByType(jobType: Job['job_type']): Promise<ServiceResponse<Job[]>> {
    return queryWrapper(() =>
      supabase
        .from('jobs')
        .select('*')
        .eq('status', 'published')
        .eq('job_type', jobType)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
    );
  }
};
