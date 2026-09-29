// ============================================================
// asset-exposures — which business (or network) exposures each asset in the voice universe has, so the desk can
// answer "what else is in this sector?" with a small, explainable peer set, and memory can say why two assets a
// reader follows are related. Static configuration like the universe itself (src/lib/voice-assets.ts): a
// classification, never a price, a score or a recommendation. Current numbers for the peers always come from
// market data at read time (api/_lib/desk-related.ts).
// An asset has several exposures on purpose (AMZN = e-commerce, cloud and ads): an AMZN question alone never
// says which one the reader cares about, so the peer set covers each exposure instead of guessing one.
// ============================================================

export type Exposure =
  | 'cloud' | 'ecommerce' | 'digital_ads' | 'consumer_devices' | 'semiconductors' | 'ai_compute' | 'enterprise_software'
  | 'electric_vehicles' | 'streaming_media' | 'crypto_equities' | 'payments' | 'banks' | 'healthcare' | 'retail'
  | 'energy' | 'industrials' | 'mobility_travel' | 'broad_index' | 'precious_metals' | 'bonds'
  | 'store_of_value' | 'smart_contract_l1' | 'ethereum_l2' | 'defi' | 'oracles_data' | 'memecoins' | 'crypto_payments'
  | 'exchange_tokens' | 'interoperability';

export const EXPOSURE_LABEL: Record<Exposure, { en: string; es: string; pt: string }> = {
  cloud: { en: 'cloud computing', es: 'nube', pt: 'computação em nuvem' },
  ecommerce: { en: 'e-commerce', es: 'comercio electrónico', pt: 'comércio eletrônico' },
  digital_ads: { en: 'digital advertising', es: 'publicidad digital', pt: 'publicidade digital' },
  consumer_devices: { en: 'consumer devices', es: 'dispositivos de consumo', pt: 'dispositivos de consumo' },
  semiconductors: { en: 'semiconductors', es: 'semiconductores', pt: 'semicondutores' },
  ai_compute: { en: 'AI compute', es: 'cómputo para IA', pt: 'computação para IA' },
  enterprise_software: { en: 'enterprise software', es: 'software empresarial', pt: 'software corporativo' },
  electric_vehicles: { en: 'electric vehicles', es: 'autos eléctricos', pt: 'veículos elétricos' },
  streaming_media: { en: 'streaming and media', es: 'streaming y medios', pt: 'streaming e mídia' },
  crypto_equities: { en: 'crypto-linked stocks', es: 'acciones ligadas a cripto', pt: 'ações ligadas a cripto' },
  payments: { en: 'payments', es: 'pagos', pt: 'pagamentos' },
  banks: { en: 'banks', es: 'bancos', pt: 'bancos' },
  healthcare: { en: 'healthcare', es: 'salud', pt: 'saúde' },
  retail: { en: 'retail', es: 'comercio minorista', pt: 'varejo' },
  energy: { en: 'energy', es: 'energía', pt: 'energia' },
  industrials: { en: 'industrials', es: 'industria', pt: 'indústria' },
  mobility_travel: { en: 'mobility and travel', es: 'movilidad y viajes', pt: 'mobilidade e viagens' },
  broad_index: { en: 'broad market index', es: 'índice amplio', pt: 'índice amplo' },
  precious_metals: { en: 'precious metals', es: 'metales preciosos', pt: 'metais preciosos' },
  bonds: { en: 'bonds', es: 'bonos', pt: 'títulos' },
  store_of_value: { en: 'crypto store of value', es: 'reserva de valor cripto', pt: 'reserva de valor cripto' },
  smart_contract_l1: { en: 'smart-contract blockchains', es: 'blockchains de contratos inteligentes', pt: 'blockchains de contratos inteligentes' },
  ethereum_l2: { en: 'Ethereum layer 2s', es: 'capas 2 de Ethereum', pt: 'camadas 2 do Ethereum' },
  defi: { en: 'DeFi', es: 'DeFi', pt: 'DeFi' },
  oracles_data: { en: 'oracles and data', es: 'oráculos y datos', pt: 'oráculos e dados' },
  memecoins: { en: 'memecoins', es: 'memecoins', pt: 'memecoins' },
  crypto_payments: { en: 'crypto payments', es: 'pagos cripto', pt: 'pagamentos cripto' },
  exchange_tokens: { en: 'exchange tokens', es: 'tokens de exchange', pt: 'tokens de exchange' },
  interoperability: { en: 'interoperability', es: 'interoperabilidad', pt: 'interoperabilidade' },
};

/** Exposures per ticker, most defining first. Assets missing here simply have no peer set. */
export const ASSET_EXPOSURES: Record<string, Exposure[]> = {
  // equities
  NVDA: ['ai_compute', 'semiconductors'], AMD: ['semiconductors', 'ai_compute'], AVGO: ['semiconductors', 'ai_compute'],
  MU: ['semiconductors', 'ai_compute'], INTC: ['semiconductors'], QCOM: ['semiconductors', 'consumer_devices'],
  SMCI: ['ai_compute'], ARM: ['semiconductors'],
  AAPL: ['consumer_devices'], MSFT: ['cloud', 'enterprise_software', 'ai_compute'], GOOGL: ['digital_ads', 'cloud'],
  AMZN: ['ecommerce', 'cloud', 'digital_ads'], META: ['digital_ads'], ORCL: ['cloud', 'enterprise_software'],
  CRM: ['enterprise_software'], ADBE: ['enterprise_software'], PLTR: ['enterprise_software'],
  TSLA: ['electric_vehicles'], NFLX: ['streaming_media'], DIS: ['streaming_media'],
  COIN: ['crypto_equities'], MSTR: ['crypto_equities'], HOOD: ['crypto_equities'],
  LLY: ['healthcare'], UNH: ['healthcare'], JPM: ['banks'], GS: ['banks'], V: ['payments'], MA: ['payments'],
  WMT: ['retail', 'ecommerce'], COST: ['retail'], NKE: ['retail'], XOM: ['energy'], CVX: ['energy'],
  BA: ['industrials'], CAT: ['industrials'], UBER: ['mobility_travel'], ABNB: ['mobility_travel'],
  // ETFs
  SPY: ['broad_index'], QQQ: ['broad_index'], DIA: ['broad_index'], IWM: ['broad_index'],
  XLF: ['banks'], XLE: ['energy'], XLV: ['healthcare'], GLD: ['precious_metals'], SLV: ['precious_metals'],
  USO: ['energy'], TLT: ['bonds'], HYG: ['bonds'],
  // crypto
  BTC: ['store_of_value'], ETH: ['smart_contract_l1', 'defi'], SOL: ['smart_contract_l1'], ADA: ['smart_contract_l1'],
  AVAX: ['smart_contract_l1'], NEAR: ['smart_contract_l1'], APT: ['smart_contract_l1'], SUI: ['smart_contract_l1'],
  SEI: ['smart_contract_l1'], TON: ['smart_contract_l1'], TRX: ['smart_contract_l1', 'crypto_payments'],
  BNB: ['exchange_tokens', 'smart_contract_l1'], OKB: ['exchange_tokens'], ARB: ['ethereum_l2'], OP: ['ethereum_l2'],
  UNI: ['defi'], AAVE: ['defi'], INJ: ['defi'], LINK: ['oracles_data', 'defi'], TIA: ['oracles_data'], FIL: ['oracles_data'],
  DOT: ['interoperability'], ATOM: ['interoperability'], XRP: ['crypto_payments'], LTC: ['crypto_payments', 'store_of_value'],
  DOGE: ['memecoins'], SHIB: ['memecoins'], PEPE: ['memecoins'], WIF: ['memecoins'],
};

export const exposuresOf = (symbol: string): Exposure[] => ASSET_EXPOSURES[symbol] ?? [];

/** The exposures two assets share, in the first asset's order. */
export function sharedExposures(a: string, b: string): Exposure[] {
  const other = new Set(exposuresOf(b));
  return exposuresOf(a).filter((e) => other.has(e));
}

/**
 * Up to `max` peers of `symbol`: every exposure it has gets a peer before any exposure gets a second one (AMZN →
 * one e-commerce, one cloud, one ads peer). For each exposure the peer is an asset for which it is most defining
 * (its first exposure before its second), then the one sharing more with `symbol`, then universe order. Each peer
 * names the exposure it was picked for.
 */
export function peersOf(symbol: string, max = 3): Array<{ symbol: string; exposure: Exposure }> {
  const own = exposuresOf(symbol);
  if (!own.length) return [];
  const universe = Object.keys(ASSET_EXPOSURES).filter((s) => s !== symbol);
  const picked: Array<{ symbol: string; exposure: Exposure }> = [];
  const taken = new Set<string>();
  for (let round = 0; picked.length < max && round < max; round++) {
    for (const exposure of own) {
      if (picked.length >= max) break;
      const next = universe
        .filter((s) => !taken.has(s) && exposuresOf(s).includes(exposure))
        .map((s, order) => ({ s, order, rank: exposuresOf(s).indexOf(exposure), shared: sharedExposures(symbol, s).length }))
        .sort((x, y) => x.rank - y.rank || y.shared - x.shared || x.order - y.order)[0];
      if (!next) continue;
      taken.add(next.s);
      picked.push({ symbol: next.s, exposure });
    }
  }
  return picked;
}
