import { supabase, rpcWrapper, handleSupabaseError } from '../lib/supabase';
import type { ServiceResponse, PlatformStatsWithDetails } from '../types';

export const platformService = {
  // Obtener estadísticas de la plataforma
  async getStats(): Promise<ServiceResponse<PlatformStatsWithDetails>> {
    return rpcWrapper('get_platform_stats_with_details');
  },

  // Actualizar estadísticas
  async updateStats(): Promise<ServiceResponse<boolean>> {
    const result = await rpcWrapper('update_platform_stats');
    return { 
      data: result.error === null, 
      error: result.error 
    };
  },

  // Registrar evento en logs
  async logEvent(
    eventType: string, 
    eventData: any, 
    level: string = 'info',
    message?: string
  ): Promise<ServiceResponse<boolean>> {
    try {
      const result = await rpcWrapper('log_event', {
        p_event_type: eventType,
        p_event_data: eventData,
        p_level: level,
        p_message: message
      });
      
      return { 
        data: result.error === null, 
        error: result.error 
      };
    } catch (error) {
      console.error('Error logging event:', error);
      return { data: false, error: handleSupabaseError(error) };
    }
  }
};
