import { supabase } from '@/lib/supabase';

export class AdminService {
  // Cache del usuario actual para evitar múltiples llamadas a getUser()
  private cachedUserId: string | null = null;
  private userIdCacheTime: number = 0;
  private readonly USER_CACHE_TTL = 60000; // 1 minuto

  private async getCurrentUserId(): Promise<string | undefined> {
    const now = Date.now();
    if (this.cachedUserId && (now - this.userIdCacheTime) < this.USER_CACHE_TTL) {
      return this.cachedUserId;
    }
    const { data: { user } } = await supabase.auth.getUser();
    this.cachedUserId = user?.id || null;
    this.userIdCacheTime = now;
    return user?.id;
  }

  // Estadísticas del dashboard - OPTIMIZADO: usa head: true para solo contar
  async getDashboardStats() {
    const today = new Date().toISOString().split('T')[0];
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Usar head: true para solo obtener el count sin transferir datos
    const [users, startups, events, posts, weeklyUsers] = await Promise.all([
      // @ts-expect-error - profiles table uses auth schema
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('startups').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('events').select('*', { count: 'exact', head: true }).gte('date', today),
      supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'published'),
      // @ts-expect-error - profiles table uses auth schema
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', lastWeek)
    ]);

    return {
      totalUsers: users.count || 0,
      totalStartups: startups.count || 0,
      upcomingEvents: events.count || 0,
      publishedPosts: posts.count || 0,
      weeklyNewUsers: weeklyUsers.count || 0,
      growthRate: this.calculateGrowthRate(users.count || 0, weeklyUsers.count || 0)
    };
  }

  // Gestión de Startups
  async getStartups(status?: string) {
    let query = supabase.from('startups').select('*').order('created_at', { ascending: false });
    
    if (status) {
      query = query.eq('status', status);
    }

    return await query;
  }

  async approveStartup(id: string) {
    const userId = await this.getCurrentUserId();
    return await supabase
      .from('startups')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: userId
      })
      .eq('id', id);
  }

  async rejectStartup(id: string, reason: string) {
    return await supabase
      .from('startups')
      .update({ 
        status: 'rejected',
        rejection_reason: reason
      })
      .eq('id', id);
  }

  // Gestión de Eventos
  async getEvents(filter?: { status?: string; upcoming?: boolean }) {
    let query = supabase.from('events').select('*');
    
    if (filter?.status) {
      query = query.eq('status', filter.status);
    }
    
    if (filter?.upcoming) {
      query = query.gte('date', new Date().toISOString().split('T')[0]);
    }

    return await query.order('date', { ascending: true });
  }

  async createEvent(event: any) {
    const userId = await this.getCurrentUserId();
    return await supabase.from('events').insert({
      ...event,
      created_by: userId
    });
  }

  // Analytics
  async trackEvent(eventType: string, entityType: string, entityId: string, metadata?: any) {
    const userId = await this.getCurrentUserId();
    // @ts-expect-error - analytics table not in generated types
    return await supabase.from('analytics').insert({
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
      user_id: userId
    });
  }

  async getAnalytics(dateRange: { from: string; to: string }) {
    return await supabase
      // @ts-expect-error - analytics table not in generated types
      .from('analytics')
      .select('*')
      .gte('created_at', dateRange.from)
      .lte('created_at', dateRange.to);
  }

  // Helpers
  private calculateGrowthRate(total: number, weekly: number): number {
    if (total === 0) return 0;
    return Math.round((weekly / (total - weekly)) * 100 * 100) / 100;
  }
}

export const adminService = new AdminService();
