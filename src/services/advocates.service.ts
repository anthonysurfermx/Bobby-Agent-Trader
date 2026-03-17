// src/services/advocates.service.ts
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types';

export type DeFiAdvocate = Tables<'defi_advocates'>;
export type DeFiAdvocateInsert = TablesInsert<'defi_advocates'>;
export type DeFiAdvocateUpdate = TablesUpdate<'defi_advocates'>;

export const advocatesService = {
  /**
   * Obtener todos los advocates activos (público)
   */
  async getActiveAdvocates() {
    const { data, error } = await supabase
      .from('defi_advocates')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching advocates:', error);
      throw error;
    }

    return data;
  },

  /**
   * Obtener advocates destacados (público)
   */
  async getFeaturedAdvocates() {
    const { data, error } = await supabase
      .from('defi_advocates')
      .select('*')
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching featured advocates:', error);
      throw error;
    }

    return data;
  },

  /**
   * Obtener advocates por track/tipo (público)
   */
  async getAdvocatesByTrack(track: string) {
    const { data, error } = await supabase
      .from('defi_advocates')
      .select('*')
      .eq('is_active', true)
      .eq('track', track)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching advocates by track:', error);
      throw error;
    }

    return data;
  },

  /**
   * Obtener un advocate por slug (público)
   */
  async getAdvocateBySlug(slug: string) {
    const { data, error } = await supabase
      .from('defi_advocates')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Error fetching advocate by slug:', error);
      throw error;
    }

    return data;
  },

  /**
   * ==================== ADMIN FUNCTIONS ====================
   */

  /**
   * Obtener todos los advocates (admin - incluye inactivos)
   */
  async getAllAdvocates() {
    const { data, error } = await supabase
      .from('defi_advocates')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all advocates:', error);
      throw error;
    }

    return data;
  },

  /**
   * Obtener un advocate por ID (admin)
   */
  async getAdvocateById(id: string) {
    const { data, error } = await supabase
      .from('defi_advocates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching advocate by ID:', error);
      throw error;
    }

    return data;
  },

  /**
   * Crear un nuevo advocate (admin)
   */
  async createAdvocate(advocate: DeFiAdvocateInsert) {
    const { data, error } = await supabase
      .from('defi_advocates')
      .insert(advocate)
      .select()
      .single();

    if (error) {
      console.error('Error creating advocate:', error);
      throw error;
    }

    return data;
  },

  /**
   * Actualizar un advocate (admin)
   */
  async updateAdvocate(id: string, updates: DeFiAdvocateUpdate) {
    const { data, error } = await supabase
      .from('defi_advocates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating advocate:', error);
      throw error;
    }

    return data;
  },

  /**
   * Eliminar un advocate (admin - soft delete marcando como inactivo)
   */
  async deleteAdvocate(id: string) {
    const { error } = await supabase
      .from('defi_advocates')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error deleting advocate:', error);
      throw error;
    }

    return true;
  },

  /**
   * Eliminar permanentemente un advocate (admin)
   */
  async permanentlyDeleteAdvocate(id: string) {
    const { error } = await supabase
      .from('defi_advocates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error permanently deleting advocate:', error);
      throw error;
    }

    return true;
  },

  /**
   * Toggle featured status (admin)
   */
  async toggleFeatured(id: string, isFeatured: boolean) {
    const { data, error } = await supabase
      .from('defi_advocates')
      .update({ is_featured: isFeatured })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error toggling featured status:', error);
      throw error;
    }

    return data;
  },

  /**
   * Toggle active status (admin)
   */
  async toggleActive(id: string, isActive: boolean) {
    const { data, error } = await supabase
      .from('defi_advocates')
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error toggling active status:', error);
      throw error;
    }

    return data;
  },

  /**
   * Generar slug a partir del nombre
   */
  generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
      .replace(/[^a-z0-9\s-]/g, '') // Eliminar caracteres especiales
      .trim()
      .replace(/\s+/g, '-') // Reemplazar espacios por guiones
      .replace(/-+/g, '-'); // Eliminar guiones duplicados
  },
};
