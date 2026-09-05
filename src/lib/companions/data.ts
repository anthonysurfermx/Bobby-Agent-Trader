// ============================================================
// Companion data pack — a faithful port of the iOS squad (Companion.swift,
// AgentProfile.swift, CompanionTools.swift, LoadoutStep.swift) so the web
// tells the same story with the same names, voices, levels and gear.
// Keep both in sync until this pack is served by an endpoint.
// ============================================================
import type { Bi } from './i18n';

export interface Companion {
  id: string;
  label: string;
  role: Bi;
  personality: Bi;
  selectLine: Bi;
  secretPhrase: Bi;
  /** Identity hue 0..1 (same numbers as iOS). */
  hue: number;
  requiredLevel: number;
  voicePersona: string;
  evolutionNames: string[];
  /** Web-only: palette id in src/lib/mascot.ts and the GLB in public/mascots. */
  palette: string;
}

export const COMPANIONS: Companion[] = [
  { id: 'orb', label: 'BOBBY', role: { en: 'ORB · CORE', es: 'ORB · NÚCLEO' }, personality: { en: 'the core that orchestrates the squad', es: 'el núcleo que orquesta al squad' }, selectLine: { en: 'Ready. We read the market together, calmly.', es: 'Listo. Leemos el mercado juntos, con calma.' }, secretPhrase: { en: 'The market rewards who waits better, not who runs faster.', es: 'El mercado premia al que espera mejor, no al que corre más.' }, hue: 0.415, requiredLevel: 1, voicePersona: 'ash', evolutionNames: ['BOBBY', 'BOBBY LINK', 'BOBBY CORE', 'BOBBY PRIME', 'BOBBY OMEGA'], palette: 'matrix' },
  { id: 'byte', label: 'BYTE', role: { en: 'PLAIN SPEAK', es: 'VOZ SIMPLE' }, personality: { en: 'explains it without the jargon', es: 'te lo explica sin tecnicismos' }, selectLine: { en: 'Hey. I keep it simple, no jargon.', es: 'Hola. Yo te lo digo fácil, sin rollos.' }, secretPhrase: { en: 'If you cannot explain it simply, do not trade it.', es: 'Si no lo puedes explicar simple, no lo operes.' }, hue: 0.415, requiredLevel: 1, voicePersona: 'ballad', evolutionNames: ['BYTE', 'KILOBYTE', 'MEGABYTE', 'GIGABYTE', 'TERABYTE'], palette: 'matrix' },
  { id: 'kora', label: 'KORA', role: { en: 'CONVERSATION', es: 'CONVERSACIÓN' }, personality: { en: 'talks markets like your best friend', es: 'platica del mercado como tu bestie' }, selectLine: { en: 'I am here. Tell me what is on your mind.', es: 'Aquí andamos. Cuéntame qué traes en mente.' }, secretPhrase: { en: 'The best decisions come from better questions.', es: 'Las mejores decisiones salen de las buenas preguntas.' }, hue: 0.415, requiredLevel: 1, voicePersona: 'coral', evolutionNames: ['KORA', 'KORA ECO', 'KORA AURORA', 'KORA NOVA', 'KORA SUPERNOVA'], palette: 'matrix' },
  { id: 'zip', label: 'ZIP', role: { en: 'ALERTS', es: 'ALERTAS' }, personality: { en: 'fast to alert you, never to rush you', es: 'rápido para avisarte, nunca para apurarte' }, selectLine: { en: 'On it. If something moves, I will tell you.', es: 'Al tiro. Si algo se mueve, te aviso yo.' }, secretPhrase: { en: 'Speed is for alerting, not for deciding.', es: 'La velocidad sirve para avisar, no para decidir.' }, hue: 0.415, requiredLevel: 1, voicePersona: 'sage', evolutionNames: ['ZIP', 'ZIP PULSE', 'ZIP STORM', 'ZIP SONIC', 'ZIP LIGHTSPEED'], palette: 'matrix' },
  { id: 'glitch', label: 'GLITCH', role: { en: 'RED TEAM', es: 'RED TEAM' }, personality: { en: 'questions you before you get excited', es: 'te cuestiona antes de que te emociones' }, selectLine: { en: 'Sure about that? Let me break your thesis first.', es: '¿Seguro? Déjame romper tu tesis primero.' }, secretPhrase: { en: 'Every thesis deserves an enemy before your money.', es: 'Toda tesis merece un enemigo antes que tu dinero.' }, hue: 0.745, requiredLevel: 2, voicePersona: 'cedar', evolutionNames: ['GLITCH', 'GLITCH EDGE', 'GLITCH PROBE', 'GLITCH BREAKER', 'GLITCH ZERO'], palette: 'plasma' },
  { id: 'momo', label: 'MOMO', role: { en: 'EXPLORATION', es: 'EXPLORACIÓN' }, personality: { en: 'explores with you, never afraid to ask', es: 'curiosea contigo sin miedo a preguntar' }, selectLine: { en: 'What if we explore something new today?', es: '¿Y si exploramos algo nuevo hoy?' }, secretPhrase: { en: 'Exploring costs no capital. Executing does.', es: 'Explorar no cuesta capital. Ejecutar sí.' }, hue: 0.745, requiredLevel: 2, voicePersona: 'marin', evolutionNames: ['MOMO', 'MOMO SCOUT', 'MOMO VOYAGER', 'MOMO COSMOS', 'MOMO INFINITE'], palette: 'plasma' },
  { id: 'flux', label: 'FLUX', role: { en: 'SIGNALS', es: 'SEÑALES' }, personality: { en: 'finds the context before the noise', es: 'detecta el contexto antes que el ruido' }, selectLine: { en: 'Signal detected. Context first, noise later.', es: 'Señal detectada. Contexto primero, ruido después.' }, secretPhrase: { en: 'A signal without context is just pretty noise.', es: 'Una señal sin contexto es solo ruido bonito.' }, hue: 0.505, requiredLevel: 3, voicePersona: 'alloy', evolutionNames: ['FLUX', 'FLUX WAVE', 'FLUX RADAR', 'FLUX QUANTUM', 'FLUX SIGMA'], palette: 'ice' },
  { id: 'rook', label: 'ROOK', role: { en: 'THESIS', es: 'TESIS' }, personality: { en: 'builds the plan: entry, stop, invalidation', es: 'arma el plan: entrada, stop, invalidación' }, selectLine: { en: 'Thesis in progress. Entry, stop, invalidation.', es: 'Tesis en construcción. Entrada, stop, invalidación.' }, secretPhrase: { en: 'With no written invalidation it is not a thesis: it is hope.', es: 'Sin invalidación escrita no es tesis: es esperanza.' }, hue: 0.415, requiredLevel: 3, voicePersona: 'onyx', evolutionNames: ['ROOK', 'ROOK GAMBIT', 'ROOK TACTICIAN', 'ROOK MASTER', 'GRANDMASTER'], palette: 'matrix' },
  { id: 'halo', label: 'HALO', role: { en: 'RISK GATE', es: 'RISK GATE' }, personality: { en: 'celebrates not trading with you', es: 'celebra contigo el no operar' }, selectLine: { en: 'Protecting capital today also counts as winning.', es: 'Hoy proteger capital también cuenta como ganar.' }, secretPhrase: { en: 'No setup yet. Capital protected.', es: 'No setup yet. Capital protected.' }, hue: 0.56, requiredLevel: 4, voicePersona: 'shimmer', evolutionNames: ['HALO', 'HALO SHIELD', 'HALO WARDEN', 'HALO AEGIS', 'HALO SANCTUM'], palette: 'ghost' },
  { id: 'axiom', label: 'AXIOM', role: { en: 'TRACK RECORD', es: 'TRACK RECORD' }, personality: { en: 'remembers everything so you can verify', es: 'recuerda todo para que compruebes' }, selectLine: { en: 'Everything gets recorded. Verifying is the edge.', es: 'Todo queda registrado. Comprobar es la ventaja.' }, secretPhrase: { en: 'On-chain memory does not argue: it verifies.', es: 'La memoria on-chain no discute: comprueba.' }, hue: 0.115, requiredLevel: 5, voicePersona: 'fable', evolutionNames: ['AXIOM', 'AXIOM PROOF', 'AXIOM LEDGER', 'AXIOM ORACLE', 'AXIOM ETERNAL'], palette: 'gold' },
];

export function getCompanion(id: string | null | undefined): Companion | null {
  return COMPANIONS.find((c) => c.id === id) ?? null;
}

/** The identity tint as CSS, same hue math as the iOS `tint`. */
export function tintFor(c: Companion, alpha = 1): string {
  return `hsla(${Math.round(c.hue * 360)}, 70%, 62%, ${alpha})`;
}

export function companionName(c: Companion, level: number): string {
  const i = Math.max(0, Math.min(c.evolutionNames.length - 1, level - 1));
  return c.evolutionNames[i];
}

export interface CompanionLevel { number: number; name: string; minXP: number }

export const LEVELS: CompanionLevel[] = [
  { number: 1, name: 'SPAWNED', minXP: 0 },
  { number: 2, name: 'LOCKED IN', minXP: 50 },
  { number: 3, name: 'MARKET READER', minXP: 150 },
  { number: 4, name: 'RISK GUARDIAN', minXP: 400 },
  { number: 5, name: 'ON-CHAIN LEGEND', minXP: 1000 },
];

export function levelFor(xp: number): CompanionLevel {
  return [...LEVELS].reverse().find((l) => xp >= l.minXP) ?? LEVELS[0];
}
export function nextLevelFor(xp: number): CompanionLevel | null {
  return LEVELS.find((l) => l.minXP > xp) ?? null;
}

/** How the companion speaks at each level — the same character, more earned confidence. */
export const LEVEL_TONE: Record<number, Bi> = {
  1: { en: '', es: '' },
  2: { en: ' We are finding our rhythm.', es: ' Ya agarramos ritmo.' },
  3: { en: ' After this many reads, I know your style.', es: ' Después de tantas lecturas, ya te conozco el estilo.' },
  4: { en: ' And above all: we protect the risk.', es: ' Y antes que nada: cuidamos el riesgo.' },
  5: { en: ' We have a track record now. Here we verify, we do not promise.', es: ' Ya llevamos historial. Aquí se comprueba, no se promete.' },
};

export type VibeId = 'chill' | 'directo' | 'pro';
export interface Vibe { id: VibeId; label: Bi; desc: Bi; sample: Bi; /** id the TTS endpoint understands */ server: 'wise' | 'direct' | 'analytical' }

export const VIBES: Vibe[] = [
  { id: 'chill', label: { en: 'Chill', es: 'Chill' }, desc: { en: 'laid back, like a friend who actually knows', es: 'relajado, como tu compa que sí sabe' }, sample: { en: 'Alright — bitcoin is at sixty four thousand, quiet day.', es: 'Va — bitcoin anda en sesenta y cuatro mil, tranquilo el día.' }, server: 'wise' },
  { id: 'directo', label: { en: 'Direct', es: 'Directo' }, desc: { en: 'no fluff, straight data', es: 'cero rodeos, puro dato' }, sample: { en: 'Bitcoin: sixty four thousand. Uptrend. Period.', es: 'Bitcoin: sesenta y cuatro mil. Tendencia alcista. Punto.' }, server: 'direct' },
  { id: 'pro', label: { en: 'Pro', es: 'Pro' }, desc: { en: 'trading desk, technical', es: 'mesa de dinero, técnico' }, sample: { en: 'Bitcoin trades at sixty four thousand with its bullish structure intact.', es: 'Bitcoin cotiza en sesenta y cuatro mil con estructura alcista intacta.' }, server: 'analytical' },
];

export function getVibe(id: string | null | undefined): Vibe { return VIBES.find((v) => v.id === id) ?? VIBES[1]; }

// ---- Gear: three tools per companion; first read, then every 100 XP, the last golden ----

export interface CompanionTool { companionId: string; tier: 1 | 2 | 3; name: Bi; lore: Bi; glyph: string }

export function toolUnlockXP(tier: number): number { return tier === 1 ? 1 : (tier - 1) * 100; }
export function toolArt(tool: CompanionTool): string { return `/tools/tool_${tool.companionId}_${tool.tier}.png`; }
/** Every companion has Higgsfield art (tools + pet); the glyph path stays as a fallback for new companions. */
export const TOOL_ART_AVAILABLE = new Set(['orb', 'byte', 'kora', 'zip', 'glitch', 'momo', 'flux', 'rook', 'halo', 'axiom']);
export function toolHasArt(tool: CompanionTool): boolean { return TOOL_ART_AVAILABLE.has(tool.companionId); }
export function toolTierLabel(tier: number): Bi {
  return tier === 1 ? { en: 'COMMON', es: 'COMÚN' } : tier === 2 ? { en: 'RARE', es: 'RARO' } : { en: 'GOLDEN', es: 'DORADO' };
}

const T = (companionId: string, tier: 1 | 2 | 3, glyph: string, en: string, es: string, loreEn: string, loreEs: string): CompanionTool =>
  ({ companionId, tier, glyph, name: { en, es }, lore: { en: loreEn, es: loreEs } });

export const TOOLS: Record<string, CompanionTool[]> = {
  orb: [
    T('orb', 1, '◷', 'Patience Chronometer', 'Cronómetro de paciencia', 'Counts the candles you did not chase.', 'Cuenta las velas que no perseguiste.'),
    T('orb', 2, '✧', '4H Trend Compass', 'Brújula de tendencia 4H', 'Points where the structure goes, not where the noise does.', 'Apunta hacia donde va la estructura, no el ruido.'),
    T('orb', 3, '◉', 'Omega Core', 'Núcleo Omega', "Bobby's own heart. You earned it by waiting better.", 'El corazón del propio Bobby. Te lo ganaste esperando mejor.'),
  ],
  byte: [
    T('byte', 1, '▤', 'Market Translator', 'Traductor de mercado', "Turns 'RSI divergence' into words you would say to a friend.", "Convierte 'divergencia de RSI' en palabras que le dirías a un amigo."),
    T('byte', 2, '◎', 'Anti-Hype Goggles', 'Gafas anti-humo', "Filters gurus, threads and 'trust me bro' out of the picture.", "Filtra gurús, hilos y 'confía en mí' de la escena."),
    T('byte', 3, '▣', 'Golden Codex', 'Códice dorado', 'Every read you ever explained simply, bound in gold.', 'Cada lectura que explicaste simple, encuadernada en oro.'),
  ],
  kora: [
    T('kora', 1, '◠', 'Radar Headset', 'Auriculares radar', 'Hears the desk before the crowd does.', 'Escucha el desk antes que la multitud.'),
    T('kora', 2, '⌔', 'Gossip Antenna', 'Antena de chisme', 'Picks up what the market is whispering, with receipts.', 'Capta lo que el mercado susurra, con pruebas.'),
    T('kora', 3, '♪', 'Golden Mic', 'Micrófono dorado', 'When Kora speaks with this, the whole squad listens.', 'Cuando Kora habla con esto, todo el squad escucha.'),
  ],
  zip: [
    T('zip', 1, '◔', '15M Stopwatch', 'Cronómetro 15M', 'Fifteen minutes. That is all Zip needs to notice.', 'Quince minutos. Es todo lo que Zip necesita para notarlo.'),
    T('zip', 2, '⬡', 'Alert Beacon', 'Baliza de alertas', 'Lights up when something moves. Never for nothing.', 'Se enciende cuando algo se mueve. Nunca en vano.'),
    T('zip', 3, '⚡', 'Golden Bolt', 'Rayo dorado', 'Speed, forged. The stop is always within reach.', 'Velocidad forjada. El stop siempre a la mano.'),
  ],
  glitch: [
    T('glitch', 1, '⚒', 'Thesis Hammer', 'Martillo de tesis', 'Hits every idea once before the market does.', 'Golpea cada idea una vez antes que el mercado.'),
    T('glitch', 2, '✕', 'Refutation Blade', 'Hoja de refutación', 'Cuts the argument that would have cost you.', 'Corta el argumento que te habría costado.'),
    T('glitch', 3, '◐', 'Golden Counter', 'Contra dorada', 'Survive Glitch, survive the candle.', 'Sobrevive a Glitch, sobrevive a la vela.'),
  ],
  momo: [
    T('momo', 1, '▦', "Explorer's Map", 'Mapa de exploración', 'Marks the corners nobody is watching yet.', 'Marca los rincones que nadie mira todavía.'),
    T('momo', 2, '◫', 'Long-Range Binoculars', 'Binoculares de largo alcance', 'Sees tokenized stocks and new listings before the crowd.', 'Ve acciones tokenizadas y listados nuevos antes que la multitud.'),
    T('momo', 3, '◈', 'Golden Lens', 'Lente dorado', 'Finds signal in places that look like noise.', 'Encuentra señal donde parece ruido.'),
  ],
  flux: [
    T('flux', 1, '∿', 'Tuning Fork', 'Diapasón', 'Rings when an indicator is off-key.', 'Suena cuando un indicador desafina.'),
    T('flux', 2, '≋', 'Signal Score', 'Partitura de señales', 'RSI, EMA and funding on one staff.', 'RSI, EMA y funding en un solo pentagrama.'),
    T('flux', 3, '♫', 'Golden Note', 'Nota dorada', "Perfect pitch for the market's rhythm.", 'Oído absoluto para el ritmo del mercado.'),
  ],
  rook: [
    T('rook', 1, '▩', 'Thesis Board', 'Tablero de tesis', 'Entry, stop, invalidation. Three squares, no roulette.', 'Entrada, stop, invalidación. Tres casillas, nada de ruleta.'),
    T('rook', 2, '♜', "Rook's Crown", 'Corona de torre', 'Thinks three candles ahead.', 'Piensa tres velas adelante.'),
    T('rook', 3, '♛', 'Golden Board', 'Tablero dorado', 'The whole game, seen at once.', 'Todo el juego, visto de una vez.'),
  ],
  halo: [
    T('halo', 1, '◇', 'Capital Shield', 'Escudo de capital', 'Blocks the trade that was not there.', 'Bloquea el trade que no estaba.'),
    T('halo', 2, '◈', 'Risk Gate', 'Puerta de riesgo', 'Only clean setups get through.', 'Solo pasan los setups limpios.'),
    T('halo', 3, '◆', 'Golden Halo', 'Halo dorado', 'NO TRADE, made legendary.', 'NO TRADE, hecho leyenda.'),
  ],
  axiom: [
    T('axiom', 1, '≡', 'Ledger', 'Libro mayor', 'Every call written down.', 'Cada llamada queda escrita.'),
    T('axiom', 2, '⛓', 'Chain Link', 'Eslabón', 'Anchors the record where anyone can check it.', 'Ancla el historial donde cualquiera puede revisarlo.'),
    T('axiom', 3, '✪', 'Golden Seal', 'Sello dorado', 'Verified, not promised.', 'Comprobado, no prometido.'),
  ],
};

export function toolsFor(companionId: string): CompanionTool[] { return TOOLS[companionId] ?? []; }

/** Where each piece sits on the body — goggles on the face, radio on the hip, codex in the hand, halo above the head. */
export type BodySlot = 'face' | 'headset' | 'head' | 'hand' | 'hip' | 'shoulder' | 'chest';
export const TOOL_SLOTS: Record<string, BodySlot> = {
  'orb-1': 'hand', 'orb-2': 'chest', 'orb-3': 'head',
  'byte-1': 'hip', 'byte-2': 'face', 'byte-3': 'hand',
  'kora-1': 'headset', 'kora-2': 'shoulder', 'kora-3': 'hand',
  'zip-1': 'hand', 'zip-2': 'shoulder', 'zip-3': 'head',
  'glitch-1': 'hand', 'glitch-2': 'hand', 'glitch-3': 'chest',
  'momo-1': 'hand', 'momo-2': 'face', 'momo-3': 'head',
  'flux-1': 'hand', 'flux-2': 'chest', 'flux-3': 'head',
  'rook-1': 'chest', 'rook-2': 'head', 'rook-3': 'hand',
  'halo-1': 'chest', 'halo-2': 'shoulder', 'halo-3': 'head',
  'axiom-1': 'hand', 'axiom-2': 'chest', 'axiom-3': 'head',
};
export function toolSlot(tool: CompanionTool): BodySlot { return TOOL_SLOTS[`${tool.companionId}-${tool.tier}`] ?? 'hand'; }
export const SLOT_LABEL: Record<BodySlot, Bi> = {
  face: { en: 'ON THE FACE', es: 'EN LA CARA' },
  headset: { en: 'ON THE EARS', es: 'EN LAS OREJAS' },
  head: { en: 'ABOVE THE HEAD', es: 'SOBRE LA CABEZA' },
  hand: { en: 'IN THE HAND', es: 'EN LA MANO' },
  hip: { en: 'ON THE HIP', es: 'EN LA CADERA' },
  shoulder: { en: 'ON THE SHOULDER', es: 'EN EL HOMBRO' },
  chest: { en: 'ON THE CHEST', es: 'EN EL PECHO' },
};
/** A sprite for items without art: the glyph on a tinted disc, as a data URL (cached). */
const glyphCache = new Map<string, string>();
export function glyphSprite(glyph: string, tint: string): string {
  const key = `${glyph}|${tint}`;
  const hit = glyphCache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  if (!g) return '';
  g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2);
  g.fillStyle = `${tint}33`; g.fill();
  g.lineWidth = 8; g.strokeStyle = tint; g.stroke();
  g.font = '130px system-ui, "Apple Color Emoji", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = tint; g.fillText(glyph, 128, 140);
  const url = c.toDataURL('image/png');
  glyphCache.set(key, url);
  return url;
}
export const PET_ART_AVAILABLE = new Set(['orb', 'byte', 'kora', 'zip', 'glitch', 'momo', 'flux', 'rook', 'halo', 'axiom']);
export function petArt(companionId: string): string | null { return PET_ART_AVAILABLE.has(companionId) ? `/pets/pet_${companionId}.png` : null; }
export function newlyUnlockedTools(companionId: string, fromXP: number, toXP: number): CompanionTool[] {
  return toolsFor(companionId).filter((tool) => fromXP < toolUnlockXP(tool.tier) && toXP >= toolUnlockXP(tool.tier));
}

// ---- Loadout (onboarding step 3) ----

export interface LoadoutGear { id: string; glyph: string; title: Bi; line: Bi }

export const LOADOUT_GEAR: LoadoutGear[] = [
  { id: 'radar', glyph: '((·))', title: { en: 'LIVE RADAR', es: 'RADAR EN VIVO' }, line: { en: 'Real OKX and Yahoo candles. No delay, no smoke.', es: 'Velas reales de OKX y Yahoo. Sin retraso, sin humo.' } },
  { id: 'shield', glyph: '⛨', title: { en: 'NO TRADE SHIELD', es: 'ESCUDO NO TRADE' }, line: { en: 'No clean setup? It blocks. Protecting capital also scores.', es: '¿No hay setup limpio? Bloquea. Proteger capital también suma.' } },
  { id: 'lock', glyph: '🔒', title: { en: 'VAULT LOCK', es: 'CANDADO' }, line: { en: 'Never touches your money or your exchange. Analysis only.', es: 'Nunca toca tu dinero ni tu exchange. Solo análisis.' } },
  { id: 'core', glyph: '⚡', title: { en: 'DISCIPLINE CORE', es: 'NÚCLEO DE DISCIPLINA' }, line: { en: 'Levels up with your discipline, never with your volume.', es: 'Sube de nivel con tu disciplina, nunca con tu volumen.' } },
];

export const ORIGIN_STORY: Record<string, Bi> = {
  orb: { en: 'Born in a Base node, raised on 4H candles at 3 a.m. Never runs — waits. Today it drops with you to hunt setups that actually hold.', es: 'Nació en un nodo de Base y creció leyendo velas de 4H a las 3 a.m. No corre: espera. Hoy sale contigo a cazar setups que sí aguantan.' },
  byte: { en: 'Grew up in a trading forum full of gurus and came out immune to hype. Translates the market into plain words. Mission: you never trade what you cannot explain.', es: 'Creció en un foro de trading lleno de gurús y salió inmune al humo. Traduce el mercado a español de a pie. Misión: que nunca operes lo que no puedas explicar.' },
  kora: { en: 'The friend who actually read the whitepaper. Talks markets like gossip: full detail, zero fear. Your social radar on the desk.', es: 'La compa que sí leyó el whitepaper. Habla de mercados como de chisme: con detalle y sin miedo. Tu radar social en el desk.' },
  zip: { en: 'Lives on the 15-minute chart. If it moved, ZIP already saw it. Fast alerts, no drama, a stop always within reach.', es: 'Vive en la gráfica de 15 minutos. Si algo se movió, ZIP ya lo vio. Alertas rápidas, cero drama y un stop siempre a la mano.' },
  glitch: { en: 'The Red Team. Its job is to break your thesis before the market does. If it survives GLITCH, it survives the candle.', es: 'El Red Team. Su trabajo es romper tu tesis antes que el mercado. Si sobrevive a GLITCH, sobrevive a la vela.' },
  momo: { en: 'Explores the weird corners: new tokens, tokenized stocks, whatever nobody is watching yet.', es: 'Explora los rincones raros: tokens nuevos, acciones tokenizadas, lo que nadie mira todavía.' },
  flux: { en: 'Reads signals like sheet music: RSI, EMA, funding. When something is off-key, it says so.', es: 'Lee señales como partituras: RSI, EMA, funding. Cuando algo desafina, lo dice.' },
  rook: { en: 'Thinks in theses, not candles. Entry, stop, invalidation. Chess, not roulette.', es: 'Piensa en tesis, no en velas. Entrada, stop, invalidación. Ajedrez, no ruleta.' },
  halo: { en: 'The shield. Guards your capital when the setup is not there. Its NO TRADE also wins.', es: 'El escudo. Cuida tu capital cuando el setup no está. Su NO TRADE también gana.' },
  axiom: { en: 'Keeps the track record on-chain. Every call gets written down and anyone can challenge it.', es: 'Guarda el track record on-chain. Cada llamada queda escrita y cualquiera puede retarla.' },
};

export const DEFAULT_QUICK_ACCESS = ['BTC', 'NVDA', 'ETH'];

// ---- Pets: one per companion, unlock at 300 XP; the panda spins ----

export interface CompanionPet { companionId: string; name: Bi; emoji: string; spins: boolean }
export const PET_UNLOCK_XP = 500;
export const PETS: Record<string, CompanionPet> = {
  orb: { companionId: 'orb', name: { en: 'Spin the panda', es: 'Panda giratorio' }, emoji: '🐼', spins: true },
  byte: { companionId: 'byte', name: { en: 'Bit the dog', es: 'Bit el perro' }, emoji: '🐶', spins: false },
  kora: { companionId: 'kora', name: { en: 'Nova the cat', es: 'Nova la gata' }, emoji: '🐱', spins: false },
  zip: { companionId: 'zip', name: { en: 'Turbo the monkey', es: 'Turbo el mono' }, emoji: '🐵', spins: false },
  glitch: { companionId: 'glitch', name: { en: 'Bug the gecko', es: 'Bug el geco' }, emoji: '🦎', spins: false },
  momo: { companionId: 'momo', name: { en: 'Ink the octopus', es: 'Ink el pulpo' }, emoji: '🐙', spins: false },
  flux: { companionId: 'flux', name: { en: 'Echo the parrot', es: 'Echo el loro' }, emoji: '🦜', spins: false },
  rook: { companionId: 'rook', name: { en: 'Sage the owl', es: 'Sage el búho' }, emoji: '🦉', spins: false },
  halo: { companionId: 'halo', name: { en: 'Peace the dove', es: 'Paz la paloma' }, emoji: '🕊️', spins: false },
  axiom: { companionId: 'axiom', name: { en: 'Ledger the turtle', es: 'Ledger la tortuga' }, emoji: '🐢', spins: false },
};
export function petFor(companionId: string): CompanionPet | null { return PETS[companionId] ?? null; }
export function petUnlocked(xp: number): boolean { return xp >= PET_UNLOCK_XP; }
export function wornGear(companionId: string, xp: number): CompanionTool[] { return toolsFor(companionId).filter((t) => xp >= toolUnlockXP(t.tier)); }
