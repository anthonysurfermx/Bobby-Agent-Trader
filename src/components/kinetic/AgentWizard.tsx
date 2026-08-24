// ============================================================
// AgentWizard — character-creator onboarding (video-game style)
// Benchmark-driven redesign (Cleo/Duolingo/Finch/Cash App):
//   hatch the mascot FIRST, legal LAST (rewritten human),
//   attitude (vibe) as hero config, voice picked by feeling
//   with live TTS preview — never "male/female".
// Steps: 0 spawn+name · 1 look · 2 vibe+voice · 3 markets
//        4 cadence+delivery · 5 launch (consent + deploy)
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Check, Play, Square } from 'lucide-react';
import { useAccount } from 'wagmi';
import BobbyMascot3D from './BobbyMascot3D';
import {
  type MascotLook, MASCOT_PALETTES, MASCOT_EYES, MASCOT_ACCESSORIES, MASCOT_AVATARS,
  DEFAULT_MASCOT, randomMascot, saveMascot, loadMascot, getPalette,
} from '@/lib/mascot';

export interface AgentConfig {
  agent_name: string;
  voice: string;
  personality: 'direct' | 'analytical' | 'wise';
  cadence_hours: number;
  markets: string[];
  delivery: string[];
  mascot: MascotLook;
}

interface AgentWizardProps {
  /** Performs the real deploy (signature + persistence). The wizard's final
   *  "awake" state waits for this promise — never lie to the user. */
  onComplete: (config: AgentConfig) => Promise<{ savedRemote: boolean }>;
  /** Called after the final state has been shown — navigate here. */
  onDone: () => void;
  onSkip: () => void;
}

const SUGGESTED_NAMES = ['BOBBY', 'LUMI', 'TORO', 'PIXEL', 'NEO', 'SATO'];

const MARKET_CATEGORIES = {
  CRYPTO: [
    { id: 'BTC', label: '$BTC', name: 'Bitcoin' },
    { id: 'ETH', label: '$ETH', name: 'Ethereum' },
    { id: 'SOL', label: '$SOL', name: 'Solana' },
    { id: 'DOGE', label: '$DOGE', name: 'Dogecoin' },
    { id: 'XRP', label: '$XRP', name: 'Ripple' },
  ],
  STOCKS: [
    { id: 'NVDA', label: '$NVDA', name: 'NVIDIA' },
    { id: 'TSLA', label: '$TSLA', name: 'Tesla' },
    { id: 'AAPL', label: '$AAPL', name: 'Apple' },
    { id: 'SPY', label: '$SPY', name: 'S&P 500' },
  ],
  MACRO: [
    { id: 'XAUT', label: 'GOLD', name: 'Gold' },
    { id: 'XAG', label: 'SILVER', name: 'Silver' },
  ],
};

// Voice personas — picked by feeling, previewed live. Ids are the
// actual OpenAI TTS voices so the backend maps them 1:1.
const VOICE_PERSONAS = [
  { id: 'coral', label: { es: 'Cálida', en: 'Warm' }, desc: { es: 'como tu bestie que sí sabe', en: 'your bestie who actually knows' } },
  { id: 'ballad', label: { es: 'Chill', en: 'Chill' }, desc: { es: 'tranquila, cero prisa', en: 'easy, zero rush' } },
  { id: 'sage', label: { es: 'Serena', en: 'Calm' }, desc: { es: 'te explica sin drama', en: 'explains without drama' } },
  { id: 'ash', label: { es: 'Táctica', en: 'Tactical' }, desc: { es: 'clara y al grano', en: 'clear, straight to it' } },
];

// Vibes — the hero config (Cleo's most-copied mechanic). Ids map to
// the existing backend personalities so no API/DB change is needed.
const VIBES: Array<{ id: AgentConfig['personality']; emoji: string; label: Record<string, string>; desc: Record<string, string>; sample: Record<string, string> }> = [
  { id: 'direct', emoji: '🔥', label: { es: 'Directo', en: 'Direct' }, desc: { es: 'te dice la neta, sin rodeos', en: 'tells it straight, no fluff' }, sample: { es: '"Esa entrada está cara. Espera el retest."', en: '"That entry is pricey. Wait for the retest."' } },
  { id: 'analytical', emoji: '🧠', label: { es: 'Táctico', en: 'Tactical' }, desc: { es: 'datos, riesgo y siguiente paso', en: 'data, risk, next step' }, sample: { es: '"RSI en 71 y funding alto. Riesgo: elevado."', en: '"RSI at 71, funding is hot. Risk: elevated."' } },
  { id: 'wise', emoji: '🧘', label: { es: 'Sensei', en: 'Sensei' }, desc: { es: 'calma, te explica sin juzgar', en: 'calm, explains without judging' }, sample: { es: '"Esperar también es una decisión."', en: '"Waiting is also a decision."' } },
];

const CADENCE_OPTIONS = [
  { value: 4, label: { es: 'Cada 4 horas', en: 'Every 4 hours' }, desc: { es: 'intenso — 6 reportes al día', en: 'intense — 6 reports/day' } },
  { value: 6, label: { es: 'Cada 6 horas', en: 'Every 6 hours' }, desc: { es: 'activo — 4 reportes al día', en: 'active — 4 reports/day' } },
  { value: 12, label: { es: 'Cada 12 horas', en: 'Every 12 hours' }, desc: { es: 'tranqui — 2 reportes al día', en: 'moderate — 2 reports/day' } },
  { value: 24, label: { es: 'Cada 24 horas', en: 'Every 24 hours' }, desc: { es: 'un resumen diario y ya', en: 'one daily digest, done' } },
];

// ---- Copy (es-MX first; en fallback; pt uses en UI, agent speaks pt) ----

const COPY = {
  es: {
    spawnTag: 'TU AGENTE // NUEVO',
    spawnTitle: 'Acaba de nacer tu agente',
    spawnSub: 'Analiza mercados, debate con su squad y te habla al oído. Primero: ¿cómo se llama?',
    namePlaceholder: 'PONLE NOMBRE',
    nameHint: 'Puede ser serio, raro o muy tú.',
    lookTitle: 'Elige su look',
    lookSub: 'Es tu agente. Que se note.',
    lookColor: 'ENERGÍA',
    lookEyes: 'MIRADA',
    lookAcc: 'EXTRA',
    vibeTitle: '¿Cómo quieres que te hable?',
    vibeSub: 'Puedes cambiarlo cuando quieras. Sin drama.',
    voiceTitle: 'Y con qué voz',
    voiceSub: 'Tócalas para escucharlas. Elige la que te late.',
    previewFail: 'La voz no está disponible ahorita — elígela igual y la escuchas después.',
    marketsTitle: (n: string) => `¿Qué va a vigilar ${n}?`,
    marketsSub: 'Elige de 1 a 5 mercados.',
    marketsCount: (c: number) => `${c}/5 en la mira`,
    cadenceTitle: '¿Cada cuánto te reporta?',
    deliveryTitle: '¿POR DÓNDE TE HABLA?',
    deliveryWeb: 'Web · siempre activo',
    deliveryTg: 'Telegram · reportes en tu chat',
    deliveryEmail: 'Email · próximamente',
    launchTitle: (n: string) => `${n} está listo`,
    consent: (n: string) => `Una neta antes de arrancar: ${n} analiza y debate, pero no es consejo financiero. Tú decides, tú aprietas el botón.`,
    consentCheck: 'Va, entiendo — yo mando',
    deploy: (n: string) => `DESPERTAR A ${n}`,
    deploying: (n: string) => `Despertando a ${n}...`,
    deploySteps: (n: string) => [`Abriendo los ojos de ${n}...`, 'Conectando con los mercados...', 'Calibrando su vibe...', 'Preparando su primer análisis...'],
    live: (n: string) => `${n} YA ESTÁ DESPIERTO`,
    liveSub: 'Su primer análisis llega en segundos.',
    localOnly: 'Se guardó solo en este dispositivo — la wallet no firmó. Puedes reintentar después.',
    ctaSpawn: 'Dale',
    ctaLook: 'Me gusta su look',
    ctaVibe: 'Así se queda',
    ctaMarkets: 'Listo',
    ctaCadence: 'Casi listo',
    skip: 'SALTAR',
    summary: { vibe: 'VIBE', voice: 'VOZ', markets: 'MERCADOS', cadence: 'CADA', wallet: 'WALLET', notConnected: 'SIN CONECTAR' },
    previewLine: (n: string) => `Qué onda, soy ${n}. Vamos a leer el mercado con calma. Y si veo riesgo, te lo digo directo, ¿va?`,
  },
  en: {
    spawnTag: 'YOUR AGENT // NEW',
    spawnTitle: 'Your agent just spawned',
    spawnSub: 'It reads markets, debates with its squad and talks to you. First: what do we call it?',
    namePlaceholder: 'NAME IT',
    nameHint: 'Serious, weird, or very you.',
    lookTitle: 'Pick its look',
    lookSub: "It's your agent. Make it obvious.",
    lookColor: 'ENERGY',
    lookEyes: 'EYES',
    lookAcc: 'EXTRA',
    vibeTitle: 'How should it talk to you?',
    vibeSub: 'You can change this anytime. No drama.',
    voiceTitle: 'And with which voice',
    voiceSub: 'Tap to hear them. Pick the one that clicks.',
    previewFail: "Voice preview isn't available right now — pick one anyway, you'll hear it later.",
    marketsTitle: (n: string) => `What should ${n} watch?`,
    marketsSub: 'Pick 1 to 5 markets.',
    marketsCount: (c: number) => `${c}/5 locked in`,
    cadenceTitle: 'How often should it report?',
    deliveryTitle: 'WHERE DOES IT TALK TO YOU?',
    deliveryWeb: 'Web · always on',
    deliveryTg: 'Telegram · reports in your chat',
    deliveryEmail: 'Email · coming soon',
    launchTitle: (n: string) => `${n} is ready`,
    consent: (n: string) => `Real talk before we start: ${n} analyzes and debates, but it's not financial advice. You decide, you press the button.`,
    consentCheck: "Got it — I'm in control",
    deploy: (n: string) => `WAKE UP ${n}`,
    deploying: (n: string) => `Waking up ${n}...`,
    deploySteps: (n: string) => [`Opening ${n}'s eyes...`, 'Connecting to markets...', 'Calibrating the vibe...', 'Cooking the first briefing...'],
    live: (n: string) => `${n} IS AWAKE`,
    liveSub: 'First briefing lands in seconds.',
    localOnly: "Saved on this device only — the wallet didn't sign. You can retry later.",
    ctaSpawn: "Let's go",
    ctaLook: 'Love the look',
    ctaVibe: 'Lock it in',
    ctaMarkets: 'Done',
    ctaCadence: 'Almost there',
    skip: 'SKIP',
    summary: { vibe: 'VIBE', voice: 'VOICE', markets: 'MARKETS', cadence: 'EVERY', wallet: 'WALLET', notConnected: 'NOT CONNECTED' },
    previewLine: (n: string) => `Hey, I'm ${n}. We'll read the market calmly. And when I see risk, I'll tell you straight.`,
  },
  // pt-BR dictionary authored by Kimi K3 (docs/messaging/wizard-copy-pt.md)
  pt: {
    spawnTag: 'SEU AGENTE // NOVO',
    spawnTitle: 'Seu agente acabou de nascer',
    spawnSub: 'Ele lê os mercados, debate com o squad e fala no seu ouvido. Primeiro: qual é o nome dele?',
    namePlaceholder: 'DÊ UM NOME',
    nameHint: 'Pode ser sério, estranho ou muito você.',
    lookTitle: 'Escolhe o visual',
    lookSub: 'É o seu agente. Tem que ter a sua cara.',
    lookColor: 'ENERGIA',
    lookEyes: 'OLHAR',
    lookAcc: 'EXTRA',
    vibeTitle: 'Como você quer que ele fale com você?',
    vibeSub: 'Dá pra mudar quando quiser. Sem drama.',
    voiceTitle: 'E com qual voz',
    voiceSub: 'Toca pra ouvir. Escolhe a que bate.',
    previewFail: 'A voz não tá disponível agora — escolhe assim mesmo e você ouve depois.',
    marketsTitle: (n: string) => `O que ${n} vai ficar de olho?`,
    marketsSub: 'Escolhe de 1 a 5 mercados.',
    marketsCount: (c: number) => `${c}/5 na mira`,
    cadenceTitle: 'De quanto em quanto tempo ele te reporta?',
    deliveryTitle: 'POR ONDE ELE FALA COM VOCÊ?',
    deliveryWeb: 'Web · sempre ativo',
    deliveryTg: 'Telegram · reportes no seu chat',
    deliveryEmail: 'Email · em breve',
    launchTitle: (n: string) => `${n} tá pronto`,
    consent: (n: string) => `Uma parada real antes da gente começar: ${n} analisa e debate, mas não é recomendação financeira. Quem decide é você, quem aperta o botão também.`,
    consentCheck: 'Beleza, entendi — quem manda sou eu',
    deploy: (n: string) => `ACORDAR ${n}`,
    deploying: (n: string) => `Acordando ${n}...`,
    deploySteps: (n: string) => [`Abrindo os olhos de ${n}...`, 'Conectando com os mercados...', 'Calibrando a vibe...', 'Preparando a primeira análise...'],
    live: (n: string) => `${n} JÁ TÁ ACORDADO`,
    liveSub: 'A primeira análise chega em segundos.',
    localOnly: 'Ficou salvo só nesse dispositivo — a wallet não assinou. Você pode tentar de novo depois.',
    ctaSpawn: 'Partiu',
    ctaLook: 'Amei o visual',
    ctaVibe: 'Fica assim',
    ctaMarkets: 'Pronto',
    ctaCadence: 'Quase lá',
    skip: 'PULAR',
    summary: { vibe: 'VIBE', voice: 'VOZ', markets: 'MERCADOS', cadence: 'A CADA', wallet: 'WALLET', notConnected: 'DESCONECTADO' },
    previewLine: (n: string) => `E aí, sou ${n}. Vamos ler o mercado de boa. E quando eu ver risco, te falo na lata, beleza?`,
  },
};

export default function AgentWizard({ onComplete, onDone, onSkip }: AgentWizardProps) {
  const { address } = useAccount();

  const [step, setStep] = useState(0);
  const [agentName, setAgentName] = useState('');
  const [look, setLook] = useState<MascotLook>(() => randomMascot());
  const [lookPulse, setLookPulse] = useState(0);
  const [voice, setVoice] = useState('coral');
  const [personality, setPersonality] = useState<AgentConfig['personality']>('wise');
  const [markets, setMarkets] = useState<string[]>(['BTC']);
  const [marketTab, setMarketTab] = useState<keyof typeof MARKET_CATEGORIES>('CRYPTO');
  const [cadence, setCadence] = useState(6);
  const [delivery, setDelivery] = useState<string[]>(['web']);
  const [lang, setLang] = useState(() =>
    localStorage.getItem('bobby_lang') || (navigator.language.startsWith('es') ? 'es' : navigator.language.startsWith('pt') ? 'pt' : 'en'));
  const [consented, setConsented] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState(0);
  const [prices, setPrices] = useState<Record<string, number>>({});

  const t = COPY[(lang as 'es' | 'en' | 'pt')] || COPY.en;
  const displayName = agentName || 'BOBBY';
  const palette = getPalette(look);

  // ---- Voice preview (live TTS through the real pipeline) ----
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());
  // A slow earlier fetch must never hijack a later selection
  const previewSeqRef = useRef(0);
  const previewAbortRef = useRef<AbortController | null>(null);

  const stopPreview = useCallback(() => {
    previewSeqRef.current++;
    previewAbortRef.current?.abort(); // cancel paid synthesis, not just playback
    previewAbortRef.current = null;
    previewAudioRef.current?.pause();
    setPreviewing(null);
    setLoadingVoice(null);
  }, []);

  const playPreview = useCallback(async (voiceId: string) => {
    stopPreview();
    const seq = ++previewSeqRef.current;
    setPreviewFailed(false);
    setLoadingVoice(voiceId);
    try {
      const cacheKey = `${voiceId}:${lang}:${personality}:${displayName}`;
      let url = previewCacheRef.current.get(cacheKey);
      if (!url) {
        const controller = new AbortController();
        previewAbortRef.current = controller;
        const res = await fetch('/api/bobby-voice-free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: t.previewLine(displayName), voice: voiceId, lang, vibe: personality }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('preview failed');
        url = URL.createObjectURL(await res.blob());
        previewCacheRef.current.set(cacheKey, url);
      }
      if (seq !== previewSeqRef.current) return; // stale — a newer tap won
      if (!previewAudioRef.current) previewAudioRef.current = new Audio();
      const audio = previewAudioRef.current;
      audio.src = url;
      audio.onended = () => setPreviewing(null);
      audio.onerror = () => setPreviewing(null);
      await audio.play();
      if (seq !== previewSeqRef.current) { audio.pause(); return; }
      setPreviewing(voiceId);
    } catch {
      if (seq === previewSeqRef.current) {
        setPreviewing(null);
        setPreviewFailed(true);
      }
    } finally {
      if (seq === previewSeqRef.current) setLoadingVoice(null);
    }
  }, [displayName, lang, personality, stopPreview, t]);

  useEffect(() => () => {
    previewAudioRef.current?.pause();
    for (const url of previewCacheRef.current.values()) URL.revokeObjectURL(url);
  }, []);

  // Live prices for market selection
  useEffect(() => {
    fetch('/api/okx-tickers')
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          const p: Record<string, number> = {};
          for (const tk of d.tickers) p[tk.symbol] = tk.last;
          setPrices(p);
        }
      })
      .catch(() => {});
  }, []);

  const updateLook = (patch: Partial<MascotLook>) => {
    setLook(prev => ({ ...prev, ...patch }));
    setLookPulse(p => p + 1); // mascot reacts to every change
  };

  const toggleMarket = (id: string) => {
    setMarkets(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : prev.length < 5 ? [...prev, id] : prev
    );
  };

  const [deployResult, setDeployResult] = useState<{ savedRemote: boolean } | null>(null);

  const handleDeploy = () => {
    setDeploying(true);
    saveMascot(look);
    // The real work (signature + persistence) starts NOW, in parallel with
    // the animation. The final "awake" state waits for the actual result.
    const work = onComplete({
      agent_name: displayName,
      voice,
      personality,
      cadence_hours: cadence,
      markets,
      delivery,
      mascot: look,
    }).catch(() => ({ savedRemote: false }));

    const steps = t.deploySteps(displayName);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      // Hold the last step spinning until the real deploy resolves
      setDeployStep(Math.min(i, steps.length - 1));
      if (i >= steps.length) {
        clearInterval(interval);
        work.then(result => {
          setDeployResult(result);
          setDeployStep(steps.length);
          setTimeout(onDone, 1800);
        });
      }
    }, 1400);
  };

  const canContinue = () => {
    switch (step) {
      case 0: return agentName.length >= 2;
      case 1: return MASCOT_AVATARS.length === 0 || !!look.avatar; // must pick your companion
      case 3: return markets.length >= 1;
      default: return true;
    }
  };

  const CTA_LABELS = [t.ctaSpawn, t.ctaLook, t.ctaVibe, t.ctaMarkets, t.ctaCadence];

  const mascotState = previewing ? 'speaking' : deploying ? 'thinking' : 'idle';

  return (
    <div className="fixed inset-0 z-[9999] bg-[#050505] flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-white/5">
        <div className="flex items-center justify-between px-5 h-12">
          {step > 0 && !deploying ? (
            <button onClick={() => { stopPreview(); setStep(step - 1); }} className="text-white/30 hover:text-white/60 transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : <div className="w-5" />}
          <span className="font-mono text-[9px] text-white/25 tracking-widest">{t.spawnTag}</span>
          <div className="flex items-center gap-3">
            {!deploying && step === 0 && (
              <div className="flex gap-1">
                {['es', 'en', 'pt'].map(l => (
                  <button key={l} onClick={() => { setLang(l); localStorage.setItem('bobby_lang', l); }}
                    className={`px-1.5 py-0.5 text-[9px] font-mono rounded transition-all ${
                      lang === l ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'text-white/25 hover:text-white/50 border border-transparent'
                    }`}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            {/* No skip on the consent step — the disclaimer can't be bypassed */}
            {!deploying && step < 5 && (
              <button
                onClick={() => {
                  // The chosen companion is Bobby's only face — a skipper
                  // still gets the default companion instead of the legacy orb
                  if (!loadMascot()) {
                    saveMascot(MASCOT_AVATARS.length > 0 ? { ...DEFAULT_MASCOT, avatar: MASCOT_AVATARS[0].id } : DEFAULT_MASCOT);
                  }
                  onSkip();
                }}
                className="font-mono text-[9px] text-white/20 hover:text-white/40 transition-colors">
                {t.skip}
              </button>
            )}
          </div>
        </div>
        <div className="h-0.5 bg-white/[0.04]">
          <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${((step + 1) / 6) * 100}%` }} />
        </div>
      </div>

      {/* Persistent mascot — the star of the show */}
      {!deploying && (
        <div className="flex-shrink-0 flex justify-center pt-6">
          <motion.div
            key="mascot-stage"
            initial={{ scale: 0, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          >
            {/* reactKey makes the mascot bounce on customization — the WebGL
                scene must NEVER remount per click */}
            <BobbyMascot3D look={look} state={mascotState} size={step === 1 ? 150 : 120} reactKey={lookPulse} />
          </motion.div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex items-start justify-center p-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }} className="w-full max-w-lg">

            {/* STEP 0: Spawn + name */}
            {step === 0 && (
              <div className="space-y-6 text-center">
                <div>
                  <h2 className="text-xl font-black tracking-tight">{t.spawnTitle}</h2>
                  <p className="text-[12px] text-white/40 mt-2 max-w-sm mx-auto leading-relaxed">{t.spawnSub}</p>
                </div>
                <input
                  type="text"
                  value={agentName}
                  aria-label={t.namePlaceholder}
                  onChange={e => setAgentName(e.target.value.toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑ0-9_]/g, '').slice(0, 12))}
                  placeholder={t.namePlaceholder}
                  className="w-full bg-transparent border-b-2 border-white/10 focus:border-green-500 text-center text-3xl font-black font-mono tracking-wider py-3 outline-none transition-colors text-white placeholder:text-white/10"
                  autoFocus
                />
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTED_NAMES.map(name => (
                    <button key={name} onClick={() => setAgentName(name)}
                      className={`px-3 py-1.5 text-[10px] font-mono tracking-wider border rounded transition-all ${
                        agentName === name
                          ? 'border-green-500/40 bg-green-500/10 text-green-400'
                          : 'border-white/[0.06] text-white/25 hover:text-white/50 hover:border-white/15'
                      }`}>
                      {name}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] font-mono text-white/20">{t.nameHint}</p>
              </div>
            )}

            {/* STEP 1: Look — avatar gallery (premade 3D) or character creator */}
            {step === 1 && MASCOT_AVATARS.length > 0 && (
              <div className="space-y-5">
                <div className="text-center">
                  <h2 className="text-xl font-black tracking-tight">{t.lookTitle}</h2>
                  <p className="text-[11px] font-mono text-white/30 mt-1">{t.lookSub}</p>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {MASCOT_AVATARS.map(a => (
                    <button key={a.id}
                      aria-pressed={look.avatar === a.id}
                      onClick={() => updateLook({ avatar: a.id, body: a.palette })}
                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded border transition-all ${
                        look.avatar === a.id
                          ? 'border-green-500/40 bg-green-500/[0.08]'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                      }`}>
                      {a.thumb ? (
                        <img src={a.thumb} alt={a.label} className="w-full aspect-square object-contain" loading="lazy" />
                      ) : (
                        <div className="w-full aspect-square rounded bg-white/[0.03] flex items-center justify-center text-lg">🤖</div>
                      )}
                      <span className="text-[9px] font-mono text-white/50">{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {step === 1 && MASCOT_AVATARS.length === 0 && (
              <div className="space-y-5">
                <div className="text-center">
                  <h2 className="text-xl font-black tracking-tight">{t.lookTitle}</h2>
                  <p className="text-[11px] font-mono text-white/30 mt-1">{t.lookSub}</p>
                </div>

                <div>
                  <span className="text-[9px] font-mono text-white/25 tracking-widest block mb-2">{t.lookColor}</span>
                  <div className="flex gap-2 justify-center flex-wrap">
                    {MASCOT_PALETTES.map(p => (
                      <button key={p.id} onClick={() => updateLook({ body: p.id })}
                        className={`w-11 h-11 rounded-full border-2 transition-all ${
                          look.body === p.id ? 'scale-110 border-white/70' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ background: `linear-gradient(135deg, ${p.light}, ${p.dark})`, boxShadow: look.body === p.id ? `0 0 16px rgba(${p.glow}, 0.5)` : undefined }}
                        title={p.label[lang === 'es' ? 'es' : 'en']}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[9px] font-mono text-white/25 tracking-widest block mb-2">{t.lookEyes}</span>
                  <div className="grid grid-cols-4 gap-2">
                    {MASCOT_EYES.map(e => (
                      <button key={e.id} onClick={() => updateLook({ eyes: e.id })}
                        className={`py-2 rounded border text-[10px] font-mono transition-all ${
                          look.eyes === e.id
                            ? 'border-green-500/40 bg-green-500/[0.08] text-green-400'
                            : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:border-white/15'
                        }`}>
                        {e.label[lang === 'es' ? 'es' : 'en']}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[9px] font-mono text-white/25 tracking-widest block mb-2">{t.lookAcc}</span>
                  <div className="grid grid-cols-5 gap-2">
                    {MASCOT_ACCESSORIES.map(a => (
                      <button key={a.id} onClick={() => updateLook({ accessory: a.id })}
                        className={`py-2 rounded border text-[9px] font-mono transition-all ${
                          look.accessory === a.id
                            ? 'border-green-500/40 bg-green-500/[0.08] text-green-400'
                            : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:border-white/15'
                        }`}>
                        {a.label[lang === 'es' ? 'es' : 'en']}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Vibe + voice */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-xl font-black tracking-tight">{t.vibeTitle}</h2>
                  <p className="text-[11px] font-mono text-white/30 mt-1">{t.vibeSub}</p>
                </div>
                <div className="space-y-2">
                  {VIBES.map(v => (
                    <button key={v.id} aria-pressed={personality === v.id} onClick={() => setPersonality(v.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded border transition-all text-left ${
                        personality === v.id
                          ? 'border-green-500/40 bg-green-500/[0.06]'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                      }`}>
                      <span className="text-xl">{v.emoji}</span>
                      <div className="flex-1">
                        <div className="text-sm font-bold">{v.label[lang === 'es' ? 'es' : 'en']}</div>
                        <div className="text-[10px] text-white/30">{v.desc[lang === 'es' ? 'es' : 'en']}</div>
                        {personality === v.id && (
                          <div className="text-[10px] font-mono mt-1" style={{ color: palette.base }}>{v.sample[lang === 'es' ? 'es' : 'en']}</div>
                        )}
                      </div>
                      {personality === v.id && <Check className="w-4 h-4 text-green-400" />}
                    </button>
                  ))}
                </div>

                <div className="text-center">
                  <h3 className="text-sm font-black tracking-tight">{t.voiceTitle}</h3>
                  <p className="text-[10px] font-mono text-white/30 mt-1">{t.voiceSub}</p>
                </div>
                {previewFailed && (
                  <p className="text-[10px] font-mono text-amber-400/70 text-center">{t.previewFail}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {VOICE_PERSONAS.map(v => (
                    <button key={v.id}
                      aria-pressed={voice === v.id}
                      onClick={() => { setVoice(v.id); if (previewing === v.id) { stopPreview(); } else { playPreview(v.id); } }}
                      className={`flex items-center gap-2.5 p-3 rounded border transition-all text-left ${
                        voice === v.id
                          ? 'border-green-500/40 bg-green-500/[0.06]'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                      }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        previewing === v.id ? 'bg-green-500/20' : 'bg-white/[0.05]'
                      }`}>
                        {loadingVoice === v.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                        ) : previewing === v.id ? (
                          <Square className="w-3 h-3 text-green-400 fill-green-400" />
                        ) : (
                          <Play className="w-3.5 h-3.5 text-white/50" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold">{v.label[lang === 'es' ? 'es' : 'en']}</div>
                        <div className="text-[9px] text-white/30">{v.desc[lang === 'es' ? 'es' : 'en']}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 3: Markets */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="text-center">
                  <h2 className="text-xl font-black tracking-tight">{t.marketsTitle(displayName)}</h2>
                  <p className="text-[11px] font-mono text-white/30 mt-1">{t.marketsSub}</p>
                </div>

                <div className="flex gap-1 justify-center">
                  {(Object.keys(MARKET_CATEGORIES) as Array<keyof typeof MARKET_CATEGORIES>).map(cat => (
                    <button key={cat} onClick={() => setMarketTab(cat)}
                      className={`px-4 py-1.5 text-[10px] font-mono tracking-wider rounded transition-all ${
                        marketTab === cat
                          ? 'bg-green-500/15 border border-green-500/30 text-green-400'
                          : 'bg-white/[0.02] border border-white/[0.04] text-white/30 hover:text-white/50'
                      }`}>
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {MARKET_CATEGORIES[marketTab].map(asset => {
                    const selected = markets.includes(asset.id);
                    const price = prices[asset.id];
                    return (
                      <button key={asset.id} onClick={() => toggleMarket(asset.id)}
                        className={`flex items-center justify-between p-3 rounded border transition-all ${
                          selected
                            ? 'border-green-500/40 bg-green-500/[0.06]'
                            : markets.length >= 5
                            ? 'border-white/[0.04] bg-white/[0.01] opacity-40 cursor-not-allowed'
                            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                        }`}>
                        <div className="text-left">
                          <div className="text-sm font-bold font-mono">{asset.label}</div>
                          <div className="text-[9px] text-white/25">{asset.name}</div>
                        </div>
                        <div className="text-right">
                          {price && <div className="text-[10px] font-mono text-white/40">${price.toLocaleString(undefined, { maximumFractionDigits: price < 1 ? 4 : 0 })}</div>}
                          {selected && <Check className="w-3.5 h-3.5 text-green-400 ml-auto mt-0.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="text-center text-[10px] font-mono text-white/25">
                  {t.marketsCount(markets.length)}
                </div>
              </div>
            )}

            {/* STEP 4: Cadence + delivery */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-xl font-black tracking-tight">{t.cadenceTitle}</h2>
                </div>
                <div className="space-y-2">
                  {CADENCE_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setCadence(opt.value)}
                      className={`w-full flex items-center justify-between p-3 rounded border transition-all text-left ${
                        cadence === opt.value
                          ? 'border-green-500/40 bg-green-500/[0.06]'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                      }`}>
                      <div>
                        <div className="text-sm font-bold">{opt.label[lang === 'es' ? 'es' : 'en']}</div>
                        <div className="text-[9px] text-white/25 font-mono">{opt.desc[lang === 'es' ? 'es' : 'en']}</div>
                      </div>
                      {cadence === opt.value && <Check className="w-4 h-4 text-green-400" />}
                    </button>
                  ))}
                </div>

                <div>
                  <span className="text-[9px] font-mono text-white/25 tracking-widest block mb-3">{t.deliveryTitle}</span>
                  <div className="space-y-2">
                    {[
                      { id: 'web', label: t.deliveryWeb, disabled: true, checked: true },
                      { id: 'telegram', label: t.deliveryTg, disabled: false, checked: delivery.includes('telegram') },
                      { id: 'email', label: t.deliveryEmail, disabled: true, checked: false },
                    ].map(ch => (
                      <button key={ch.id} onClick={() => {
                        if (ch.disabled) return;
                        setDelivery(prev => prev.includes(ch.id) ? prev.filter(d => d !== ch.id) : [...prev, ch.id]);
                      }}
                        className={`w-full flex items-center justify-between p-3 rounded border transition-all text-left ${
                          ch.disabled && !ch.checked ? 'border-white/[0.03] bg-white/[0.01] opacity-40' :
                          ch.checked ? 'border-green-500/30 bg-green-500/[0.04]' :
                          'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                        }`}>
                        <div className="text-sm font-bold">{ch.label}</div>
                        {ch.checked && <Check className="w-4 h-4 text-green-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: Launch — agent card + human consent + deploy */}
            {step === 5 && (
              <div className="space-y-6 text-center">
                {!deploying ? (
                  <>
                    <h2 className="text-xl font-black tracking-tight">{t.launchTitle(displayName)}</h2>

                    {/* Agent card — screenshot-able identity */}
                    <div className="rounded-xl border p-4 text-left space-y-2 font-mono text-[10px]"
                      style={{ borderColor: `rgba(${palette.glow}, 0.25)`, background: `linear-gradient(160deg, rgba(${palette.glow}, 0.06), rgba(255,255,255,0.02))` }}>
                      <div className="flex justify-between items-center pb-2 border-b border-white/[0.06]">
                        <span className="text-base font-black tracking-wider" style={{ color: palette.base }}>{displayName}</span>
                        <span className="text-white/25">AGENT CARD</span>
                      </div>
                      {[
                        { label: t.summary.vibe, value: `${VIBES.find(v => v.id === personality)?.emoji} ${VIBES.find(v => v.id === personality)?.label[lang === 'es' ? 'es' : 'en']}` },
                        { label: t.summary.voice, value: VOICE_PERSONAS.find(v => v.id === voice)?.label[lang === 'es' ? 'es' : 'en'] || voice },
                        { label: t.summary.markets, value: markets.join(' · ') },
                        { label: t.summary.cadence, value: `${cadence}h` },
                        { label: t.summary.wallet, value: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : t.summary.notConnected },
                      ].map(row => (
                        <div key={row.label} className="flex justify-between">
                          <span className="text-white/30">{row.label}</span>
                          <span className="text-white/70">{row.value}</span>
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] text-white/40 leading-relaxed max-w-sm mx-auto">{t.consent(displayName)}</p>
                    <label className="flex items-center gap-3 justify-center cursor-pointer group">
                      <input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-transparent accent-green-500" />
                      <span className="text-[11px] font-mono text-white/40 group-hover:text-white/60 transition-colors">
                        {t.consentCheck}
                      </span>
                    </label>

                    <button onClick={handleDeploy} disabled={!consented}
                      className={`w-full py-4 font-mono font-black text-sm tracking-widest rounded transition-all ${
                        consented
                          ? 'bg-green-500 text-black hover:brightness-110 active:scale-[0.98]'
                          : 'bg-white/[0.04] text-white/15 cursor-not-allowed'
                      }`}
                      style={consented ? { boxShadow: '0 0 30px rgba(34,197,94,0.3)' } : undefined}>
                      {t.deploy(displayName)}
                    </button>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="flex justify-center">
                      <BobbyMascot3D look={look} state={deployStep >= t.deploySteps(displayName).length ? 'speaking' : 'thinking'} size={130} />
                    </div>
                    <h2 className="text-xl font-black tracking-tight">{t.deploying(displayName)}</h2>
                    <div className="space-y-3 text-left max-w-sm mx-auto">
                      {t.deploySteps(displayName).map((s, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: deployStep > i ? 1 : deployStep === i ? 0.6 : 0.2, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="flex items-center gap-3">
                          {deployStep > i ? (
                            <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                          ) : deployStep === i ? (
                            <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                          ) : (
                            <div className="w-4 h-4 border border-white/10 rounded-full flex-shrink-0" />
                          )}
                          <span className={`text-[11px] font-mono ${deployStep >= i ? 'text-green-400/80' : 'text-white/15'}`}>
                            {'> '}{s}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                    {deployStep >= t.deploySteps(displayName).length && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-1">
                        <div className="text-green-400 font-mono text-sm font-bold animate-pulse">{t.live(displayName)}</div>
                        {address && deployResult && !deployResult.savedRemote ? (
                          <div className="text-[10px] font-mono text-amber-400/80">{t.localOnly}</div>
                        ) : (
                          <div className="text-[10px] font-mono text-white/30">{t.liveSub}</div>
                        )}
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom CTA */}
      {step < 5 && (
        <div className="flex-shrink-0 p-5 border-t border-white/5">
          <button onClick={() => { stopPreview(); setStep(step + 1); }} disabled={!canContinue()}
            className={`w-full py-3 rounded font-mono text-sm font-bold tracking-wider transition-all ${
              canContinue()
                ? 'bg-green-500 text-black hover:brightness-110 active:scale-[0.98]'
                : 'bg-white/[0.04] text-white/15 cursor-not-allowed'
            }`}>
            {CTA_LABELS[step]}
          </button>
        </div>
      )}
    </div>
  );
}
