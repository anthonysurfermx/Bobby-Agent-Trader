import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  AmbientLight,
  PointLight,
  Mesh,
  Group,
} from 'three';
import {
  generateAvatarParams,
  buildAvatarGeometry,
  buildAvatarMaterials,
  type AvatarParams,
} from './AvatarShapeGenerator';

const RENDER_SIZE = 80;

export class AvatarSceneManager {
  private renderer: WebGLRenderer | null = null;
  private scene: Scene;
  private camera: PerspectiveCamera;
  private currentGroup: Group | null = null;
  private currentSlug: string | null = null;
  private animationId: number | null = null;
  private currentParams: AvatarParams | null = null;

  constructor() {
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.z = 2.5;
  }

  private initRenderer(): boolean {
    if (this.renderer) return true;

    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return false;

      this.renderer = new WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(RENDER_SIZE, RENDER_SIZE);
      this.renderer.setClearColor(0x000000, 0);

      // Lighting
      const ambient = new AmbientLight(0xffffff, 0.6);
      this.scene.add(ambient);

      const pointLight = new PointLight(0xffffff, 1.2, 10);
      pointLight.position.set(2, 2, 3);
      this.scene.add(pointLight);

      const backLight = new PointLight(0x6366f1, 0.5, 10);
      backLight.position.set(-2, -1, -2);
      this.scene.add(backLight);

      return true;
    } catch {
      return false;
    }
  }

  private buildGroup(slug: string): Group {
    const params = generateAvatarParams(slug);
    this.currentParams = params;
    const geometry = buildAvatarGeometry(params);
    const materials = buildAvatarMaterials(params);
    const group = new Group();

    // Main mesh
    const mainMesh = new Mesh(geometry, materials[0]);
    group.add(mainMesh);

    // Wireframe overlay
    if (materials[1]) {
      const wireGeometry = buildAvatarGeometry(params);
      const wireMesh = new Mesh(wireGeometry, materials[1]);
      wireMesh.scale.setScalar(1.02);
      group.add(wireMesh);
    }

    return group;
  }

  private clearGroup(): void {
    if (!this.currentGroup) return;
    this.currentGroup.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    this.scene.remove(this.currentGroup);
    this.currentGroup = null;
    this.currentParams = null;
  }

  renderStatic(slug: string, size = RENDER_SIZE): string | null {
    if (!this.initRenderer() || !this.renderer) return null;

    this.renderer.setSize(size, size);
    this.clearGroup();

    const group = this.buildGroup(slug);
    // Set a nice initial rotation
    group.rotation.x = 0.4;
    group.rotation.y = 0.6;
    this.scene.add(group);
    this.currentGroup = group;

    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    this.clearGroup();
    return dataUrl;
  }

  renderBatch(slugs: string[], size = RENDER_SIZE): Map<string, string> {
    const results = new Map<string, string>();
    for (const slug of slugs) {
      const dataUrl = this.renderStatic(slug, size);
      if (dataUrl) results.set(slug, dataUrl);
    }
    return results;
  }

  attachLiveCanvas(container: HTMLElement, slug: string): void {
    if (!this.initRenderer() || !this.renderer) return;

    this.stopAnimation();
    this.clearGroup();

    const rect = container.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    this.renderer.setSize(size, size);

    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '10';
    canvas.style.borderRadius = '8px';

    // Build the avatar
    const group = this.buildGroup(slug);
    group.rotation.x = 0.4;
    group.rotation.y = 0.6;
    this.scene.add(group);
    this.currentGroup = group;
    this.currentSlug = slug;

    // Render one frame before showing (avoid flash)
    this.renderer.render(this.scene, this.camera);
    canvas.style.opacity = '0';
    container.appendChild(canvas);

    // Fade in on next frame
    requestAnimationFrame(() => {
      canvas.style.transition = 'opacity 0.15s ease';
      canvas.style.opacity = '1';
    });

    // Start rotation animation
    const params = this.currentParams!;
    const [rx, ry, rz] = params.rotationBias;

    const animate = () => {
      if (!this.currentGroup) return;
      this.currentGroup.rotation.x += 0.008 * rx;
      this.currentGroup.rotation.y += 0.012 * ry;
      this.currentGroup.rotation.z += 0.004 * rz;
      this.renderer!.render(this.scene, this.camera);
      this.animationId = requestAnimationFrame(animate);
    };
    this.animationId = requestAnimationFrame(animate);
  }

  detachLiveCanvas(): void {
    this.stopAnimation();
    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.style.transition = '';
      canvas.style.opacity = '';
      if (canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
    }
    this.clearGroup();
    this.currentSlug = null;
  }

  private stopAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  get isSupported(): boolean {
    return this.initRenderer();
  }

  dispose(): void {
    this.stopAnimation();
    this.clearGroup();
    if (this.renderer) {
      this.renderer.dispose();
      const canvas = this.renderer.domElement;
      if (canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
      this.renderer = null;
    }
  }
}
