
// =====================================================
// 6. src/services/newsletter.service.ts
// =====================================================
import { supabase, handleSupabaseError, queryWrapper, isPostgresError } from '../lib/supabase';
import type { 
  NewsletterSubscriber, 
  NewsletterSubscriberInsert,
  ServiceResponse 
} from '../types';
import { platformService } from './platform.service';

export const newsletterService = {
  // Suscribir al newsletter
  async subscribe(subscriber: NewsletterSubscriberInsert): Promise<ServiceResponse<NewsletterSubscriber>> {
    try {
      const result = await queryWrapper(() =>
        supabase
          .from('newsletter_subscribers')
          .insert(subscriber)
          .select()
          .single()
      );
      
      if (result.data) {
        // Actualizar estadísticas
        await platformService.updateStats();
        
        // Log suscripción
        await platformService.logEvent(
          'newsletter_subscribed',
          { email: subscriber.email, interests: subscriber.interests },
          'info'
        );
      }
      
      return result;
    } catch (error: any) {
      // Manejar caso de email duplicado
      if (isPostgresError(error, '23505')) {
        return { 
          data: null, 
          error: 'Este email ya está suscrito al newsletter' 
        };
      }
      return { data: null, error: handleSupabaseError(error) };
    }
  },

  // Desuscribir
  async unsubscribe(email: string): Promise<ServiceResponse<boolean>> {
    try {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .update({ 
          status: 'unsubscribed',
          unsubscribed_at: new Date().toISOString()
        })
        .eq('email', email);
      
      if (error) throw error;
      
      // Log desuscripción
      await platformService.logEvent(
        'newsletter_unsubscribed',
        { email },
        'info'
      );
      
      return { data: true, error: null };
    } catch (error) {
      return { data: false, error: handleSupabaseError(error) };
    }
  },

  // Obtener suscriptores activos
  async getActiveSubscribers(): Promise<ServiceResponse<NewsletterSubscriber[]>> {
    return queryWrapper(() =>
      supabase
        .from('newsletter_subscribers')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
    );
  },

  // Verificar si un email está suscrito
  async checkSubscription(email: string): Promise<ServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .select('status')
        .eq('email', email)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          // No encontrado
          return { data: false, error: null };
        }
        throw error;
      }
      
      return { data: data?.status === 'active', error: null };
    } catch (error) {
      return { data: false, error: handleSupabaseError(error) };
    }
  }
};
