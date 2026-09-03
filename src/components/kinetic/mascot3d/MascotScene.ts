// ============================================================
// MascotScene — 3D character engine for the Bobby mascot
// Duolingo-style charm in plain three.js (no react-three-fiber):
// a chubby blob-bot with huge eyes that FOLLOW THE CURSOR,
// squash-and-stretch tap bounce, blink loop, and voice-driven
// mouth. Customizable via MascotLook (palette/eyes/accessory).
// ============================================================

import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Color,
  SphereGeometry, CylinderGeometry, TorusGeometry, BoxGeometry,
  MeshStandardMaterial, AmbientLight, DirectionalLight, PointLight,
  MathUtils, Box3, Vector3, PMREMGenerator, ACESFilmicToneMapping, Sprite, SpriteMaterial, TextureLoader, SRGBColorSpace,
  Texture, PlaneGeometry, MeshBasicMaterial, DoubleSide, AdditiveBlending, type Object3D, type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { type MascotLook, getPalette, getAvatar } from '@/lib/mascot';

// Shared loader — avatar GLBs are Draco-compressed (decoder in public/draco/)
let sharedLoader: GLTFLoader | null = null;
function getLoader(): GLTFLoader {
  if (!sharedLoader) {
    sharedLoader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    sharedLoader.setDRACOLoader(draco);
  }
  return sharedLoader;
}

export type MascotState = 'idle' | 'listening' | 'thinking' | 'speaking';

const DARK = 0x0a0a0a;

// Full GPU cleanup: geometry, materials AND their textures (GLB avatars
// carry base color / normal / roughness maps that leak without this)
function disposeObject(root: Object3D): void {
  root.traverse(obj => {
    if (obj instanceof Mesh) {
      obj.geometry.dispose();
      const materials: Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of materials) {
        for (const value of Object.values(mat)) {
          if (value instanceof Texture) value.dispose();
        }
        mat.dispose();
      }
    }
  });
}

function standardMat(color: number | string, opts: { roughness?: number; emissive?: number | string; emissiveIntensity?: number; transparent?: boolean; opacity?: number } = {}) {
  const m = new MeshStandardMaterial({
    color: new Color(color),
    roughness: opts.roughness ?? 0.55,
    metalness: 0.05,
  });
  if (opts.emissive !== undefined) {
    m.emissive = new Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 0.5;
  }
  if (opts.transparent) {
    m.transparent = true;
    m.opacity = opts.opacity ?? 0.5;
  }
  return m;
}

export class MascotScene {
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new PerspectiveCamera(38, 1, 0.1, 100);
  private root = new Group();       // bob + bounce
  private character = new Group();  // rotates toward cursor
  /** Gear worn on the body + the pet: sprites parented to the character so
   *  they turn and bob with it. Keyed so re-applying the same set is a no-op. */
  private gearGroup = new Group();
  private gearKey = '';
  private gearTextures: Texture[] = [];
  private spinners: Object3D[] = [];
  private avatarId = 'orb';
  private pupils: Mesh[] = [];
  private eyeGroup = new Group();
  private mouth: Mesh | null = null;
  private smile: Mesh | null = null;
  private antennaTip: Mesh | null = null;
  private accentLight: PointLight | null = null;

  private state: MascotState = 'idle';
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;

  private pointer = { x: 0, y: 0 };
  private bounceVel = 0;
  private squash = 1;
  private blinkAt = 0;
  private blinkPhase = 0; // 0 = open
  private animationId: number | null = null;
  private lastTime = 0;
  private disposed = false;
  private envTexture: Texture | null = null;
  private reduceMotion = false;

  init(canvasHost: HTMLElement, size: number): boolean {
    try {
      this.renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      return false;
    }
    if (!this.renderer.getContext()) return false;

    // 1.5 DPR cap: the mascot is a small canvas — retina x2 doubles GPU
    // memory for no visible gain at these sizes
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(size, size);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Environment map — PBR GLBs (Meshy) look flat/dark without one
    try {
      const pmrem = new PMREMGenerator(this.renderer);
      this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = this.envTexture;
      pmrem.dispose();
    } catch { /* non-critical */ }

    try {
      this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch { /* non-critical */ }
    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    // iOS reclaims WebGL contexts under memory pressure — surface it so the
    // wrapper can fall back to the SVG mascot instead of a blank canvas
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      if (this.animationId !== null) cancelAnimationFrame(this.animationId);
      this.animationId = null;
      this.onContextLost?.();
    });
    canvasHost.appendChild(canvas);

    this.camera.position.set(0, 0.15, 4.4);
    this.camera.lookAt(0, 0, 0);

    // Soft toy-store lighting
    this.scene.add(new AmbientLight(0xffffff, 0.85));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(2.5, 3.5, 4);
    this.scene.add(key);
    const fill = new DirectionalLight(0xbfd4ff, 0.5);
    fill.position.set(-3, 1, 2);
    this.scene.add(fill);
    this.accentLight = new PointLight(0xffffff, 2.2, 12);
    this.accentLight.position.set(0, -1.5, 3);
    this.scene.add(this.accentLight);

    this.root.add(this.character);
    this.scene.add(this.root);

    this.blinkAt = performance.now() + 1800 + Math.random() * 2500;
    this.lastTime = performance.now();
    let lastRenderAt = 0;
    const animate = (now: number) => {
      if (this.disposed) return;
      // Reduced motion: static pose needs ~2fps, not 60
      if (!this.reduceMotion || now - lastRenderAt > 500) {
        this.update(now);
        this.renderer!.render(this.scene, this.camera);
        lastRenderAt = now;
      }
      this.animationId = requestAnimationFrame(animate);
    };
    this.animationId = requestAnimationFrame(animate);
    return true;
  }

  /** Set by the wrapper — fired when the WebGL context is lost */
  onContextLost?: () => void;

  // ---- Character construction ----

  private lookVersion = 0;

  setLook(look: MascotLook): void {
    const version = ++this.lookVersion;
    this.avatarId = look.avatar ?? 'orb';

    // Premade 3D avatar (Anthony's gallery) — load GLB instead of the
    // procedural blob. The charm layer (bob, cursor-follow, tap bounce)
    // applies to any model.
    const avatar = getAvatar(look.avatar);
    if (avatar) {
      const palette = getPalette(look);
      if (this.accentLight) this.accentLight.color = new Color(palette.base);
      // Placeholder while the GLB streams in — never show an empty stage
      if (this.character.children.length === 0) this.buildProcedural(look);
      getLoader().load(avatar.model, gltf => {
        if (version !== this.lookVersion || this.disposed) {
          disposeObject(gltf.scene); // stale load — free its GPU resources
          return;
        }
        this.clearCharacter();
        const model = gltf.scene;
        // Normalize to ~2.2 units tall, centered
        const box = new Box3().setFromObject(model);
        const sizeV = box.getSize(new Vector3());
        const s = (avatar.scale ?? 1) * (2.2 / Math.max(sizeV.x, sizeV.y, sizeV.z || 1));
        model.scale.setScalar(s);
        const center = box.getCenter(new Vector3()).multiplyScalar(s);
        model.position.set(-center.x, -center.y + (avatar.yOffset ?? 0), -center.z);
        this.character.add(model);
        this.character.add(this.gearGroup);
      }, undefined, err => {
        console.warn('[MascotScene] GLB load failed, falling back to procedural:', err);
        if (version === this.lookVersion) this.buildProcedural(look);
      });
      return;
    }

    this.buildProcedural(look);
  }

  private clearCharacter(): void {
    // Worn gear survives a model swap: detach it before disposing the body.
    this.character.remove(this.gearGroup);
    disposeObject(this.character);
    this.character.clear();
    this.pupils = [];
    this.eyeGroup = new Group();
    this.mouth = null;
    this.smile = null;
    this.antennaTip = null;
  }

  private buildProcedural(look: MascotLook): void {
    // Rebuild the character group from scratch (cheap: ~20 small meshes)
    this.clearCharacter();

    const palette = getPalette(look);
    const base = new Color(palette.base);
    const light = new Color(palette.light);
    const dark = new Color(palette.dark);
    if (this.accentLight) this.accentLight.color = new Color(palette.base);

    // Body — chubby blob (Duo proportions: body IS the head)
    const body = new Mesh(new SphereGeometry(1, 48, 48), standardMat(base.getHex(), { roughness: 0.5 }));
    body.scale.set(1, 1.12, 0.94);
    this.character.add(body);

    // Belly patch
    const belly = new Mesh(new SphereGeometry(0.62, 32, 32), standardMat(light.getHex(), { roughness: 0.65 }));
    belly.position.set(0, -0.38, 0.52);
    belly.scale.set(1, 1.05, 0.5);
    this.character.add(belly);

    // Feet
    for (const sx of [-1, 1]) {
      const foot = new Mesh(new SphereGeometry(0.26, 24, 24), standardMat(dark.getHex(), { roughness: 0.7 }));
      foot.position.set(sx * 0.42, -1.08, 0.18);
      foot.scale.set(1, 0.55, 1.15);
      this.character.add(foot);
    }

    // Little side arms (wings/nubs)
    for (const sx of [-1, 1]) {
      const arm = new Mesh(new SphereGeometry(0.22, 24, 24), standardMat(dark.getHex(), { roughness: 0.6 }));
      arm.position.set(sx * 0.98, -0.1, 0.05);
      arm.scale.set(0.55, 1.1, 0.7);
      arm.rotation.z = sx * -0.35;
      this.character.add(arm);
    }

    // ---- Eyes (huge — the charm lives here) ----
    const eyeY = 0.28, eyeZ = 0.78, eyeX = 0.34;
    const pupilStyle = look.eyes;
    for (const sx of [-1, 1]) {
      const eye = new Group();
      const white = new Mesh(new SphereGeometry(0.30, 32, 32), standardMat(0xffffff, { roughness: 0.35 }));
      white.scale.set(1, pupilStyle === 'focused' ? 0.72 : 1.06, 0.55);
      eye.add(white);

      const pupilGeo = pupilStyle === 'pixel' ? new BoxGeometry(0.2, 0.2, 0.08) : new SphereGeometry(0.13, 24, 24);
      const pupil = new Mesh(pupilGeo, standardMat(DARK, { roughness: 0.25 }));
      pupil.position.set(0, pupilStyle === 'happy' ? 0.05 : 0, 0.17);
      if (pupilStyle !== 'pixel') pupil.scale.set(1, pupilStyle === 'happy' ? 1.15 : 1, 0.6);
      eye.add(pupil);
      this.pupils.push(pupil);

      // sparkle
      const sparkle = new Mesh(new SphereGeometry(0.045, 12, 12), standardMat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1 }));
      sparkle.position.set(0.05, 0.07, 0.26);
      eye.add(sparkle);

      eye.position.set(sx * eyeX, eyeY, eyeZ * 0.94);
      this.eyeGroup.add(eye);
    }
    this.character.add(this.eyeGroup);

    // ---- Mouth: smile (idle) + open mouth (speaking) ----
    const smile = new Mesh(new TorusGeometry(0.16, 0.045, 12, 24, Math.PI * 0.85), standardMat(DARK, { roughness: 0.3 }));
    smile.position.set(0, -0.14, 0.88);
    smile.rotation.z = Math.PI + Math.PI * 0.075;
    this.character.add(smile);
    this.smile = smile;

    const mouth = new Mesh(new SphereGeometry(0.14, 24, 24), standardMat(DARK, { roughness: 0.3 }));
    mouth.position.set(0, -0.2, 0.86);
    mouth.scale.set(1.15, 0.1, 0.5);
    mouth.visible = false;
    this.character.add(mouth);
    this.mouth = mouth;

    // ---- Accessories ----
    if (look.accessory === 'antenna') {
      const stem = new Mesh(new CylinderGeometry(0.035, 0.05, 0.55, 12), standardMat(dark.getHex()));
      stem.position.set(0, 1.32, 0);
      this.character.add(stem);
      const tip = new Mesh(new SphereGeometry(0.11, 16, 16), standardMat(light.getHex(), { emissive: light.getHex(), emissiveIntensity: 0.9 }));
      tip.position.set(0, 1.64, 0);
      this.character.add(tip);
      this.antennaTip = tip;
    } else if (look.accessory === 'visor') {
      const visor = new Mesh(
        new SphereGeometry(1.02, 48, 24, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.26, Math.PI * 0.22),
        standardMat(0x0d0d14, { roughness: 0.15, emissive: base.getHex(), emissiveIntensity: 0.25, transparent: true, opacity: 0.72 }),
      );
      visor.scale.set(1.02, 1.14, 0.96);
      this.character.add(visor);
    } else if (look.accessory === 'cap') {
      const crown = new Mesh(new SphereGeometry(0.78, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), standardMat(0x111111, { roughness: 0.8 }));
      crown.position.set(0, 0.62, 0);
      this.character.add(crown);
      const brim = new Mesh(new CylinderGeometry(0.52, 0.58, 0.07, 24, 1, false, 0, Math.PI), standardMat(0x111111, { roughness: 0.8 }));
      brim.position.set(0, 0.78, 0.55);
      brim.rotation.y = Math.PI / 2;
      brim.rotation.z = -0.12;
      this.character.add(brim);
      const button = new Mesh(new SphereGeometry(0.09, 12, 12), standardMat(base.getHex(), { emissive: base.getHex(), emissiveIntensity: 0.4 }));
      button.position.set(0, 1.28, 0);
      this.character.add(button);
    } else if (look.accessory === 'headphones') {
      const band = new Mesh(new TorusGeometry(0.95, 0.07, 12, 32, Math.PI), standardMat(0x111111, { roughness: 0.7 }));
      band.position.set(0, 0.28, 0);
      this.character.add(band);
      for (const sx of [-1, 1]) {
        const cup = new Mesh(new CylinderGeometry(0.24, 0.24, 0.16, 20), standardMat(0x111111, { roughness: 0.6 }));
        cup.position.set(sx * 0.99, 0.26, 0);
        cup.rotation.z = Math.PI / 2;
        this.character.add(cup);
        const ring = new Mesh(new CylinderGeometry(0.25, 0.25, 0.04, 20), standardMat(base.getHex(), { emissive: base.getHex(), emissiveIntensity: 0.7 }));
        ring.position.set(sx * 1.07, 0.26, 0);
        ring.rotation.z = Math.PI / 2;
        this.character.add(ring);
      }
    }
  }

  // ---- External controls ----

  setState(state: MascotState): void { this.state = state; }

  setAnalyser(analyser: AnalyserNode | null): void {
    this.analyser = analyser;
    this.freqData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
  }

  private externalLevel: number | null = null;

  /**
   * Wear items on the body. Slots are in normalized character units (the model
   * is ~2.2 tall, centered): face / headset / head / hand / hip / shoulder /
   * chest, plus `pet` at the feet. `spin` twirls the sprite in-plane.
   */
  setAttachments(items: Array<{ url: string; slot: string; spin?: boolean; glow?: string }>): void {
    const key = items.map((i) => `${i.url}@${i.slot}${i.spin ? '~' : ''}`).join('|');
    if (key === this.gearKey) return;
    this.gearKey = key;
    this.gearGroup.clear();
    this.gearTextures.forEach((t) => t.dispose());
    this.gearTextures = [];
    this.spinners = [];
    if (!this.gearGroup.parent) this.character.add(this.gearGroup);
    const R = 1.1; // half of the normalized height
    const anchors: Record<string, { p: [number, number, number]; size: number }> = {
      face:     { p: [0, 0.42 * R, 0.80 * R], size: 0.62 * R },
      headset:  { p: [0, 0.62 * R, 0.70 * R], size: 0.72 * R },
      head:     { p: [0, 1.22 * R, 0], size: 0.62 * R },
      hand:     { p: [0.80 * R, -0.42 * R, 0.50 * R], size: 0.46 * R },
      hip:      { p: [0.36 * R, -0.12 * R, 0.70 * R], size: 0.36 * R },
      shoulder: { p: [-0.60 * R, 0.50 * R, 0.42 * R], size: 0.44 * R },
      chest:    { p: [0, 0.12 * R, 0.86 * R], size: 0.44 * R },
      pet:      { p: [-0.72 * R, -0.66 * R, 0.55 * R], size: 0.58 * R },
    };
    // Each GLB has a radically different silhouette (sphere, cat, astronaut,
    // bird, ring...). A single bounding-box anchor makes otherwise correct
    // art float beside the body. These profiles are normalized to the same R
    // used above and mirrored in MascotGalleryView.swift.
    const profiles: Record<string, Partial<Record<string, { p: [number, number, number]; size: number }>>> = {
      orb: {
        hand: { p: [0.45 * R, -0.18 * R, 0.76 * R], size: 0.34 * R },
        chest: { p: [0, 0.02 * R, 0.94 * R], size: 0.38 * R },
        head: { p: [0, 0.96 * R, 0.08 * R], size: 0.42 * R },
      },
      byte: {
        hip: { p: [0.32 * R, -0.18 * R, 0.76 * R], size: 0.30 * R },
        face: { p: [0, 0.45 * R, 0.92 * R], size: 0.62 * R },
        hand: { p: [0.53 * R, -0.42 * R, 0.68 * R], size: 0.34 * R },
      },
      kora: {
        // Calibrated against Kora's cat silhouette and mirrored in iOS 13.
        // The previous depth made the right cup look detached at her neck.
        headset: { p: [0, 0.58 * R, 0.64 * R], size: 0.68 * R },
        shoulder: { p: [-0.22 * R, 0.14 * R, 0.78 * R], size: 0.28 * R },
        hand: { p: [0.24 * R, -0.46 * R, 0.80 * R], size: 0.30 * R },
      },
      zip: {
        hand: { p: [0.38 * R, -0.40 * R, 0.76 * R], size: 0.29 * R },
        shoulder: { p: [-0.32 * R, 0.20 * R, 0.72 * R], size: 0.29 * R },
        head: { p: [0, 1.02 * R, 0.08 * R], size: 0.38 * R },
      },
      glitch: { hand: { p: [0.62 * R, -0.34 * R, 0.60 * R], size: 0.38 * R }, chest: { p: [0, 0.05 * R, 0.92 * R], size: 0.36 * R } },
      momo: { hand: { p: [0.58 * R, -0.22 * R, 0.62 * R], size: 0.36 * R }, face: { p: [0, 0.20 * R, 0.94 * R], size: 0.58 * R }, head: { p: [0, 0.98 * R, 0.08 * R], size: 0.40 * R } },
      flux: { hand: { p: [0.58 * R, -0.30 * R, 0.62 * R], size: 0.34 * R }, chest: { p: [0, -0.02 * R, 0.92 * R], size: 0.36 * R }, head: { p: [0, 1.10 * R, 0.08 * R], size: 0.38 * R } },
      rook: { chest: { p: [0, 0.18 * R, 0.94 * R], size: 0.36 * R }, head: { p: [0, 1.06 * R, 0.08 * R], size: 0.38 * R }, hand: { p: [0.60 * R, -0.48 * R, 0.58 * R], size: 0.36 * R } },
      halo: { chest: { p: [0, 0, 0.94 * R], size: 0.40 * R }, shoulder: { p: [-0.66 * R, 0.10 * R, 0.56 * R], size: 0.34 * R }, head: { p: [0, 0.96 * R, 0.08 * R], size: 0.40 * R } },
      axiom: { hand: { p: [0.62 * R, -0.28 * R, 0.62 * R], size: 0.34 * R }, chest: { p: [0, 0.04 * R, 0.94 * R], size: 0.34 * R }, head: { p: [0, 1.00 * R, 0.08 * R], size: 0.38 * R } },
    };
    const profile = profiles[this.avatarId] ?? {};
    const loader = new TextureLoader();
    items.forEach((item, i) => {
      const a = profile[item.slot] ?? anchors[item.slot] ?? anchors.hand;
      const tex = loader.load(item.url);
      tex.colorSpace = SRGBColorSpace;
      this.gearTextures.push(tex);
      // A Sprite always faces the camera, which makes gear visibly detach as
      // the companion turns. A double-sided plane keeps the same cheap PNG
      // art but actually inherits the character's rotation like worn gear.
      const sprite = item.slot === 'pet'
        ? new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
        : new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide }));
      sprite.position.set(a.p[0], a.p[1], a.p[2]);
      sprite.scale.set(a.size, a.size, 1);
      sprite.renderOrder = 10 + i;
      sprite.userData = { slot: item.slot, baseY: a.p[1], spin: !!item.spin, phase: i * 0.7, url: item.url, target: a.p, size: a.size };
      if (item.spin) this.spinners.push(sprite);
      this.gearGroup.add(sprite);
      if (item.glow) {
        const glowMat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide, color: new Color(item.glow), opacity: 0.35, blending: AdditiveBlending });
        const glow = new Mesh(new PlaneGeometry(1, 1), glowMat);
        glow.scale.set(a.size * 1.35, a.size * 1.35, 1);
        glow.position.set(a.p[0], a.p[1], a.p[2] - 0.01);
        glow.renderOrder = 9;
        this.gearGroup.add(glow);
      }
    });
  }

  /**
   * The skin moment: the piece for `url` appears big in front of the
   * companion, flies to its slot and snaps with a pop; the body squashes.
   */
  playEquip(url: string): void {
    const sprite = this.gearGroup.children.find((c) => (c.userData as { url?: string }).url === url) as Mesh | Sprite | undefined;
    if (!sprite) return;
    const d = sprite.userData as { baseY: number; target: [number, number, number]; size: number };
    const start = performance.now();
    const from: [number, number, number] = [0, 0.35 * 1.1, 1.5 * 1.1];
    const dur = 620;
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / dur);
      const e = k < 0.3 ? k / 0.3 : 1; // appear
      const f = k < 0.3 ? 0 : (k - 0.3) / 0.7; // fly
      const ease = 1 - Math.pow(1 - f, 3);
      sprite.position.set(from[0] + (d.target[0] - from[0]) * ease, from[1] + (d.target[1] - from[1]) * ease, from[2] + (d.target[2] - from[2]) * ease);
      const pop = f > 0.85 ? 1 + Math.sin((f - 0.85) / 0.15 * Math.PI) * 0.35 : 1;
      const sc = d.size * (2.2 - 1.2 * ease) * pop;
      sprite.scale.set(sc, sc, 1);
      sprite.material.opacity = e;
      if (k >= 1) { sprite.scale.set(d.size, d.size, 1); sprite.position.set(...d.target); sprite.material.opacity = 1; this.bounce(); return; }
      requestAnimationFrame(step);
    };
    step();
  }

  /** Normalized 0..1 voice level from sources without an AnalyserNode
   *  (e.g. the realtime WebRTC desk). Takes priority over the procedural
   *  mouth but not over a live analyser. */
  setLevel(level: number | null): void {
    this.externalLevel = level;
  }

  /** Normalized pointer position (-1..1) relative to the canvas center */
  setPointer(x: number, y: number): void {
    this.pointer.x = MathUtils.clamp(x, -1.5, 1.5);
    this.pointer.y = MathUtils.clamp(y, -1.5, 1.5);
  }

  /** Squash-and-stretch tap bounce — pure joy, zero utility */
  bounce(): void { this.bounceVel = -4.2; }

  resize(size: number): void { this.renderer?.setSize(size, size); }

  // ---- Per-frame update ----

  private update(now: number): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const t = now / 1000;

    // Accessibility: static pose, no bob/blink/cursor-follow/bounce
    if (this.reduceMotion) {
      this.root.position.y = 0;
      this.root.scale.set(1, 1, 1);
      this.character.rotation.set(0, 0, 0);
      if (this.mouth && this.smile) {
        this.mouth.visible = this.state === 'speaking';
        this.smile.visible = this.state !== 'speaking';
      }
      return;
    }

    // Idle bob + breathing
    // Worn gear: the piece above the head hovers, pets that spin, spin.
    const tNow = performance.now() / 1000;
    for (const child of this.gearGroup.children) {
      const d = child.userData as { slot?: string; baseY?: number; spin?: boolean; phase?: number };
      if (d.slot === 'head' && typeof d.baseY === 'number') child.position.y = d.baseY + Math.sin(tNow * 2.2 + (d.phase ?? 0)) * 0.05;
      if (d.slot === 'pet' && !d.spin && typeof d.baseY === 'number') child.position.y = d.baseY + Math.max(0, Math.sin(tNow * 3.1)) * 0.06;
      if (d.spin) child.rotation.z = tNow * 2.9;
    }
    const bobSpeed = this.state === 'speaking' ? 6 : 1.6;
    const bobAmp = this.state === 'speaking' ? 0.03 : 0.05;
    this.root.position.y = Math.sin(t * bobSpeed) * bobAmp;
    const breathe = 1 + Math.sin(t * 2.1) * 0.012;

    // Tap bounce physics (spring)
    this.bounceVel += (1 - this.squash) * 160 * dt; // spring toward 1
    this.bounceVel *= Math.exp(-9 * dt);            // damping
    this.squash += this.bounceVel * dt;
    const sq = MathUtils.clamp(this.squash, 0.55, 1.35);
    this.root.scale.set((2 - sq) * breathe * 0.94 + 0.06, sq * breathe, (2 - sq) * breathe * 0.94 + 0.06);

    // Voice level (analyser > external level > procedural sine)
    const isProcedural = this.mouth !== null;
    let speakLevel = 0;
    if (this.state === 'speaking') {
      if (this.analyser && this.freqData) {
        this.analyser.getByteFrequencyData(this.freqData);
        let sum = 0;
        for (let i = 0; i < this.freqData.length; i++) sum += this.freqData[i];
        speakLevel = sum / this.freqData.length / 255;
      } else if (this.externalLevel !== null) {
        speakLevel = MathUtils.clamp(this.externalLevel, 0, 1);
      } else {
        speakLevel = 0.3 + 0.3 * Math.abs(Math.sin(t * 7.1)) + 0.2 * Math.abs(Math.sin(t * 12.7));
      }
    }

    // Cursor follow — head turns a bit, pupils a lot (the "alive" trick).
    // GLB avatars have no procedural mouth, so speech reads as puppet talk:
    // a rhythmic nod plus a subtle scale pulse driven by the voice level.
    const glbTalkNod = (!isProcedural && this.state === 'speaking')
      ? Math.sin(t * 9) * 0.05 * (0.3 + speakLevel)
      : 0;
    const targetRotY = this.pointer.x * 0.38;
    const targetRotX = -this.pointer.y * 0.22 + (this.state === 'thinking' ? -0.18 : 0) + glbTalkNod;
    this.character.rotation.y = MathUtils.lerp(this.character.rotation.y, targetRotY, 1 - Math.exp(-8 * dt));
    this.character.rotation.x = MathUtils.lerp(this.character.rotation.x, targetRotX, 1 - Math.exp(-8 * dt));
    if (!isProcedural) {
      const talkScale = this.state === 'speaking' ? 1 + speakLevel * 0.05 : 1;
      this.character.scale.setScalar(MathUtils.lerp(this.character.scale.x, talkScale, 1 - Math.exp(-10 * dt)));
    }
    const pupilX = this.pointer.x * 0.09;
    const pupilY = this.pointer.y * 0.07 + (this.state === 'thinking' ? 0.09 : 0);
    for (const p of this.pupils) {
      p.position.x = MathUtils.lerp(p.position.x, pupilX, 1 - Math.exp(-10 * dt));
      p.position.y = MathUtils.lerp(p.position.y, pupilY, 1 - Math.exp(-10 * dt));
    }

    // Blink
    if (now >= this.blinkAt && this.blinkPhase === 0) this.blinkPhase = 0.0001;
    if (this.blinkPhase > 0) {
      this.blinkPhase += dt * 9;
      const k = this.blinkPhase < 1 ? 1 - this.blinkPhase : this.blinkPhase - 1; // close then open
      this.eyeGroup.scale.y = MathUtils.clamp(k, 0.08, 1);
      if (this.blinkPhase >= 2) {
        this.blinkPhase = 0;
        this.eyeGroup.scale.y = 1;
        this.blinkAt = now + 1800 + Math.random() * 2800;
      }
    }

    // Listening: antenna pulse + slight lean-in
    if (this.antennaTip) {
      const mat = this.antennaTip.material as MeshStandardMaterial;
      mat.emissiveIntensity = this.state === 'listening' ? 0.6 + Math.abs(Math.sin(t * 6)) * 1.6 : 0.9;
    }

    // Mouth: amplitude-driven when speaking (procedural face only)
    if (this.state === 'speaking' && this.mouth && this.smile) {
      this.smile.visible = false;
      this.mouth.visible = true;
      this.mouth.scale.y = 0.1 + speakLevel * 1.5;
      this.mouth.scale.x = 1.15 - speakLevel * 0.35;
    } else if (this.mouth && this.smile) {
      this.mouth.visible = false;
      this.smile.visible = true;
    }

    // Thinking: slow curious sway
    if (this.state === 'thinking') {
      this.character.rotation.z = Math.sin(t * 1.3) * 0.06;
    } else {
      this.character.rotation.z = MathUtils.lerp(this.character.rotation.z, 0, 1 - Math.exp(-6 * dt));
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    disposeObject(this.character);
    if (this.envTexture) {
      this.envTexture.dispose();
      this.envTexture = null;
      this.scene.environment = null;
    }
    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.parentElement?.removeChild(canvas);
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}
