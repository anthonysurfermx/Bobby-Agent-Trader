// ============================================================
// Coarse audience location (migration 20261001220000). Vercel derives country and first-level region from the
// request IP and passes them as headers; only those two codes are kept, never the IP or the city.
// ============================================================
import type { VercelRequest } from '@vercel/node';

export interface Geo { country: string | null; region: string | null }

const header = (req: Pick<VercelRequest, 'headers'>, name: string): string => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

export function countryCode(v: unknown): string | null {
  const c = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return /^[A-Z]{2}$/.test(c) && !['XX', 'T1', 'ZZ'].includes(c) ? c : null;
}

export function requestGeo(req: Pick<VercelRequest, 'headers'>): Geo {
  const country = countryCode(header(req, 'x-vercel-ip-country'));
  const region = header(req, 'x-vercel-ip-country-region').trim().toUpperCase();
  return { country, region: country && /^[A-Z0-9]{1,3}$/.test(region) ? region : null };
}

// Hosting providers' networks (cloud and VPS): a browser arriving from one is automation, not a person at home or
// on a phone. Vercel passes the ASN of the request IP; only the yes/no is kept (bobby_devices.datacenter).
const DATACENTER_ASNS = new Set([
  15169, 396982, 19527, // Google
  16509, 14618, 8987, // Amazon
  8075, 8068, // Microsoft
  14061, 63949, 20473, 16276, 24940, 51167, 31898, // DigitalOcean, Linode, Vultr, OVH, Hetzner, Contabo, Oracle (not Cloudflare: iCloud Private Relay exits there)
  45102, 37963, 45090, 132203, 136907, 55990, // Alibaba, Tencent, Huawei Cloud
  9009, 60068, 212238, 36352, 53667, 62240, 46606, 29802, 54825, 8100, 32934, // M247, Datacamp, ColoCrossing, FranTech, Clouvider, Unified Layer, HIVELOCITY, Packet, QuadraNet, Meta
]);
export function fromDatacenter(req: Pick<VercelRequest, 'headers'>): boolean {
  const asn = Number(header(req, 'x-vercel-ip-as-number').trim());
  return Number.isInteger(asn) && DATACENTER_ASNS.has(asn);
}

// Search Console reports ISO 3166-1 alpha-3; the dashboard speaks alpha-2. Unlisted codes pass through upper-cased.
const ALPHA3: Record<string, string> = {
  MEX: 'MX', GTM: 'GT', BLZ: 'BZ', SLV: 'SV', HND: 'HN', NIC: 'NI', CRI: 'CR', PAN: 'PA', COL: 'CO', VEN: 'VE', ECU: 'EC',
  PER: 'PE', BOL: 'BO', CHL: 'CL', ARG: 'AR', URY: 'UY', PRY: 'PY', BRA: 'BR', CUB: 'CU', DOM: 'DO', PRI: 'PR', HTI: 'HT',
  JAM: 'JM', TTO: 'TT', GUY: 'GY', SUR: 'SR', BHS: 'BS', BRB: 'BB', USA: 'US', CAN: 'CA',
  ESP: 'ES', PRT: 'PT', FRA: 'FR', DEU: 'DE', ITA: 'IT', GBR: 'GB', IRL: 'IE', NLD: 'NL', BEL: 'BE', CHE: 'CH', AUT: 'AT',
  SWE: 'SE', NOR: 'NO', DNK: 'DK', FIN: 'FI', POL: 'PL', CZE: 'CZ', ROU: 'RO', GRC: 'GR', HUN: 'HU', UKR: 'UA', RUS: 'RU',
  TUR: 'TR', LUX: 'LU', ISL: 'IS', BGR: 'BG', HRV: 'HR', SRB: 'RS', SVK: 'SK', SVN: 'SI', EST: 'EE', LVA: 'LV', LTU: 'LT',
  IND: 'IN', CHN: 'CN', JPN: 'JP', KOR: 'KR', TWN: 'TW', HKG: 'HK', SGP: 'SG', MYS: 'MY', IDN: 'ID', PHL: 'PH', THA: 'TH',
  VNM: 'VN', PAK: 'PK', BGD: 'BD', ARE: 'AE', SAU: 'SA', ISR: 'IL', QAT: 'QA', EGY: 'EG', NGA: 'NG', ZAF: 'ZA', KEN: 'KE',
  MAR: 'MA', AUS: 'AU', NZL: 'NZ',
};

export function fromAlpha3(v: unknown): string | null {
  const c = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(c) || c === 'ZZZ') return null;
  return ALPHA3[c] ?? c;
}
