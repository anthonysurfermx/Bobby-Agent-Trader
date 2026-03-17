// src/services/vaults.service.ts
// Servicio para integrar con API de Vaults.fyi para datos DeFi dinámicos

export interface VaultData {
  id: string;
  name: string;
  protocol: string;
  network: string;
  asset: string;
  apy: number;
  tvl: number;
  risk_score?: number;
  category: 'lending' | 'yield_farming' | 'liquidity_pool' | 'staking' | 'strategy';
  vault_address: string;
  last_updated: string;
}

export interface VaultsAPIResponse {
  success: boolean;
  data: VaultData[];
  total: number;
  page: number;
  limit: number;
}

export interface VaultsFilters {
  network?: string;
  asset?: string;
  protocol?: string;
  min_apy?: number;
  max_apy?: number;
  min_tvl?: number;
  category?: VaultData['category'];
}

class VaultsService {
  private readonly BASE_URL = 'https://api.vaults.fyi';
  private readonly API_VERSION = 'v2';
  
  // Configuración de cache para evitar demasiadas llamadas
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

  /**
   * Método genérico para hacer peticiones a la API
   */
  private async fetchFromAPI(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const cacheKey = `${endpoint}_${JSON.stringify(params)}`;
    
    // Verificar cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      console.log('📦 Usando datos de cache para:', endpoint);
      return cached.data;
    }

    try {
      const url = new URL(`${this.BASE_URL}/${this.API_VERSION}${endpoint}`);
      
      // Agregar parámetros de consulta
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value.toString());
        }
      });

      console.log('🌐 Fetching from Vaults.fyi:', url.toString());

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          // Agregar API key si está disponible
          ...(process.env.VITE_VAULTS_API_KEY && {
            'Authorization': `Bearer ${process.env.VITE_VAULTS_API_KEY}`
          })
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Guardar en cache
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      
      return data;
    } catch (error) {
      console.error('❌ Error en API de Vaults.fyi:', error);
      throw error;
    }
  }

  /**
   * Obtiene lista de vaults con filtros
   */
  async getVaults(filters: VaultsFilters = {}): Promise<{ data: VaultData[]; error: any }> {
    try {
      console.log('🔍 Obteniendo vaults con filtros:', filters);

      const params: Record<string, any> = {
        limit: 50, // Limite por defecto
        ...filters
      };

      const response = await this.fetchFromAPI('/vaults', params);
      
      // Transformar datos al formato esperado
      const transformedData = this.transformVaultsData(response);
      
      console.log(`✅ ${transformedData.length} vaults obtenidos`);
      return { data: transformedData, error: null };
    } catch (error) {
      console.error('❌ Error obteniendo vaults:', error);
      // Devolver datos mock en caso de error para desarrollo
      return { data: this.getMockVaultsData(), error };
    }
  }

  /**
   * Transforma datos de la API al formato interno
   */
  private transformVaultsData(apiResponse: any): VaultData[] {
    if (!apiResponse || !apiResponse.data) {
      return [];
    }

    return apiResponse.data.map((vault: any) => ({
      id: vault.id || vault.address || `${vault.protocol}-${vault.asset}`,
      name: vault.name || `${vault.protocol} ${vault.asset}`,
      protocol: vault.protocol || 'Unknown',
      network: vault.network || vault.chain || 'ethereum',
      asset: vault.asset || vault.underlying_asset || 'ETH',
      apy: this.parseAPY(vault.apy || vault.yield || vault.apr),
      tvl: this.parseTVL(vault.tvl || vault.total_value_locked),
      risk_score: vault.risk_score,
      category: this.categorizeVault(vault),
      vault_address: vault.address || vault.vault_address || '',
      last_updated: vault.last_updated || new Date().toISOString()
    }));
  }

  /**
   * Parsea APY de diferentes formatos
   */
  private parseAPY(apy: any): number {
    if (typeof apy === 'number') return apy;
    if (typeof apy === 'string') {
      const parsed = parseFloat(apy.replace('%', ''));
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * Parsea TVL de diferentes formatos
   */
  private parseTVL(tvl: any): number {
    if (typeof tvl === 'number') return tvl;
    if (typeof tvl === 'string') {
      // Manejar formatos como "1.5M", "100K", etc.
      const match = tvl.match(/^([\d.]+)([KMB]?)$/i);
      if (match) {
        const num = parseFloat(match[1]);
        const suffix = match[2].toUpperCase();
        switch (suffix) {
          case 'K': return num * 1000;
          case 'M': return num * 1000000;
          case 'B': return num * 1000000000;
          default: return num;
        }
      }
    }
    return 0;
  }

  /**
   * Categoriza un vault basado en sus características
   */
  private categorizeVault(vault: any): VaultData['category'] {
    const protocol = (vault.protocol || '').toLowerCase();
    const name = (vault.name || '').toLowerCase();
    
    if (protocol.includes('aave') || protocol.includes('compound')) return 'lending';
    if (protocol.includes('uniswap') || protocol.includes('sushiswap')) return 'liquidity_pool';
    if (name.includes('staking')) return 'staking';
    if (protocol.includes('yearn') || protocol.includes('harvest')) return 'strategy';
    
    return 'yield_farming';
  }

  /**
   * Obtiene los mejores vaults por APY
   */
  async getTopYieldVaults(limit: number = 10): Promise<{ data: VaultData[]; error: any }> {
    const { data, error } = await this.getVaults({ min_apy: 5 });
    
    if (error) return { data: [], error };
    
    const sortedData = data
      .sort((a, b) => b.apy - a.apy)
      .slice(0, limit);
      
    return { data: sortedData, error: null };
  }

  /**
   * Obtiene vaults por protocolo específico
   */
  async getVaultsByProtocol(protocol: string): Promise<{ data: VaultData[]; error: any }> {
    return this.getVaults({ protocol });
  }

  /**
   * Obtiene estadísticas de vaults
   */
  async getVaultsStats(): Promise<{
    data: {
      totalVaults: number;
      averageAPY: number;
      totalTVL: number;
      topProtocols: Array<{ name: string; count: number; avgApy: number }>;
      networkDistribution: Record<string, number>;
    } | null;
    error: any;
  }> {
    try {
      const { data: vaults, error } = await this.getVaults();
      
      if (error || !vaults.length) {
        return { data: null, error };
      }

      const stats = {
        totalVaults: vaults.length,
        averageAPY: vaults.reduce((sum, v) => sum + v.apy, 0) / vaults.length,
        totalTVL: vaults.reduce((sum, v) => sum + v.tvl, 0),
        topProtocols: this.getTopProtocols(vaults),
        networkDistribution: vaults.reduce((acc, v) => {
          acc[v.network] = (acc[v.network] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };

      return { data: stats, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Calcula top protocolos
   */
  private getTopProtocols(vaults: VaultData[]) {
    const protocolStats = vaults.reduce((acc, vault) => {
      if (!acc[vault.protocol]) {
        acc[vault.protocol] = { count: 0, totalApy: 0 };
      }
      acc[vault.protocol].count++;
      acc[vault.protocol].totalApy += vault.apy;
      return acc;
    }, {} as Record<string, { count: number; totalApy: number }>);

    return Object.entries(protocolStats)
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        avgApy: stats.totalApy / stats.count
      }))
      .sort((a, b) => b.avgApy - a.avgApy)
      .slice(0, 5);
  }

  /**
   * Datos mock para desarrollo cuando la API no responde
   */
  private getMockVaultsData(): VaultData[] {
    return [
      {
        id: 'aave-usdc-v3',
        name: 'Aave USDC Lending',
        protocol: 'Aave',
        network: 'ethereum',
        asset: 'USDC',
        apy: 3.45,
        tvl: 1200000000,
        category: 'lending',
        vault_address: '0x...',
        last_updated: new Date().toISOString()
      },
      {
        id: 'yearn-weth-vault',
        name: 'Yearn WETH Strategy',
        protocol: 'Yearn',
        network: 'ethereum', 
        asset: 'WETH',
        apy: 5.8,
        tvl: 450000000,
        category: 'strategy',
        vault_address: '0x...',
        last_updated: new Date().toISOString()
      },
      {
        id: 'compound-dai',
        name: 'Compound DAI Pool',
        protocol: 'Compound',
        network: 'ethereum',
        asset: 'DAI',
        apy: 2.9,
        tvl: 234000000,
        category: 'lending',
        vault_address: '0x...',
        last_updated: new Date().toISOString()
      },
      {
        id: 'uniswap-v3-usdc-eth',
        name: 'Uniswap V3 USDC/ETH',
        protocol: 'Uniswap',
        network: 'ethereum',
        asset: 'USDC-ETH',
        apy: 12.4,
        tvl: 89000000,
        category: 'liquidity_pool',
        vault_address: '0x...',
        last_updated: new Date().toISOString()
      }
    ];
  }

  /**
   * Limpia cache manualmente
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🧹 Cache de Vaults.fyi limpiado');
  }
}

export const vaultsService = new VaultsService();