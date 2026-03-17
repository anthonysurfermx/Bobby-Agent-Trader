// src/services/fintech.service.ts
import { supabase } from '../lib/supabase';

export type RiskLevel = 'Bajo' | 'Medio' | 'Alto';
export type FintechCurrency = 'MXN' | 'USD';
export type FintechStatus = 'active' | 'inactive';

export interface FintechFund {
  id: string;
  name: string;
  platform: string;
  apy: number;
  currency: FintechCurrency;
  risk_level: RiskLevel;
  fund_type: string;
  investment_horizon: string;
  tvl?: string;
  description?: string;
  minimum_investment?: number;
  fee_percentage?: number;
  liquidity?: string;
  regulator?: string;
  website_url?: string;
  status: FintechStatus;
  last_updated: string;
  created_at: string;
}

export interface FintechFundsFilters {
  platform?: string;
  currency?: FintechCurrency;
  risk_level?: RiskLevel;
  fund_type?: string;
  min_apy?: number;
  max_apy?: number;
  status?: FintechStatus;
}

class FintechService {
  private readonly SELECT_FIELDS = `
    id, name, platform, apy, currency, risk_level, fund_type, 
    investment_horizon, tvl, description, minimum_investment, 
    fee_percentage, liquidity, regulator, website_url, status, 
    last_updated, created_at
  `.replace(/\s+/g, '');

  /**
   * Obtiene todos los fondos fintech con filtros opcionales
   */
  async getFunds(filters: FintechFundsFilters = {}): Promise<{ data: FintechFund[] | null; error: any }> {
    try {
      console.log('🏦 Obteniendo fondos fintech con filtros:', filters);

      let query = supabase
        .from('fintech_funds')
        .select(this.SELECT_FIELDS)
        .eq('status', 'active'); // Solo fondos activos por defecto

      // Aplicar filtros
      if (filters.platform) {
        query = query.eq('platform', filters.platform);
      }

      if (filters.currency) {
        query = query.eq('currency', filters.currency);
      }

      if (filters.risk_level) {
        query = query.eq('risk_level', filters.risk_level);
      }

      if (filters.fund_type) {
        query = query.eq('fund_type', filters.fund_type);
      }

      if (filters.min_apy !== undefined) {
        query = query.gte('apy', filters.min_apy);
      }

      if (filters.max_apy !== undefined) {
        query = query.lte('apy', filters.max_apy);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      // Ordenar por APY descendente
      query = query.order('apy', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error obteniendo fondos fintech:', error);
        return { data: null, error };
      }

      console.log(`✅ ${data?.length || 0} fondos fintech obtenidos`);
      return { data: data as FintechFund[], error: null };
    } catch (error) {
      console.error('❌ Error en getFunds:', error);
      return { data: null, error };
    }
  }

  /**
   * Obtiene fondos por plataforma específica
   */
  async getFundsByPlatform(platform: string): Promise<{ data: FintechFund[] | null; error: any }> {
    return this.getFunds({ platform });
  }

  /**
   * Obtiene el fondo con mayor APY
   */
  async getTopAPYFund(): Promise<{ data: FintechFund | null; error: any }> {
    try {
      console.log('🔝 Obteniendo fondo con mayor APY...');

      const { data, error } = await supabase
        .from('fintech_funds')
        .select(this.SELECT_FIELDS)
        .eq('status', 'active')
        .order('apy', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Error obteniendo fondo top APY:', error);
        return { data: null, error };
      }

      console.log('✅ Fondo top APY obtenido:', data?.name);
      return { data: data as FintechFund | null, error: null };
    } catch (error) {
      console.error('❌ Error en getTopAPYFund:', error);
      return { data: null, error };
    }
  }

  /**
   * Obtiene estadísticas de fondos fintech
   */
  async getFintechStats(): Promise<{
    data: {
      totalFunds: number;
      activeFunds: number;
      platforms: number;
      averageAPY: number;
      topAPY: number;
      topAPYFund: string;
      totalTVL: string;
      currencyDistribution: Record<FintechCurrency, number>;
      riskDistribution: Record<RiskLevel, number>;
      platformDistribution: Record<string, number>;
    } | null;
    error: any;
  }> {
    try {
      console.log('📊 Obteniendo estadísticas fintech...');

      const { data, error } = await supabase
        .from('fintech_funds')
        .select('platform, apy, currency, risk_level, status, name, tvl');

      if (error) {
        console.error('❌ Error obteniendo estadísticas fintech:', error);
        return { data: null, error };
      }

      const activeFunds = data.filter(f => f.status === 'active');
      const platforms = [...new Set(data.map(f => f.platform))];
      
      const topAPYFund = activeFunds.reduce((max, fund) => 
        fund.apy > max.apy ? fund : max
      );

      const stats = {
        totalFunds: data.length,
        activeFunds: activeFunds.length,
        platforms: platforms.length,
        averageAPY: activeFunds.reduce((sum, f) => sum + (f.apy || 0), 0) / activeFunds.length || 0,
        topAPY: topAPYFund?.apy || 0,
        topAPYFund: topAPYFund?.name || '',
        totalTVL: 'N/A', // Calcular después si es necesario
        currencyDistribution: activeFunds.reduce((acc, f) => {
          acc[f.currency as FintechCurrency] = (acc[f.currency as FintechCurrency] || 0) + 1;
          return acc;
        }, {} as Record<FintechCurrency, number>),
        riskDistribution: activeFunds.reduce((acc, f) => {
          acc[f.risk_level as RiskLevel] = (acc[f.risk_level as RiskLevel] || 0) + 1;
          return acc;
        }, {} as Record<RiskLevel, number>),
        platformDistribution: activeFunds.reduce((acc, f) => {
          acc[f.platform] = (acc[f.platform] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };

      console.log('✅ Estadísticas fintech calculadas:', stats);
      return { data: stats, error: null };
    } catch (error) {
      console.error('❌ Error en getFintechStats:', error);
      return { data: null, error };
    }
  }

  /**
   * Obtiene plataformas disponibles
   */
  async getPlatforms(): Promise<{ data: string[] | null; error: any }> {
    try {
      const { data, error } = await supabase
        .from('fintech_funds')
        .select('platform')
        .eq('status', 'active');

      if (error) {
        console.error('❌ Error obteniendo plataformas:', error);
        return { data: null, error };
      }

      const platforms = [...new Set(data.map(item => item.platform))].sort();
      return { data: platforms, error: null };
    } catch (error) {
      console.error('❌ Error en getPlatforms:', error);
      return { data: null, error };
    }
  }

  /**
   * Busca fondos por texto
   */
  async searchFunds(searchTerm: string): Promise<{ data: FintechFund[] | null; error: any }> {
    try {
      console.log('🔍 Buscando fondos:', searchTerm);

      const { data, error } = await supabase
        .from('fintech_funds')
        .select(this.SELECT_FIELDS)
        .eq('status', 'active')
        .or(`name.ilike.%${searchTerm}%,platform.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
        .order('apy', { ascending: false });

      if (error) {
        console.error('❌ Error buscando fondos:', error);
        return { data: null, error };
      }

      console.log(`✅ ${data?.length || 0} fondos encontrados`);
      return { data: data as FintechFund[], error: null };
    } catch (error) {
      console.error('❌ Error en searchFunds:', error);
      return { data: null, error };
    }
  }
}

export const fintechService = new FintechService();