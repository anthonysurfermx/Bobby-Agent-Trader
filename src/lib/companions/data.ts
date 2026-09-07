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
  // ---- Wave 2 (2026-09-07) — the feminine-forward half of the squad.
  // Each one owns a product moment that had no face: market regime, on-chain
  // flows, practice mode, growth, mentorship and probability. Voices are all
  // from FEM_VOICES in api/_lib/tts.ts so the Spanish delivery is gendered
  // correctly; see docs/brand/bobby-character-bible-wave2.md.
  { id: 'iris', label: 'IRIS', role: { en: 'MARKET REGIME', es: 'RÉGIMEN DE MERCADO' }, personality: { en: 'reads the weather of the whole market', es: 'lee el clima de todo el mercado' }, selectLine: { en: 'Let me read the weather first. Today there is wind.', es: 'Déjame leer el clima primero. Hoy hay viento.' }, secretPhrase: { en: 'The regime decides more than the setup does.', es: 'El régimen decide más que el setup.' }, hue: 0.545, requiredLevel: 1, voicePersona: 'sage', evolutionNames: ['IRIS', 'IRIS CLEAR', 'IRIS FRONT', 'IRIS STORM', 'IRIS HORIZON'], palette: 'ice' },
  { id: 'sol', label: 'SOL', role: { en: 'GROWTH', es: 'CRECIMIENTO' }, personality: { en: 'celebrates every step you actually take', es: 'celebra cada paso que sí das' }, selectLine: { en: 'Let us build your world, one earned piece at a time.', es: 'Vamos a construir tu mundo, pieza ganada por pieza ganada.' }, secretPhrase: { en: 'Discipline levels you up. Deposits never did.', es: 'La disciplina te sube de nivel. Los depósitos nunca lo hicieron.' }, hue: 0.115, requiredLevel: 1, voicePersona: 'coral', evolutionNames: ['SOL', 'SOL SPROUT', 'SOL BRANCH', 'SOL CANOPY', 'SOL BLOOM'], palette: 'gold' },
  { id: 'zuri', label: 'ZURI', role: { en: 'ON-CHAIN FLOWS', es: 'FLUJOS ON-CHAIN' }, personality: { en: 'follows the money and tells you where it went', es: 'sigue el dinero y te dice a dónde se fue' }, selectLine: { en: 'Give me a minute. I am following the thread.', es: 'Dame un minuto. Voy siguiendo el hilo.' }, secretPhrase: { en: 'Wallets do not post. They just move.', es: 'Las wallets no publican. Solo se mueven.' }, hue: 0.075, requiredLevel: 1, voicePersona: 'nova', evolutionNames: ['ZURI', 'ZURI TRAIL', 'ZURI SIGNAL', 'ZURI DEPTH', 'ZURI ORACLE'], palette: 'lava' },
  { id: 'mira', label: 'MIRA', role: { en: 'PRACTICE', es: 'PRÁCTICA' }, personality: { en: 'zero pressure, celebrates the attempt', es: 'cero presión, celebra el intento' }, selectLine: { en: 'No money on the line yet. Let us just look.', es: 'Todavía sin dinero de por medio. Nomás vamos viendo.' }, secretPhrase: { en: 'A rehearsal costs nothing. A habit pays forever.', es: 'Un ensayo no cuesta nada. Un hábito paga siempre.' }, hue: 0.505, requiredLevel: 1, voicePersona: 'alloy', evolutionNames: ['MIRA', 'MIRA DRILL', 'MIRA PACE', 'MIRA FORM', 'MIRA STAR'], palette: 'ghost' },
  { id: 'nalu', label: 'NALU', role: { en: 'LIQUIDITY', es: 'LIQUIDEZ' }, personality: { en: 'reads flow like a wave, everything is timing', es: 'lee el flujo como una ola, todo es timing' }, selectLine: { en: 'Not every wave is yours. Let us wait for the good one.', es: 'No toda ola es tuya. Esperemos la buena.' }, secretPhrase: { en: 'You do not fight the current. You time it.', es: 'A la corriente no se le pelea. Se le agarra el tiempo.' }, hue: 0.075, requiredLevel: 1, voicePersona: 'marin', evolutionNames: ['NALU', 'NALU SWELL', 'NALU CREST', 'NALU BARREL', 'NALU TIDE'], palette: 'lava' },
  { id: 'vega', label: 'VEGA', role: { en: 'PROBABILITY', es: 'PROBABILIDAD' }, personality: { en: 'gives you the odds, never the promise', es: 'te da la probabilidad, nunca la promesa' }, selectLine: { en: 'I can give you the probability. Not the promise.', es: 'Te puedo dar la probabilidad. La promesa no.' }, secretPhrase: { en: 'A number without its error bar is a story.', es: 'Un número sin su margen de error es un cuento.' }, hue: 0.115, requiredLevel: 3, voicePersona: 'shimmer', evolutionNames: ['VEGA', 'VEGA SIGMA', 'VEGA CONE', 'VEGA PRIME', 'VEGA ABSOLUTE'], palette: 'gold' },
  { id: 'noor', label: 'NOOR', role: { en: 'MENTORSHIP', es: 'MENTORÍA' }, personality: { en: 'unhurried, firm, has seen every cycle', es: 'sin prisa, firme, ya vio todos los ciclos' }, selectLine: { en: 'Sit down. Let us review the week before the next trade.', es: 'Siéntate. Revisemos la semana antes del próximo trade.' }, secretPhrase: { en: 'I have seen this cycle before. It ended the same way.', es: 'Ya vi este ciclo antes. Terminó igual.' }, hue: 0.115, requiredLevel: 4, voicePersona: 'fable', evolutionNames: ['NOOR', 'NOOR RING', 'NOOR CIRCLE', 'NOOR CROWN', 'NOOR ETERNAL'], palette: 'matrix' },
  { id: 'keo', label: 'KEO', role: { en: 'PATIENCE', es: 'PACIENCIA' }, personality: { en: 'never in a hurry, and never early', es: 'nunca con prisa, y nunca antes de tiempo' }, selectLine: { en: 'Sit with me a minute. The good one always comes.', es: 'Siéntate un minuto. La buena siempre llega.' }, secretPhrase: { en: 'Waiting is not doing nothing. It is the hardest part.', es: 'Esperar no es no hacer nada. Es la parte más difícil.' }, hue: 0.115, requiredLevel: 1, voicePersona: 'mellow', evolutionNames: ['KEO', 'KEO DRIFT', 'KEO GLIDE', 'KEO SOUL', 'KEO ETERNAL'], palette: 'gold' },
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
export const TOOL_ART_AVAILABLE = new Set(['orb', 'byte', 'kora', 'zip', 'glitch', 'momo', 'flux', 'rook', 'halo', 'axiom',
  // Wave 2 art shipped 2026-09-07
  'iris', 'sol', 'zuri', 'mira', 'nalu', 'vega', 'noor', 'keo']);
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
  // ---- Wave 2. Art is not drawn yet, so toolHasArt() is false for these and
  // the UI falls back to the glyph — the same path a missing asset already
  // takes. Without these entries the loadout step reads name.es off undefined
  // and the whole route crashes into the root errorElement (a 404 page).
  iris: [
    T('iris', 1, '◐', 'Regime Dial', 'Dial de régimen', 'Says calm, caution or storm before you read a single candle.', 'Dice calma, cuidado o tormenta antes de que leas una sola vela.'),
    T('iris', 2, '≋', 'Horizon Band', 'Banda de horizonte', 'One thin line for where the whole market is leaning.', 'Una línea delgada para saber hacia dónde se inclina todo el mercado.'),
    T('iris', 3, '❋', 'Golden Forecast', 'Pronóstico dorado', 'Every regime you respected instead of fighting, kept in gold.', 'Cada régimen que respetaste en vez de pelear, guardado en oro.'),
  ],
  sol: [
    T('sol', 1, '⌸', 'Builder Tape', 'Cinta de constructor', 'Measures what you actually finished, never what you planned.', 'Mide lo que sí terminaste, nunca lo que planeaste.'),
    T('sol', 2, '❦', 'Sprout Pin', 'Prendedor de brote', 'Grows one leaf per tier. Only discipline waters it.', 'Le sale una hoja por nivel. Solo la disciplina la riega.'),
    T('sol', 3, '▦', 'Golden Blueprint', 'Plano dorado', 'The plan of a world you built one earned piece at a time.', 'El plano de un mundo que construiste pieza ganada por pieza ganada.'),
  ],
  zuri: [
    T('zuri', 1, '⊙', 'Trail Monocle', 'Monóculo de rastreo', 'Follows one wallet without losing it in the noise.', 'Sigue una wallet sin perderla en el ruido.'),
    T('zuri', 2, '≔', 'Bead Ledger', 'Cuentas de registro', 'One bead per wallet worth watching. No bead is free.', 'Una cuenta por cada wallet que vale la pena mirar. Ninguna es gratis.'),
    T('zuri', 3, '◈', 'Golden Thread', 'Hilo dorado', 'Where the money went, drawn end to end.', 'A dónde se fue el dinero, trazado de punta a punta.'),
  ],
  mira: [
    T('mira', 1, '◷', 'Rehearsal Timer', 'Cronómetro de ensayo', 'Counts the reps, not the wins.', 'Cuenta las repeticiones, no las victorias.'),
    T('mira', 2, '⌗', 'Wireframe Half', 'Mitad de malla', 'The part of you still being drafted. Everyone has one.', 'La parte de ti que todavía es borrador. Todos tenemos una.'),
    T('mira', 3, '★', 'Golden Replay', 'Repetición dorada', 'Every move you rewound until you understood it.', 'Cada jugada que rebobinaste hasta entenderla.'),
  ],
  nalu: [
    T('nalu', 1, '≈', 'Flow Fin', 'Quilla de flujo', 'Feels the current before it shows on the chart.', 'Siente la corriente antes de que se vea en la gráfica.'),
    T('nalu', 2, '⌾', 'Tide Watch', 'Reloj de marea', 'Tells you the wave is not yours yet.', 'Te dice que la ola todavía no es tuya.'),
    T('nalu', 3, '≣', 'Golden Board', 'Tabla dorada', 'Earned by the waves you let pass.', 'Se gana con las olas que dejaste pasar.'),
  ],
  vega: [
    T('vega', 1, '⌁', 'Probability Cone', 'Cono de probabilidad', 'Shows the spread, not a single confident number.', 'Muestra el rango, no un solo número seguro.'),
    T('vega', 2, '◇', 'Error Bar', 'Barra de error', 'The part of the forecast nobody likes to publish.', 'La parte del pronóstico que nadie quiere publicar.'),
    T('vega', 3, '◆', 'Golden Monocle', 'Monóculo dorado', 'Collapses the cone to one number, and shows its cost.', 'Colapsa el cono a un número, y enseña lo que cuesta.'),
  ],
  noor: [
    T('noor', 1, '○', 'First Ring', 'Primer anillo', 'Given for showing up again, not for being right.', 'Se da por volver, no por acertar.'),
    T('noor', 2, '◎', 'Review Ledger', 'Libro de revisión', 'The week read back to you, without flattery.', 'La semana leída de vuelta, sin adulaciones.'),
    T('noor', 3, '⊚', 'Golden Crown', 'Corona dorada', 'The third ring. It is set above your head, never sold.', 'El tercer anillo. Se pone sobre tu cabeza, no se vende.'),
  ],
  keo: [
    T('keo', 1, '≀', 'Set Counter', 'Contador de series', 'Counts the waves you let go before the good one.', 'Cuenta las olas que dejas ir antes de la buena.'),
    T('keo', 2, '⌁', 'Reef Sense', 'Sentido de arrecife', 'Knows what is under the water before you drop in.', 'Sabe qué hay bajo el agua antes de que entres.'),
    T('keo', 3, '≋', 'Golden Patience', 'Paciencia dorada', 'Thirty years of waiting, cast in gold.', 'Treinta años de espera, fundidos en oro.'),
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
  'iris-1': 'hand', 'iris-2': 'face', 'iris-3': 'head',
  'sol-1': 'hand', 'sol-2': 'head', 'sol-3': 'hand',
  'zuri-1': 'headset', 'zuri-2': 'shoulder', 'zuri-3': 'hand',
  'mira-1': 'hand', 'mira-2': 'chest', 'mira-3': 'head',
  'nalu-1': 'hand', 'nalu-2': 'hip', 'nalu-3': 'shoulder',
  'vega-1': 'hand', 'vega-2': 'chest', 'vega-3': 'head',
  'noor-1': 'hand', 'noor-2': 'chest', 'noor-3': 'head',
  'keo-1': 'hand', 'keo-2': 'chest', 'keo-3': 'shoulder',
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
export const PET_ART_AVAILABLE = new Set(['orb', 'byte', 'kora', 'zip', 'glitch', 'momo', 'flux', 'rook', 'halo', 'axiom',
  // Wave 2 art shipped 2026-09-07
  'iris', 'sol', 'zuri', 'mira', 'nalu', 'vega', 'noor', 'keo']);
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
  iris: { en: 'Read her first chart during a crash and noticed everyone was arguing about the wrong thing. Now she reads the weather of the whole market before anyone names a ticker. Says the regime decides more than the setup does.', es: 'Leyó su primera gráfica en un desplome y notó que todos discutían por lo que no era. Ahora lee el clima de todo el mercado antes de que alguien nombre un ticker. Dice que el régimen decide más que el setup.' },
  sol: { en: 'Built her first island out of three earned pieces and refused to buy a fourth. Celebrates the step you actually took, never the one you planned. Discipline levels you up; deposits never did.', es: 'Construyó su primera isla con tres piezas ganadas y se negó a comprar la cuarta. Celebra el paso que sí diste, nunca el que planeaste. La disciplina te sube de nivel; los depósitos nunca lo hicieron.' },
  zuri: { en: 'Started following one wallet out of curiosity and did not stop for two years. Wallets do not post, they just move — and she reads the moving. Give her a minute, she is following the thread.', es: 'Empezó siguiendo una wallet por curiosidad y no paró en dos años. Las wallets no publican, solo se mueven, y ella lee ese movimiento. Dale un minuto, va siguiendo el hilo.' },
  mira: { en: 'Coached herself through a thousand rehearsals before risking a peso. Counts the reps, not the wins. With her there is no money on the line yet, so the only thing you can lose is a bad habit.', es: 'Se entrenó sola con mil ensayos antes de arriesgar un peso. Cuenta las repeticiones, no las victorias. Con ella todavía no hay dinero de por medio, así que lo único que puedes perder es un mal hábito.' },
  nalu: { en: 'Learned to read liquidity the way she reads a swell: you do not fight the current, you time it. Lets nine waves pass to catch the tenth. Not every wave is yours.', es: 'Aprendió a leer la liquidez como lee una marejada: a la corriente no se le pelea, se le agarra el tiempo. Deja pasar nueve olas para tomar la décima. No toda ola es tuya.' },
  vega: { en: 'Quit a desk that wanted certainty and kept the error bars. Gives you the probability, never the promise. A number without its spread, she says, is just a story with a decimal point.', es: 'Dejó una mesa que quería certezas y se quedó con los márgenes de error. Te da la probabilidad, nunca la promesa. Un número sin su rango, dice, es un cuento con punto decimal.' },
  noor: { en: 'Has seen every cycle and remembers how each one ended. Unhurried, firm, hands you a ring for coming back rather than for being right. Sit down: review the week before the next trade.', es: 'Ya vio todos los ciclos y recuerda cómo terminó cada uno. Sin prisa, firme, te da un anillo por volver y no por acertar. Siéntate: revisa la semana antes del próximo trade.' },
  keo: { en: 'Has been paddling out at dawn for thirty years and has never once chased a wave. Sits out the whole set with a smile, then goes on the one nobody else saw. Waiting is not doing nothing, he says. It is the hardest part.', es: 'Lleva treinta años entrando al agua al amanecer y nunca ha perseguido una ola. Deja pasar la serie entera con una sonrisa y luego entra en la que nadie vio. Esperar no es no hacer nada, dice. Es la parte más difícil.' },
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
  iris: { companionId: 'iris', name: { en: 'Cirrus the crane', es: 'Cirrus la grulla' }, emoji: '\u{1F426}', spins: false },
  sol: { companionId: 'sol', name: { en: 'Root the hedgehog', es: 'Root el erizo' }, emoji: '\u{1F994}', spins: false },
  zuri: { companionId: 'zuri', name: { en: 'Trace the fox', es: 'Trace la zorra' }, emoji: '\u{1F98A}', spins: false },
  mira: { companionId: 'mira', name: { en: 'Pace the hare', es: 'Pace la liebre' }, emoji: '\u{1F407}', spins: false },
  nalu: { companionId: 'nalu', name: { en: 'Kai the dolphin', es: 'Kai el delfín' }, emoji: '\u{1F42C}', spins: false },
  vega: { companionId: 'vega', name: { en: 'Sigma the raven', es: 'Sigma el cuervo' }, emoji: '\u{1F426}\u{200D}\u{2B1B}', spins: false },
  noor: { companionId: 'noor', name: { en: 'Elder the tortoise', es: 'Elder la tortuga' }, emoji: '\u{1F422}', spins: false },
  keo: { companionId: 'keo', name: { en: 'Sombra the sea turtle', es: 'Sombra la tortuga marina' }, emoji: '\u{1F422}', spins: false },
};
export function petFor(companionId: string): CompanionPet | null { return PETS[companionId] ?? null; }
export function petUnlocked(xp: number): boolean { return xp >= PET_UNLOCK_XP; }
export function wornGear(companionId: string, xp: number): CompanionTool[] { return toolsFor(companionId).filter((t) => xp >= toolUnlockXP(t.tier)); }
