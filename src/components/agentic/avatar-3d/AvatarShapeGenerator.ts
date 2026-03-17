import {
  IcosahedronGeometry,
  OctahedronGeometry,
  DodecahedronGeometry,
  TorusKnotGeometry,
  TorusGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Color,
  type BufferGeometry,
  type Material,
} from 'three';

export interface AvatarParams {
  geometryType: number;
  primaryHue: number;
  secondaryHue: number;
  saturation: number;
  lightness: number;
  hasWireframe: boolean;
  rotationBias: [number, number, number];
  glowIntensity: number;
  geometryDetail: number;
  torusP: number;
  torusQ: number;
}

export function hashSlug(slug: string): number[] {
  const values: number[] = [];
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = ((h << 5) - h + slug.charCodeAt(i)) | 0;
    values.push(Math.abs(h));
  }
  while (values.length < 10) {
    h = ((h << 5) - h + values[values.length - 1]) | 0;
    values.push(Math.abs(h));
  }
  return values;
}

// Cyberpunk color palette biases
const HUES = [180, 195, 280, 320, 35, 160, 210, 260];

export function generateAvatarParams(slug: string): AvatarParams {
  const h = hashSlug(slug);

  const hueIndex = h[1] % HUES.length;
  const primaryHue = (HUES[hueIndex] + (h[2] % 30) - 15 + 360) % 360;
  const secondaryHue = (primaryHue + 60 + (h[3] % 60)) % 360;

  const rx = (h[5] % 3 === 0) ? 1.0 : 0.3;
  const ry = (h[5] % 3 === 1) ? 1.0 : 0.5;
  const rz = (h[5] % 3 === 2) ? 1.0 : 0.2;

  return {
    geometryType: h[0] % 6,
    primaryHue,
    secondaryHue,
    saturation: 70 + (h[4] % 30),
    lightness: 45 + (h[4] % 20),
    hasWireframe: h[6] % 3 !== 0, // 66% chance of wireframe
    rotationBias: [rx, ry, rz],
    glowIntensity: 0.3 + (h[7] % 70) / 100,
    geometryDetail: h[8] % 3,
    torusP: 2 + (h[9] % 4),
    torusQ: 1 + (h[9] % 3),
  };
}

export function buildAvatarGeometry(params: AvatarParams): BufferGeometry {
  const detail = params.geometryDetail;

  switch (params.geometryType) {
    case 0:
      return new IcosahedronGeometry(0.8, detail);
    case 1:
      return new OctahedronGeometry(0.85, detail);
    case 2:
      return new DodecahedronGeometry(0.75, detail);
    case 3:
      return new TorusKnotGeometry(0.5, 0.18, 64, 8, params.torusP, params.torusQ);
    case 4:
      return new TorusGeometry(0.55, 0.25, 16, 32);
    case 5:
      return new CylinderGeometry(0.5, 0.7, 1.0, 6 + detail * 2);
    default:
      return new IcosahedronGeometry(0.8, detail);
  }
}

export function buildAvatarMaterials(params: AvatarParams): Material[] {
  const primaryColor = new Color(`hsl(${params.primaryHue}, ${params.saturation}%, ${params.lightness}%)`);
  const secondaryColor = new Color(`hsl(${params.secondaryHue}, ${params.saturation}%, ${params.lightness + 10}%)`);

  const materials: Material[] = [];

  // Main solid material with emissive glow
  materials.push(
    new MeshStandardMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: params.glowIntensity * 0.4,
      metalness: 0.6,
      roughness: 0.3,
      transparent: true,
      opacity: 0.9,
    })
  );

  // Wireframe overlay
  if (params.hasWireframe) {
    materials.push(
      new MeshBasicMaterial({
        color: secondaryColor,
        wireframe: true,
        transparent: true,
        opacity: 0.4,
      })
    );
  }

  return materials;
}

export function getAvatarFallbackColor(slug: string): string {
  const h = hashSlug(slug);
  const hueIndex = h[1] % HUES.length;
  const hue = (HUES[hueIndex] + (h[2] % 30) - 15 + 360) % 360;
  return `hsl(${hue}, 80%, 55%)`;
}
