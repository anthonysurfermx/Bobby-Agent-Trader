// src/services/users.service.ts
// NOTA: Este servicio necesita que la tabla 'profiles' exista en Supabase
// Por ahora está deshabilitado hasta que se cree la tabla correspondiente

// Reutilizar el cliente de Supabase compartido para evitar múltiples instancias
import { supabase } from '@/lib/supabase';

// @ts-ignore - Tabla profiles no existe aún en el esquema

// Tipos para el manejo de usuarios
export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'editor' | 'moderator' | 'viewer' | 'user';
  created_at: string;
  updated_at: string;
  // Campos adicionales que podemos agregar más tarde
  avatar_url?: string | null;
  status?: 'active' | 'inactive' | 'pending';
  last_sign_in_at?: string | null;
  phone?: string | null;
  bio?: string | null;
  location?: string | null;
  company?: string | null;
  website?: string | null;
  twitter?: string | null;
  linkedin?: string | null;
  github?: string | null;
  permissions?: string[];
}

export interface UserFilters {
  search?: string;
  role?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface UserUpdate {
  name?: string;
  role?: string;
  status?: string;
  permissions?: string[];
  bio?: string;
  location?: string;
  company?: string;
  website?: string;
  twitter?: string;
  linkedin?: string;
  github?: string;
}

export interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  pending: number;
  admins: number;
  editors: number;
  moderators: number;
  viewers: number;
}

class UsersService {
  // Obtener todos los usuarios con filtros
  async getAll(filters?: UserFilters): Promise<ServiceResponse<AppUser[]>> {
    try {
      let query = supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          role,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false });

      // Aplicar filtros
      if (filters?.search) {
        query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
      }

      if (filters?.role && filters.role !== 'all') {
        query = query.eq('role', filters.role);
      }

      // TODO: Agregar campo status a la tabla profiles
      // if (filters?.status && filters.status !== 'all') {
      //   query = query.eq('status', filters.status);
      // }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching users:', error);
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

  // Obtener usuario por ID
  async getById(id: string): Promise<ServiceResponse<AppUser>> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          role,
          created_at,
          updated_at
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { data: null, error: 'Usuario no encontrado' };
        }
        console.error('Error fetching user:', error);
        return { data: null, error: error.message };
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

  // Actualizar usuario
  async update(id: string, updates: UserUpdate): Promise<ServiceResponse<AppUser>> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating user:', error);
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

  // Activar/Desactivar usuario (simulado por ahora)
  async toggleStatus(id: string): Promise<ServiceResponse<AppUser>> {
    try {
      // TODO: Implementar cuando tengamos campo status en la tabla
      // Por ahora solo actualizamos la fecha de actualización
      const { data, error } = await supabase
        .from('profiles')
        .update({ 
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error toggling user status:', error);
        return { data: null, error: error.message };
      }

      return { data, error: null };
    } catch (err) {
      console.error('Error in toggleStatus:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Cambiar rol de usuario
  async changeRole(id: string, newRole: string): Promise<ServiceResponse<AppUser>> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ 
          role: newRole,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error changing user role:', error);
        return { data: null, error: error.message };
      }

      return { data, error: null };
    } catch (err) {
      console.error('Error in changeRole:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Actualizar permisos de usuario
  async updatePermissions(id: string, permissions: string[]): Promise<ServiceResponse<AppUser>> {
    try {
      // TODO: Implementar cuando tengamos campo permissions en la tabla
      // Por ahora simulamos el éxito
      const { data, error } = await supabase
        .from('profiles')
        .update({ 
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating user permissions:', error);
        return { data: null, error: error.message };
      }

      // Simular que los permisos se guardaron
      const updatedUser = { ...data, permissions };
      return { data: updatedUser as AppUser, error: null };
    } catch (err) {
      console.error('Error in updatePermissions:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Eliminar usuario (soft delete)
  async delete(id: string): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          status: 'inactive',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        console.error('Error deleting user:', error);
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

  // Obtener estadísticas de usuarios
  async getStats(): Promise<ServiceResponse<UserStats>> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role');

      if (error) {
        console.error('Error fetching user stats:', error);
        return { data: null, error: error.message };
      }

      const stats: UserStats = {
        total: data.length,
        // TODO: Implementar cuando tengamos campo status
        active: data.length, // Por ahora asumimos que todos están activos
        inactive: 0,
        pending: 0,
        admins: data.filter(u => u.role === 'admin').length,
        editors: data.filter(u => u.role === 'editor').length,
        moderators: data.filter(u => u.role === 'moderator').length,
        viewers: data.filter(u => u.role === 'viewer').length,
      };

      return { data: stats, error: null };
    } catch (err) {
      console.error('Error in getStats:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Invitar nuevo usuario (crear invitación)
  async inviteUser(email: string, role: string): Promise<ServiceResponse<boolean>> {
    try {
      // Esta función requeriría lógica adicional para enviar invitaciones
      // Por ahora, creamos un perfil con status 'pending'
      const { error } = await supabase
        .from('profiles')
        .insert({
          email,
          role,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          permissions: this.getDefaultPermissions(role)
        });

      if (error) {
        console.error('Error inviting user:', error);
        return { data: false, error: error.message };
      }

      return { data: true, error: null };
    } catch (err) {
      console.error('Error in inviteUser:', err);
      return { 
        data: false, 
        error: err instanceof Error ? err.message : 'Error desconocido' 
      };
    }
  }

  // Obtener permisos por defecto según rol
  getDefaultPermissions(role: string): string[] {
    switch (role) {
      case 'admin':
        return ['read', 'write', 'delete', 'manage_users', 'analytics', 'admin_panel'];
      case 'editor':
        return ['read', 'write', 'publish_content'];
      case 'moderator':
        return ['read', 'moderate_content', 'manage_comments'];
      case 'user':
        return ['read', 'write']; // Los usuarios normales pueden leer y escribir
      case 'viewer':
      default:
        return ['read'];
    }
  }
}

export const usersService = new UsersService();
export default usersService;