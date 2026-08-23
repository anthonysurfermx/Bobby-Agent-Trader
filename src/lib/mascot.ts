// ============================================================
// mascot.ts — Bobby mascot configuration model
// The agent's visual identity: a customizable terminal creature
// picked during onboarding (video-game character-creator style).
// Persisted in localStorage ('bobby_mascot') and agent_profiles.mascot.
// ============================================================

export interface MascotLook {
  body: string;      // color palette id
  eyes: string;      // eye style id
  accessory: string; // headgear/accessory id
  /** Optional premade 3D avatar id (see MASCOT_AVATARS). When set, the
   *  GLB model replaces the procedural blob; body still drives the glow. */
  avatar?: string;
}

// ---- Premade 3D avatar registry ----
// Drop .glb files in public/mascots/ and register them here — the wizard
// automatically switches from the procedural customizer to a selection
// gallery when this list is non-empty. Thumbs are optional PNGs shown in
// the gallery grid (public/mascots/<id>.png).
export interface MascotAvatar {
  id: string;
  label: string;
  /** URL to the .glb model, e.g. '/mascots/fox.glb' */
  model: string;
  /** Palette id that drives glow + accents for this avatar */
  palette: string;
  /** Scale multiplier to normalize the model to ~2 units tall */
  scale?: number;
  /** Vertical offset after scaling */
  yOffset?: number;
  /** Optional gallery thumbnail, e.g. '/mascots/fox.png' */
  thumb?: string;
}

// The Bobby squad — generated with Higgsfield (nano_banana → Meshy v7)
export const MASCOT_AVATARS: MascotAvatar[] = [
  { id: 'bobby', label: 'Bobby', model: '/mascots/orb.glb', palette: 'matrix', thumb: '/mascots/orb.webp' },
  { id: 'byte', label: 'Byte', model: '/mascots/byte.glb', palette: 'matrix', thumb: '/mascots/byte.webp' },
  { id: 'kora', label: 'Kora', model: '/mascots/kora.glb', palette: 'matrix', thumb: '/mascots/kora.webp' },
  { id: 'zip', label: 'Zip', model: '/mascots/zip.glb', palette: 'matrix', thumb: '/mascots/zip.webp' },
  { id: 'glitch', label: 'Glitch', model: '/mascots/glitch.glb', palette: 'plasma', thumb: '/mascots/glitch.webp' },
  { id: 'momo', label: 'Momo', model: '/mascots/momo.glb', palette: 'plasma', thumb: '/mascots/momo.webp' },
  { id: 'flux', label: 'Flux', model: '/mascots/flux.glb', palette: 'ice', thumb: '/mascots/flux.webp' },
  { id: 'rook', label: 'Rook', model: '/mascots/rook.glb', palette: 'matrix', thumb: '/mascots/rook.webp' },
  { id: 'axiom', label: 'Axiom', model: '/mascots/axiom.glb', palette: 'gold', thumb: '/mascots/axiom.webp' },
  { id: 'halo', label: 'Halo', model: '/mascots/halo.glb', palette: 'ghost', thumb: '/mascots/halo.webp' },
];

export const VALID_MASCOT_AVATARS = MASCOT_AVATARS.map(a => a.id);

export function getAvatar(id?: string): MascotAvatar | null {
  if (!id) return null;
  return MASCOT_AVATARS.find(a => a.id === id) || null;
}

export interface MascotPalette {
  id: string;
  label: { es: string; en: string };
  /** Main body fill */
  base: string;
  /** Lighter highlight for gradient top */
  light: string;
  /** Darker shade for gradient bottom */
  dark: string;
  /** Glow color as "r, g, b" for rgba() shadows */
  glow: string;
}

export const MASCOT_PALETTES: MascotPalette[] = [
  { id: 'matrix', label: { es: 'Matrix', en: 'Matrix' }, base: '#22c55e', light: '#4ade80', dark: '#15803d', glow: '34, 197, 94' },
  { id: 'plasma', label: { es: 'Plasma', en: 'Plasma' }, base: '#a855f7', light: '#c084fc', dark: '#7e22ce', glow: '168, 85, 247' },
  { id: 'lava', label: { es: 'Lava', en: 'Lava' }, base: '#f97316', light: '#fb923c', dark: '#c2410c', glow: '249, 115, 22' },
  { id: 'ice', label: { es: 'Hielo', en: 'Ice' }, base: '#38bdf8', light: '#7dd3fc', dark: '#0369a1', glow: '56, 189, 248' },
  { id: 'gold', label: { es: 'Oro', en: 'Gold' }, base: '#facc15', light: '#fde047', dark: '#a16207', glow: '250, 204, 21' },
  { id: 'ghost', label: { es: 'Fantasma', en: 'Ghost' }, base: '#94a3b8', light: '#cbd5e1', dark: '#475569', glow: '148, 163, 184' },
];

export interface MascotEyes {
  id: string;
  label: { es: string; en: string };
}

export const MASCOT_EYES: MascotEyes[] = [
  { id: 'round', label: { es: 'Curioso', en: 'Curious' } },
  { id: 'happy', label: { es: 'Feliz', en: 'Happy' } },
  { id: 'focused', label: { es: 'Enfocado', en: 'Focused' } },
  { id: 'pixel', label: { es: 'Pixel', en: 'Pixel' } },
];

export interface MascotAccessory {
  id: string;
  label: { es: string; en: string };
}

export const MASCOT_ACCESSORIES: MascotAccessory[] = [
  { id: 'none', label: { es: 'Nada', en: 'None' } },
  { id: 'visor', label: { es: 'Visor', en: 'Visor' } },
  { id: 'antenna', label: { es: 'Antena', en: 'Antenna' } },
  { id: 'cap', label: { es: 'Gorra', en: 'Cap' } },
  { id: 'headphones', label: { es: 'Audífonos', en: 'Headphones' } },
];

export const DEFAULT_MASCOT: MascotLook = { body: 'matrix', eyes: 'round', accessory: 'none' };

const VALID_BODIES = MASCOT_PALETTES.map(p => p.id);
const VALID_EYES = MASCOT_EYES.map(e => e.id);
const VALID_ACCESSORIES = MASCOT_ACCESSORIES.map(a => a.id);

export function randomMascot(): MascotLook {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  return {
    body: pick(VALID_BODIES),
    eyes: pick(VALID_EYES),
    accessory: pick(VALID_ACCESSORIES),
  };
}

export function isValidMascot(m: unknown): m is MascotLook {
  if (!m || typeof m !== 'object') return false;
  const c = m as Record<string, unknown>;
  return (
    typeof c.body === 'string' && VALID_BODIES.includes(c.body) &&
    typeof c.eyes === 'string' && VALID_EYES.includes(c.eyes) &&
    typeof c.accessory === 'string' && VALID_ACCESSORIES.includes(c.accessory) &&
    (c.avatar === undefined || (typeof c.avatar === 'string' && VALID_MASCOT_AVATARS.includes(c.avatar)))
  );
}

export function getPalette(look: MascotLook): MascotPalette {
  return MASCOT_PALETTES.find(p => p.id === look.body) || MASCOT_PALETTES[0];
}

const STORAGE_KEY = 'bobby_mascot';

export function loadMascot(): MascotLook | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidMascot(parsed)) return parsed;
    }
    // Fallback: the deployed agent profile (covers a cleared key or a
    // profile hydrated from the server on another surface)
    const prof = localStorage.getItem('agent_profile');
    if (prof) {
      const m = JSON.parse(prof)?.mascot;
      if (isValidMascot(m)) {
        saveMascot(m);
        return m;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function saveMascot(look: MascotLook): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(look));
  } catch { /* private mode — non-critical */ }
}
