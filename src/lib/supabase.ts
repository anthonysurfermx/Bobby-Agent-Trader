// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

// Cliente tipado con tu esquema de base de datos
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Helper functions
export const handleSupabaseError = (error: any): string => {
  console.error('Supabase error:', error);
  
  // Mensajes de error más amigables en español
  if (error?.code === 'PGRST116') {
    return 'No se encontró el registro solicitado';
  }
  if (error?.code === '23505') {
    return 'Ya existe un registro con estos datos';
  }
  if (error?.code === '23503') {
    return 'No se puede eliminar porque hay registros relacionados';
  }
  if (error?.code === '42501') {
    return 'No tienes permisos para realizar esta acción';
  }
  
  return error?.message || 'Ocurrió un error inesperado';
};

// Query wrapper con tipos genéricos mejorados
export const queryWrapper = async <T>(
  query: () => Promise<any>
): Promise<{ data: T | null; error: string | null }> => {
  try {
    const result = await query();
    if (result.error) throw result.error;
    return { data: result.data, error: null };
  } catch (error: any) {
    return { data: null, error: handleSupabaseError(error) };
  }
};

// Helper para ejecutar funciones RPC con manejo de errores
export const rpcWrapper = async <T = any>(
  functionName: string,
  args?: Record<string, any>
): Promise<{ data: T | null; error: string | null }> => {
  return queryWrapper(() => supabase.rpc(functionName, args));
};

// Service response type mejorado
export interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
  metadata?: {
    total?: number | null;
    page?: number;
    limit?: number;
    hasMore?: boolean;
  };
}

// Helper para respuestas paginadas
export interface PaginatedServiceResponse<T> extends ServiceResponse<T[]> {
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// Helper para construir respuestas paginadas
export const buildPaginatedResponse = <T>(
  data: T[],
  count: number | null,
  page: number = 1,
  limit: number = 10
): PaginatedServiceResponse<T> => {
  const total = count || 0;
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    error: null,
    metadata: {
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages
    }
  };
};

// Helper para verificar si el error es un error específico de PostgreSQL
export const isPostgresError = (error: any, code: string): boolean => {
  return error?.code === code;
};

// Helper para verificar si es un error de red
export const isNetworkError = (error: any): boolean => {
  return error?.message?.includes('Failed to fetch') || 
         error?.message?.includes('NetworkError') ||
         error?.message?.includes('CORS') ||
         error?.message?.includes('ERR_NETWORK');
};

// Helper para verificar si es un error de autenticación
export const isAuthError = (error: any): boolean => {
  return error?.message?.includes('Invalid login') ||
         error?.message?.includes('not authenticated') ||
         error?.message?.includes('refresh_token') ||
         error?.message?.includes('JWT') ||
         error?.status === 401 ||
         error?.code === 'PGRST301';
};

// Helper para verificar si es un error de validación
export const isValidationError = (error: any): boolean => {
  return error?.code === '23514' || // check constraint violation
         error?.code === '22P02' || // invalid text representation
         error?.code === '22003';   // numeric value out of range
};

// Helper para reintentar operaciones con backoff exponencial
export const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> => {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // No reintentar si es un error de autenticación o validación
      if (isAuthError(error) || isValidationError(error)) {
        throw error;
      }
      
      // Solo reintentar si es un error de red o timeout
      if (isNetworkError(error)) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
};

// Helper para batch operations
export const batchOperation = async <T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  batchSize: number = 10
): Promise<{ successful: R[]; failed: Array<{ item: T; error: any }> }> => {
  const successful: R[] = [];
  const failed: Array<{ item: T; error: any }> = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const promises = batch.map(async (item) => {
      try {
        const result = await operation(item);
        return { success: true, result, item };
      } catch (error) {
        return { success: false, error, item };
      }
    });
    
    const results = await Promise.all(promises);
    
    results.forEach((result) => {
      if (result.success) {
        successful.push(result.result);
      } else {
        failed.push({ item: result.item, error: result.error });
      }
    });
  }
  
  return { successful, failed };
};

// Helper para transacciones (usando RPC functions)
export const transaction = async <T>(
  operations: Array<() => Promise<any>>
): Promise<{ data: T | null; error: string | null }> => {
  // Nota: Supabase no soporta transacciones del lado del cliente
  // Esta función ejecuta operaciones secuencialmente y puede revertir manualmente si es necesario
  const completed: any[] = [];
  
  try {
    for (const operation of operations) {
      const result = await operation();
      if (result.error) {
        throw result.error;
      }
      completed.push(result);
    }
    
    return { 
      data: completed as T, 
      error: null 
    };
  } catch (error) {
    // Aquí podrías implementar lógica de rollback si es necesario
    console.error('Transaction failed:', error);
    return { 
      data: null, 
      error: handleSupabaseError(error) 
    };
  }
};

// Export types
export type { Database } from '@/types/database.types';