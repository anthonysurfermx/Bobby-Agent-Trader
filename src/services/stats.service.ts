// src/services/stats.service.ts
import { supabase } from '../lib/supabase';
import { UUID, ISODateTime } from '../types/database.types';

// Interfaces para estadísticas
export interface DashboardStats {
  totalCommunities: number;
  activeCommunities: number;
  totalMembers: number;
  totalEvents: number;
  upcomingEvents: number;
  totalStartups: number;
  featuredStartups: number;
  totalBlogPosts: number;
  publishedPosts: number;
  draftPosts: number;
}

export interface CommunityStats {
  id: UUID;
  name: string;
  memberCount: number;
  eventsCount: number;
  growth: number; // Porcentaje de crecimiento
  lastActivity: ISODateTime;
}

export interface EventStats {
  totalEvents: number;
  upcomingEvents: number;
  pastEvents: number;
  totalAttendees: number;
  averageAttendeesPerEvent: number;
  eventsByType: Record<string, number>;
  eventsByMonth: Array<{ month: string; count: number }>;
}

export interface StartupStats {
  totalStartups: number;
  featuredStartups: number;
  startupsByCategory: Record<string, number>;
  startupsByYear: Array<{ year: number; count: number }>;
  recentStartups: Array<{
    id: UUID;
    name: string;
    description: string;
    category: string;
    created_at: ISODateTime;
  }>;
}

export interface BlogStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  postsByCategory: Record<string, number>;
  postsByMonth: Array<{ month: string; count: number }>;
  topTags: Array<{ tag: string; count: number }>;
  recentPosts: Array<{
    id: UUID;
    title: string;
    excerpt: string;
    author: string;
    published_at: ISODateTime | null;
  }>;
}

export interface UserActivityStats {
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  userGrowthTrend: Array<{ date: string; count: number }>;
}

export interface RealtimeStatsSubscription {
  unsubscribe: () => void;
}

/**
 * Real-time Statistics Service
 * Handles platform analytics, growth metrics, and statistical reports
 */
class StatsService {
  private subscriptions: Map<string, any> = new Map();

  /**
   * Get comprehensive platform statistics for dashboard
   * @returns Promise resolving to dashboard statistics object
   */
  async getPlatformStats(): Promise<DashboardStats> {
    try {
      // Ejecutar todas las consultas en paralelo
      // NOTA: Campos corregidos según esquema real de BD:
      // - communities: usa is_verified (no is_active), image_url (no logo_url), links (no social_links)
      // - events: usa date para determinar upcoming (no existe is_upcoming)
      // - blog_posts: usa status='published' (no campo published boolean)
      const now = new Date().toISOString();

      const [
        communitiesResult,
        eventsResult,
        startupsResult,
        blogResult
      ] = await Promise.all([
        supabase.from('communities').select('id, is_verified, member_count'),
        supabase.from('events').select('id, date'),
        supabase.from('startups').select('id, is_featured'),
        supabase.from('blog_posts').select('id, status')
      ]);

      // Procesar resultados de comunidades (usar is_verified en lugar de is_active)
      const communities = communitiesResult.data || [];
      const activeCommunities = communities.filter(c => c.is_verified);
      const totalMembers = communities.reduce((sum, c) => sum + (c.member_count || 0), 0);

      // Procesar resultados de eventos (comparar fecha en lugar de is_upcoming)
      const events = eventsResult.data || [];
      const upcomingEvents = events.filter(e => e.date && new Date(e.date) > new Date());

      // Procesar resultados de startups
      const startups = startupsResult.data || [];
      const featuredStartups = startups.filter(s => s.is_featured);

      // Procesar resultados de blog (usar status === 'published' en lugar de boolean published)
      const blogPosts = blogResult.data || [];
      const publishedPosts = blogPosts.filter(p => p.status === 'published');

      return {
        totalCommunities: communities.length,
        activeCommunities: activeCommunities.length,
        totalMembers,
        totalEvents: events.length,
        upcomingEvents: upcomingEvents.length,
        totalStartups: startups.length,
        featuredStartups: featuredStartups.length,
        totalBlogPosts: blogPosts.length,
        publishedPosts: publishedPosts.length,
        draftPosts: blogPosts.length - publishedPosts.length,
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw new Error(`Error fetching dashboard stats: ${(error as Error).message}`);
    }
  }

  /**
   * Obtener estadísticas de comunidades
   */
  async getCommunityStats(): Promise<CommunityStats[]> {
    try {
      // NOTA: La BD usa is_verified, no is_active
      const { data: communities, error } = await supabase
        .from('communities')
        .select(`
          id,
          name,
          member_count,
          created_at,
          updated_at
        `)
        .eq('is_verified', true)
        .order('member_count', { ascending: false, nullsLast: true });

      if (error) throw error;

      // Obtener conteo de eventos por comunidad (si tienes relación)
      const { data: eventCounts } = await supabase
        .from('events')
        .select('id');

      return (communities || []).map(community => ({
        id: community.id,
        name: community.name,
        memberCount: community.member_count || 0,
        eventsCount: 0, // Aquí podrías calcular eventos por comunidad si tienes la relación
        growth: 0, // Calcular crecimiento basado en datos históricos
        lastActivity: community.updated_at,
      }));
    } catch (error) {
      console.error('Error fetching community stats:', error);
      throw new Error(`Error fetching community stats: ${(error as Error).message}`);
    }
  }

  /**
   * Obtener estadísticas de eventos
   */
  async getEventStats(): Promise<EventStats> {
    try {
      // NOTA: La BD no tiene is_upcoming ni type, usamos date para determinar upcoming
      // y status para agrupar (no existe campo type/event_type)
      const { data: events, error } = await supabase
        .from('events')
        .select('id, status, max_attendees, date, created_at');

      if (error) throw error;

      // Determinar upcoming/past comparando fecha actual
      const now = new Date();
      const upcomingEvents = events?.filter(e => e.date && new Date(e.date) > now) || [];
      const pastEvents = events?.filter(e => e.date && new Date(e.date) <= now) || [];

      // Calcular estadísticas por status (no hay campo type en la BD)
      const eventsByType = events?.reduce((acc, event) => {
        const eventStatus = event.status || 'Sin estado';
        acc[eventStatus] = (acc[eventStatus] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      // Calcular eventos por mes
      const eventsByMonth = this.groupByMonth(events || [], 'created_at');

      const totalAttendees = events?.reduce((sum, event) => 
        sum + (event.max_attendees || 0), 0) || 0;

      return {
        totalEvents: events?.length || 0,
        upcomingEvents: upcomingEvents.length,
        pastEvents: pastEvents.length,
        totalAttendees,
        averageAttendeesPerEvent: events?.length ? Math.round(totalAttendees / events.length) : 0,
        eventsByType,
        eventsByMonth,
      };
    } catch (error) {
      console.error('Error fetching event stats:', error);
      throw new Error(`Error fetching event stats: ${(error as Error).message}`);
    }
  }

  /**
   * Obtener estadísticas de startups
   */
  async getStartupStats(): Promise<StartupStats> {
    try {
      const { data: startups, error } = await supabase
        .from('startups')
        .select('id, name, description, category, is_featured, founded_year, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const featuredStartups = startups?.filter(s => s.is_featured) || [];

      // Agrupar por categoría
      const startupsByCategory = startups?.reduce((acc, startup) => {
        const category = startup.category || 'Sin categoría';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      // Agrupar por año de fundación
      const startupsByYear = startups?.reduce((acc, startup) => {
        if (startup.founded_year) {
          const existing = acc.find(item => item.year === startup.founded_year);
          if (existing) {
            existing.count++;
          } else {
            acc.push({ year: startup.founded_year, count: 1 });
          }
        }
        return acc;
      }, [] as Array<{ year: number; count: number }>) || [];

      startupsByYear.sort((a, b) => b.year - a.year);

      const recentStartups = (startups || []).slice(0, 5).map(startup => ({
        id: startup.id,
        name: startup.name,
        description: startup.description,
        category: startup.category || 'Sin categoría',
        created_at: startup.created_at,
      }));

      return {
        totalStartups: startups?.length || 0,
        featuredStartups: featuredStartups.length,
        startupsByCategory,
        startupsByYear,
        recentStartups,
      };
    } catch (error) {
      console.error('Error fetching startup stats:', error);
      throw new Error(`Error fetching startup stats: ${(error as Error).message}`);
    }
  }

  /**
   * Obtener estadísticas del blog
   */
  async getBlogStats(): Promise<BlogStats> {
    try {
      // NOTA: La BD usa status='published'/'draft', no campo boolean published
      const { data: posts, error } = await supabase
        .from('blog_posts')
        .select('id, title, excerpt, author, category, tags, status, published_at, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const publishedPosts = posts?.filter(p => p.status === 'published') || [];
      const draftPosts = posts?.filter(p => p.status !== 'published') || [];

      // Agrupar por categoría
      const postsByCategory = posts?.reduce((acc, post) => {
        const category = post.category || 'Sin categoría';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      // Agrupar por mes
      const postsByMonth = this.groupByMonth(publishedPosts, 'published_at');

      // Obtener top tags
      const allTags = posts?.flatMap(post => post.tags || []) || [];
      const tagCounts = allTags.reduce((acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topTags = Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const recentPosts = publishedPosts.slice(0, 5).map(post => ({
        id: post.id,
        title: post.title,
        excerpt: post.excerpt,
        author: post.author,
        published_at: post.published_at,
      }));

      return {
        totalPosts: posts?.length || 0,
        publishedPosts: publishedPosts.length,
        draftPosts: draftPosts.length,
        postsByCategory,
        postsByMonth,
        topTags,
        recentPosts,
      };
    } catch (error) {
      console.error('Error fetching blog stats:', error);
      throw new Error(`Error fetching blog stats: ${(error as Error).message}`);
    }
  }

  /**
   * Suscribirse a cambios en tiempo real de estadísticas del dashboard
   */
  subscribeToDashboardStats(callback: (stats: Partial<DashboardStats>) => void): RealtimeStatsSubscription {
    const subscriptionId = 'dashboard_stats';
    
    // Suscripciones a múltiples tablas
    const communityChannel = supabase
      .channel('communities_stats')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'communities' }, 
        () => this.handleStatsUpdate(callback)
      )
      .subscribe();

    const eventsChannel = supabase
      .channel('events_stats')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => this.handleStatsUpdate(callback)
      )
      .subscribe();

    const startupsChannel = supabase
      .channel('startups_stats')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'startups' },
        () => this.handleStatsUpdate(callback)
      )
      .subscribe();

    const blogChannel = supabase
      .channel('blog_stats')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'blog_posts' },
        () => this.handleStatsUpdate(callback)
      )
      .subscribe();

    this.subscriptions.set(subscriptionId, {
      communityChannel,
      eventsChannel,
      startupsChannel,
      blogChannel,
    });

    return {
      unsubscribe: () => {
        const subs = this.subscriptions.get(subscriptionId);
        if (subs) {
          subs.communityChannel.unsubscribe();
          subs.eventsChannel.unsubscribe();
          subs.startupsChannel.unsubscribe();
          subs.blogChannel.unsubscribe();
          this.subscriptions.delete(subscriptionId);
        }
      }
    };
  }

  /**
   * Suscribirse a cambios de una tabla específica
   */
  subscribeToTableChanges(
    table: string, 
    callback: () => void
  ): RealtimeStatsSubscription {
    const subscriptionId = `${table}_changes`;
    
    const channel = supabase
      .channel(subscriptionId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table },
        callback
      )
      .subscribe();

    this.subscriptions.set(subscriptionId, channel);

    return {
      unsubscribe: () => {
        const channel = this.subscriptions.get(subscriptionId);
        if (channel) {
          channel.unsubscribe();
          this.subscriptions.delete(subscriptionId);
        }
      }
    };
  }

  /**
   * Obtener estadísticas de crecimiento (histórico)
   */
  async getGrowthStats(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    try {
      const [communitiesGrowth, eventsGrowth, startupsGrowth, blogGrowth] = await Promise.all([
        this.getTableGrowth('communities', 'created_at', startDate),
        this.getTableGrowth('events', 'created_at', startDate),
        this.getTableGrowth('startups', 'created_at', startDate),
        this.getTableGrowth('blog_posts', 'created_at', startDate),
      ]);

      return {
        communities: communitiesGrowth,
        events: eventsGrowth,
        startups: startupsGrowth,
        blogPosts: blogGrowth,
      };
    } catch (error) {
      console.error('Error fetching growth stats:', error);
      throw new Error(`Error fetching growth stats: ${(error as Error).message}`);
    }
  }

  /**
   * Clear all active subscriptions
   * @returns void
   */
  unsubscribeAll(): void {
    this.subscriptions.forEach((subscription, id) => {
      if (Array.isArray(subscription)) {
        subscription.forEach(sub => sub?.unsubscribe?.());
      } else if (subscription?.unsubscribe) {
        subscription.unsubscribe();
      } else if (subscription?.communityChannel) {
        // Múltiples canales
        subscription.communityChannel.unsubscribe();
        subscription.eventsChannel.unsubscribe();
        subscription.startupsChannel.unsubscribe();
        subscription.blogChannel.unsubscribe();
      }
    });
    this.subscriptions.clear();
  }

  // ====================================
  // ADDITIONAL REQUESTED METHODS
  // ====================================

  /**
   * Update platform statistics in database (for caching purposes)
   * @param stats - Statistics to store/update
   * @returns Promise resolving to success boolean
   */
  async updateStats(stats?: Partial<DashboardStats>): Promise<boolean> {
    try {
      const statsToUpdate = stats || await this.getPlatformStats();
      
      const payload = {
        total_communities: statsToUpdate.totalCommunities,
        active_communities: statsToUpdate.activeCommunities,
        total_members: statsToUpdate.totalMembers,
        total_events: statsToUpdate.totalEvents,
        upcoming_events: statsToUpdate.upcomingEvents,
        total_startups: statsToUpdate.totalStartups,
        featured_startups: statsToUpdate.featuredStartups,
        total_blog_posts: statsToUpdate.totalBlogPosts,
        published_posts: statsToUpdate.publishedPosts,
        draft_posts: statsToUpdate.draftPosts,
        updated_at: new Date().toISOString(),
      };

      // Upsert platform stats
      const { error } = await supabase
        .from('platform_stats')
        .upsert(payload, { 
          onConflict: 'id',
          defaultToNull: false 
        });

      if (error) {
        console.error('Error updating platform stats:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in updateStats:', error);
      return false;
    }
  }

  /**
   * Get growth metrics for specified time period
   * @param period - Time period in days (default: 30)
   * @returns Promise resolving to growth metrics object
   */
  async getGrowthMetrics(period = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - period);

      // Get growth data for all entities
      const growthData = await this.getGrowthStats(period);

      // Calculate growth percentages
      const previousPeriodStart = new Date(startDate);
      previousPeriodStart.setDate(previousPeriodStart.getDate() - period);

      const [currentStats, previousStats] = await Promise.all([
        this.getStatsForDateRange(startDate, endDate),
        this.getStatsForDateRange(previousPeriodStart, startDate),
      ]);

      return {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        communities: {
          current: currentStats.communities,
          previous: previousStats.communities,
          growth: this.calculateGrowthPercentage(previousStats.communities, currentStats.communities),
          trend: growthData.communities,
        },
        events: {
          current: currentStats.events,
          previous: previousStats.events,
          growth: this.calculateGrowthPercentage(previousStats.events, currentStats.events),
          trend: growthData.events,
        },
        startups: {
          current: currentStats.startups,
          previous: previousStats.startups,
          growth: this.calculateGrowthPercentage(previousStats.startups, currentStats.startups),
          trend: growthData.startups,
        },
        blogPosts: {
          current: currentStats.blogPosts,
          previous: previousStats.blogPosts,
          growth: this.calculateGrowthPercentage(previousStats.blogPosts, currentStats.blogPosts),
          trend: growthData.blogPosts,
        },
        totalGrowth: this.calculateOverallGrowth({
          communities: this.calculateGrowthPercentage(previousStats.communities, currentStats.communities),
          events: this.calculateGrowthPercentage(previousStats.events, currentStats.events),
          startups: this.calculateGrowthPercentage(previousStats.startups, currentStats.startups),
          blogPosts: this.calculateGrowthPercentage(previousStats.blogPosts, currentStats.blogPosts),
        }),
      };
    } catch (error) {
      console.error('Error getting growth metrics:', error);
      throw new Error(`Error getting growth metrics: ${(error as Error).message}`);
    }
  }

  /**
   * Export comprehensive statistical report
   * @param format - Export format ('json' | 'csv')
   * @param includeDetails - Include detailed breakdown
   * @returns Promise resolving to formatted report data
   */
  async exportReport(format: 'json' | 'csv' = 'json', includeDetails = true) {
    try {
      const [
        platformStats,
        communityStats,
        eventStats,
        startupStats,
        blogStats,
        growthMetrics
      ] = await Promise.all([
        this.getPlatformStats(),
        includeDetails ? this.getCommunityStats() : Promise.resolve([]),
        includeDetails ? this.getEventStats() : Promise.resolve(null),
        includeDetails ? this.getStartupStats() : Promise.resolve(null),
        includeDetails ? this.getBlogStats() : Promise.resolve(null),
        this.getGrowthMetrics(30),
      ]);

      const reportData = {
        generatedAt: new Date().toISOString(),
        platform: platformStats,
        growth: growthMetrics,
        ...(includeDetails && {
          communities: {
            summary: communityStats,
            total: communityStats.length,
          },
          events: eventStats,
          startups: startupStats,
          blog: blogStats,
        }),
      };

      if (format === 'csv') {
        return this.convertToCSV(reportData);
      }

      return reportData;
    } catch (error) {
      console.error('Error exporting report:', error);
      throw new Error(`Error exporting report: ${(error as Error).message}`);
    }
  }

  // ====================================
  // ALIASES FOR BACKWARD COMPATIBILITY
  // ====================================

  /**
   * Alias for getPlatformStats() - backward compatibility
   */
  async getDashboardStats(): Promise<DashboardStats> {
    return this.getPlatformStats();
  }

  // Private utility methods

  private async handleStatsUpdate(callback: (stats: Partial<DashboardStats>) => void) {
    // Throttle para evitar demasiadas actualizaciones
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    this.updateTimeout = setTimeout(async () => {
      try {
        const stats = await this.getDashboardStats();
        callback(stats);
      } catch (error) {
        console.error('Error updating stats:', error);
      }
    }, 1000);
  }

  private updateTimeout: NodeJS.Timeout | null = null;

  private groupByMonth(items: any[], dateField: string) {
    const monthGroups = items.reduce((acc, item) => {
      if (!item[dateField]) return acc;
      
      const date = new Date(item[dateField]);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      
      acc[monthKey] = (acc[monthKey] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(monthGroups)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  private async getTableGrowth(table: string, dateField: string, startDate: Date) {
    const { data, error } = await supabase
      .from(table)
      .select(`${dateField}`)
      .gte(dateField, startDate.toISOString())
      .order(dateField, { ascending: true });

    if (error) throw error;

    // Agrupar por día
    const dailyGrowth = (data || []).reduce((acc, item) => {
      const date = new Date(item[dateField]).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(dailyGrowth)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private async getStatsForDateRange(startDate: Date, endDate: Date) {
    const [communities, events, startups, blogPosts] = await Promise.all([
      supabase.from('communities')
        .select('id')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString()),
      supabase.from('events')
        .select('id')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString()),
      supabase.from('startups')
        .select('id')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString()),
      supabase.from('blog_posts')
        .select('id')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString()),
    ]);

    return {
      communities: communities.data?.length || 0,
      events: events.data?.length || 0,
      startups: startups.data?.length || 0,
      blogPosts: blogPosts.data?.length || 0,
    };
  }

  private calculateGrowthPercentage(previous: number, current: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  private calculateOverallGrowth(growthRates: Record<string, number>): number {
    const rates = Object.values(growthRates);
    return Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length);
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion - can be enhanced based on needs
    const flatData = this.flattenObject(data);
    const headers = Object.keys(flatData);
    const values = Object.values(flatData);
    
    return [
      headers.join(','),
      values.join(',')
    ].join('\n');
  }

  private flattenObject(obj: any, prefix = ''): Record<string, any> {
    const flattened: Record<string, any> = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}_${key}` : key;
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          Object.assign(flattened, this.flattenObject(value, newKey));
        } else {
          flattened[newKey] = value;
        }
      }
    }
    
    return flattened;
  }
}

// Exportar instancia del servicio
export const statsService = new StatsService();