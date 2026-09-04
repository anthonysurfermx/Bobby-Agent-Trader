// Shared worlds — what the web needs to show islands other builders published:
// routes, the district roster, the art manifest loader and the public API.
import { isSpanish } from '@/lib/companions/i18n';

export const STUDIO_PATH = '/agentic-world/bobby/trader-land';
export const WORLDS_PATH = '/agentic-world/bobby/trader-land/worlds';
export const visitorPath = (code: string) => `${STUDIO_PATH}/w/${code}`;
export const shareUrl = (code: string) => `${window.location.origin}${visitorPath(code)}`;

export type District = 'crypto_bay' | 'evidence_mines' | 'thesis_citadel' | 'risk_reef' | 'axiom_archive';
export const DISTRICTS: District[] = ['crypto_bay', 'evidence_mines', 'thesis_citadel', 'risk_reef', 'axiom_archive'];
export const DISTRICT_META: Record<District, { name: string; color: string; trait: [string, string]; line: [string, string] }> = {
  crypto_bay: { name: 'Crypto Bay', color: '#56d9e8', trait: ['Patience', 'Paciencia'], line: ['Docks and towers for those who wait for the setup.', 'Muelles y torres para quien espera el setup.'] },
  evidence_mines: { name: 'Evidence Mines', color: '#a7f38a', trait: ['Clarity', 'Claridad'], line: ['Crystals grow where the data was checked.', 'Los cristales crecen donde se comprobó el dato.'] },
  thesis_citadel: { name: 'Thesis Citadel', color: '#8ba8ff', trait: ['Risk', 'Riesgo'], line: ['Walls and gates: every thesis has a stop.', 'Murallas y puertas: toda tesis tiene un stop.'] },
  risk_reef: { name: 'Risk Reef', color: '#c3a1ff', trait: ['Contradiction', 'Contradicción'], line: ['Antennas that listen to the other side.', 'Antenas que escuchan al otro lado.'] },
  axiom_archive: { name: 'Axiom Archive', color: '#f5d68b', trait: ['Closure', 'Cierre'], line: ['Paths and flowers for closed theses.', 'Caminos y flores para las tesis cerradas.'] },
};
export const KIND_LABEL: Record<string, [string, string]> = {
  ground: ['Ground', 'Suelo'], path_pavement: ['Path', 'Camino'], path: ['Path', 'Camino'], decor: ['Decor', 'Decoración'], building: ['Building', 'Edificio'], landmark: ['Landmark', 'Hito'], core: ['Core', 'Núcleo'],
};

export type PublicPlacement = { item_id: string; x: number; y: number; rotation: number };
export type PublicWorld = { code: string; title: string | null; size: number; theme: string; publishedAt: string | null; placements: PublicPlacement[]; stats: { pieces: number; districts: string[] } };
export type CatalogItem = { id: string; world: string; attribution: string; kind: string; footprint_w: number; footprint_h: number; name: unknown; route_index: number | null; art_url: string | null };

export type ManifestVariant = { url: string; w: number; h: number };
export type ManifestState = { anchor: [number, number]; contentBounds: [number, number, number, number]; variants: Record<string, ManifestVariant> };
export type ManifestItem = { id: string; district: District | 'core'; kind: string; footprint: { cols: number; rows: number }; orientations: Record<string, { states: Record<string, ManifestState> }> };
export type LandManifest = { items: ManifestItem[] };

// The database catalog (tl_items) and the art manifest disagree on one id: the
// Discovery Route piece 'axiom_archive_return_path' ships as
// 'axiom_archive_return_path_curve'. Alias it so the piece renders everywhere.
export const CATALOG_ALIASES: Record<string, string> = { axiom_archive_return_path: 'axiom_archive_return_path_curve' };
export function withCatalogAliases<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const extra = Object.entries(CATALOG_ALIASES).flatMap(([alias, source]) => (!byId.has(alias) && byId.has(source) ? [{ ...byId.get(source)!, id: alias }] : []));
  return extra.length ? [...items, ...extra] : items;
}

let manifestPromise: Promise<LandManifest> | null = null;
/** The shipped art catalog, fetched once per page load and shared by every island render. */
export function loadManifest(): Promise<LandManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch('/land/v1/gate-A/asset-manifest.json').then(async (r) => {
      if (!r.ok) throw new Error('Art catalog unavailable');
      const manifest = (await r.json()) as LandManifest;
      if (!Array.isArray(manifest.items) || !manifest.items.some((item) => item.id === 'aura_core')) throw new Error('Incomplete art catalog');
      return { ...manifest, items: withCatalogAliases(manifest.items) };
    }).catch((error) => { manifestPromise = null; throw error; });
  }
  return manifestPromise;
}

export function artOf(item: ManifestItem) {
  const orientation = Object.values(item.orientations)[0];
  const state = orientation.states.stage1 ?? orientation.states.bloom ?? Object.values(orientation.states)[0];
  return { albedo: state.variants.albedo_512 ?? state.variants.albedo_1024, thumb: state.variants.thumb_256, anchor: state.anchor, contentBounds: state.contentBounds };
}

export function pretty(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Display name from the catalog (the database is the source of names); the id is the fallback. */
export function itemLabel(id: string, district: string, catalog?: Map<string, CatalogItem>): string {
  const name = catalog?.get(id)?.name as { en?: string; es?: string } | undefined;
  return (isSpanish() ? name?.es : name?.en) ?? name?.en ?? pretty(id.replace(district + '_', ''));
}

async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  const value = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(value.error || (r.status === 404 ? 'not_found' : 'unavailable'));
  return value;
}
export function fetchPublicWorlds(signal?: AbortSignal) {
  return readJson<{ ok: boolean; worlds: PublicWorld[]; catalog: CatalogItem[] }>('/api/trader-land-public', signal);
}
export function fetchPublicWorld(code: string, signal?: AbortSignal) {
  return readJson<{ ok: boolean; world: PublicWorld; catalog: CatalogItem[] }>(`/api/trader-land-public?code=${encodeURIComponent(code)}`, signal);
}
