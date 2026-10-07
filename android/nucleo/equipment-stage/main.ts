import { MascotScene } from './MascotScene';
import { getAvatar } from './mascot';

type Config = { companionId: string; locked: boolean; reducedMotion: boolean; active: boolean; attachments: Array<{ url: string; slot: string; spin?: boolean; glow?: string }> };
const host = document.getElementById('stage')!;
const scene = new MascotScene();
let status = 'loading';
let currentId: string | null = null;
let currentConfig: Config | null = null;
const available = scene.init(host, Math.max(1, Math.min(innerWidth, innerHeight)));
if (!available) status = 'failed';
scene.onReady = ready => { status = ready ? 'ready' : 'failed'; };
scene.onContextLost = () => { status = 'failed'; };

function configure(config: Config) {
  const avatar = getAvatar(config.companionId);
  if (!avatar || !available) { status = 'failed'; return; }
  scene.setActive(config.active !== false);
  scene.setReducedMotion(config.reducedMotion === true);
  scene.setStatue(config.locked === true);
  if (currentId !== config.companionId) {
    currentId = config.companionId;
    status = 'loading';
    scene.setLook({ avatar: config.companionId, body: avatar.palette, eyes: 'round', accessory: 'none' });
  }
  // Kotlin only supplies the real earned/equipped catalogue, with local approved image paths.
  scene.setAttachments((config.attachments || []).filter(item => /^\/assets\/equipment\/(tool_[a-z]+_[123]|pet_[a-z]+)\.png$/.test(item.url)));
  currentConfig = config;
}

const api = { configure, status: () => status, snapshot: () => ({ status, companionId: currentId, attachmentURLs: (currentConfig?.attachments || []).map(item => item.url), reducedMotion: !!currentConfig?.reducedMotion, active: currentConfig?.active !== false }), dispose: () => scene.dispose() };
(window as unknown as { equipmentStage: typeof api }).equipmentStage = api;
window.addEventListener('resize', () => scene.resize(Math.max(1, Math.min(innerWidth, innerHeight))));
window.addEventListener('pagehide', () => scene.dispose(), { once: true });
host.addEventListener('pointermove', event => {
  if (currentId === null) return;
  const box = host.getBoundingClientRect();
  scene.setPointer((event.clientX - box.left) / Math.max(1, box.width) * 2 - 1, (event.clientY - box.top) / Math.max(1, box.height) * 2 - 1);
});
host.addEventListener('pointerup', () => scene.bounce());
