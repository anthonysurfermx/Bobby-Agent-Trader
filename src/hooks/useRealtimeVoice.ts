import { translateText, locale as currentLocale } from '@/lib/companions/i18n';
import { appLocale, type AppLanguage } from '@/lib/app-language';
// ============================================================
// useRealtimeVoice — one live voice session with Bobby.
//
// Browser ⇄ OpenAI Realtime API over WebRTC. The API key never reaches the
// client: /api/realtime-session owns the call and enforces the daily quota. Tool calls are executed server-side by /api/voice-tool.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { matchAssetInText, normalizeAssetSymbol } from '@/lib/voice-assets';
import { voiceScreenContext, voiceScreenState } from '@/lib/realtime-context';
import { bobbySupabase } from '@/lib/bobby-db-client';
import { getConfiguredVoice } from '@/lib/agent-voice';
import { progressStore, RISK_NOTICE_VERSION } from '@/lib/companions/progress';

import type { DeskBrief } from '@/lib/voice-desk-brief';

const canUseVoice = () => progressStore.get().aiConsentGranted && progressStore.get().riskNoticeVersion >= RISK_NOTICE_VERSION;

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';
export type VoiceInputMode = 'tap-to-talk' | 'hands-free';

export interface TranscriptLine {
  id: string;
  role: 'user' | 'bobby';
  text: string;
  final: boolean;
}

export interface ToolEvent {
  id: string;
  tool: string;
  status: 'running' | 'done' | 'failed';
  label: string;
}

export interface TradeProposal {
  symbol: string;
  direction: 'long' | 'short';
  size_usd: number | null;
  entry: number | null;
  stop: number | null;
  rationale: string | null;
}

export interface ChartLevel {
  price: number;
  label: string;
  kind: 'entry' | 'stop' | 'target' | 'level';
  agent?: 'alpha' | 'red' | 'cio';
  /** When present the level is a shaded zone spanning price…priceTo. */
  priceTo?: number;
}

export interface DebateSides {
  alpha: string;
  redTeam: string;
  cio: string;
  alphaConviction: number | null;
  redTeamSeverity: number | null;
  cioConviction: number | null;
  indicators: string[];
  /**
   * One price per agent, straight from the model's show_debate call — this is
   * what gets drawn on the chart. Null when the model did not supply it; the
   * chart then draws nothing rather than inventing a level.
   */
  levels: ChartLevel[];
}

export interface Thesis {
  verdict: 'buy' | 'wait' | 'avoid' | 'sell';
  conviction: number | null;
  reason: string;
  risk: string | null;
  invalidation: string | null;
}

export interface DeskBriefState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  symbol: string | null;
  startedAt: number | null;
  elapsedMs: number | null;
}

const TOOL_LABELS: Record<string, string> = {
  get_market: 'Reading market data',
  run_debate: 'Analyzing asset',
  get_protocol_stats: 'Reading the on-chain record',
  propose_trade: 'Preparing proposal',
  set_chart: 'Changing chart',
  show_debate: 'Publishing debate',
  draw_levels: 'Marking levels',
  update_thesis: 'Updating verdict',
};

/** Tools resolved in the browser — they drive the UI, so a server hop would only add latency. */
const UI_TOOLS = new Set(['set_chart', 'draw_levels', 'update_thesis', 'show_debate']);

/** Symbol handling lives in the shared registry so the chart, the voice tool
 *  endpoint and this matcher can never disagree about what a ticker is. */
const normalizeSymbol = normalizeAssetSymbol;
const symbolMentioned = matchAssetInText;

/** Whisper can occasionally hallucinate a non-Latin script from room noise.
 *  Do not display that as if the human actually said it. */
function hasUnexpectedScript(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(text);
}

/** Pull one agent's level (or zone) out of a show_debate payload, or nothing. */
function debateLevel(
  args: Record<string, unknown>,
  agent: 'alpha' | 'red' | 'cio',
  priceKey: string,
  labelKey: string,
  zoneKey: string,
  fallbackLabel: string,
): ChartLevel[] {
  const price = Number(args[priceKey]);
  if (!Number.isFinite(price) || price <= 0) return [];
  const label = String(args[labelKey] ?? '').trim() || fallbackLabel;
  const zoneTo = Number(args[zoneKey]);
  // A zone only counts when the far edge is a real, different price.
  const priceTo = Number.isFinite(zoneTo) && zoneTo > 0 && zoneTo !== price ? zoneTo : undefined;
  return [{ price, label, kind: 'level', agent, ...(priceTo === undefined ? {} : { priceTo }) }];
}

export function useRealtimeVoice(
  lang: AppLanguage = 'es',
  inputMode: VoiceInputMode = 'tap-to-talk',
  options: { voice?: string; locale?: string; autoLanguage?: boolean; initialSymbol?: string; initialTimeframe?: string } = {},
) {
  const { voice, autoLanguage = true } = options;
  const voiceLocale = appLocale(lang, options.locale ?? currentLocale());
  const initialScreen = voiceScreenState(options.initialSymbol, options.initialTimeframe);
  const [state, setState] = useState<VoiceState>('idle');
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [fallback, setFallback] = useState(false);
  const fallbackRef = useRef<() => void>(() => {});
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armWatchdog = () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => fallbackRef.current(), 45000);
  };
  const clearWatchdog = () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
  };
  const [remainingSeconds, setRemainingSeconds] = useState(180);
  const leaseRef = useRef<{ id: string; token: string } | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [tools, setTools] = useState<ToolEvent[]>([]);
  const [proposal, setProposal] = useState<TradeProposal | null>(null);
  const [symbol, setSymbol] = useState(initialScreen.symbol);
  const [timeframe, setTimeframe] = useState(initialScreen.timeframe);
  const [levels, setLevels] = useState<ChartLevel[]>([]);
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [debate, setDebate] = useState<DebateSides | null>(null);
  const [deskBrief, setDeskBrief] = useState<DeskBrief | null>(null);
  const [briefState, setBriefState] = useState<DeskBriefState>({
    status: 'idle', symbol: null, startedAt: null, elapsedMs: null,
  });
  /** 0..1 — live amplitude of whoever is currently talking. Drives the orb. */
  const [level, setLevel] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const analysersRef = useRef<{ mic?: AnalyserNode; out?: AnalyserNode }>({});
  const stateRef = useRef<VoiceState>('idle');
  const symbolRef = useRef(initialScreen.symbol);
  const timeframeRef = useRef(initialScreen.timeframe);
  const connectionGenerationRef = useRef(0);
  const connectAbortRef = useRef<AbortController | null>(null);
  const toolAbortControllersRef = useRef(new Set<AbortController>());
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseInstructionsRef = useRef('');
  const playbackActiveRef = useRef(false);
  const inputModeRef = useRef<VoiceInputMode>(inputMode);
  const [micMuted, setMicMuted] = useState(inputMode === 'tap-to-talk');

  // --- tool dispatch bookkeeping ---------------------------------------
  // Tools are fired the moment their arguments finish streaming, not when the
  // whole response completes. That is what makes the chart move while Bobby is
  // still mid-sentence instead of seconds after he stops talking.
  /** call_id → tool name, learned from response.output_item.added. */
  const callNamesRef = useRef<Map<string, string>>(new Map());
  /** call_ids already dispatched, so the response.done safety net never doubles up. */
  const dispatchedRef = useRef<Set<string>>(new Set());
  /** A response is streaming right now — response.create would be rejected. */
  const responseActiveRef = useRef(false);
  /** A tool finished mid-response, so we owe the model a response.create. */
  const responseOwedRef = useRef(false);
  /** Same asset can be detected by transcription and by model tools. One live
   *  promise feeds all of them, preventing duplicate market/intel requests. */
  const briefRequestsRef = useRef<Map<string, { createdAt: number; promise: Promise<Record<string, unknown>> }>>(new Map());
  /** Invalidates an old-language request after disconnect/reset even when the
   *  next session happens to ask for the same symbol. */
  const briefGenerationRef = useRef(0);

  const setMicEnabled = useCallback((enabled: boolean) => {
    enabled = enabled && canUseVoice();
    micRef.current?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
    setMicMuted(!enabled);
  }, []);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    inputModeRef.current = inputMode;
    if (micRef.current) setMicEnabled(inputMode === 'hands-free');
  }, [inputMode, setMicEnabled]);

  const meter = useCallback(() => {
    const { mic, out } = analysersRef.current;
    const read = (node?: AnalyserNode) => {
      if (!node) return 0;
      const buf = new Uint8Array(node.frequencyBinCount);
      node.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      return peak;
    };
    // While Bobby talks the orb follows Bobby; otherwise it follows the human.
    const value = stateRef.current === 'speaking' ? read(out) : read(mic);
    setLevel((prev) => prev * 0.72 + Math.min(1, value * 1.7) * 0.28);
    rafRef.current = requestAnimationFrame(meter);
  }, []);

  const send = useCallback((payload: unknown) => {
    if (!canUseVoice()) return;
    const dc = dcRef.current;
    if (dc?.readyState === 'open') dc.send(JSON.stringify(payload));
  }, []);

  const syncScreen = useCallback(() => {
    if (!baseInstructionsRef.current) return;
    send({ type: 'session.update', session: { type: 'realtime',
      instructions: `${baseInstructionsRef.current}\n\n${voiceScreenContext(symbolRef.current, timeframeRef.current)}`,
    } });
  }, [send]);

  useEffect(() => {
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
    syncScreen();
  }, [symbol, timeframe, syncScreen]);

  /**
   * Hand a tool result back to the model. The result item can be added at any
   * time, but asking for a new response while one is already streaming is
   * rejected — so that request is deferred until the current turn ends.
   */
  const submitToolOutput = useCallback((callId: string, output: unknown) => {
    send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
    });
    if (responseActiveRef.current) responseOwedRef.current = true;
    else send({ type: 'response.create' });
  }, [send]);

  const fetchVoiceTool = useCallback(async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (!canUseVoice()) throw new Error('ai_consent_required');
    const controller = new AbortController();
    toolAbortControllersRef.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch('/api/voice-tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      const payload = await response.json() as Record<string, unknown>;
      if (!canUseVoice() || controller.signal.aborted) throw new Error('ai_consent_required');
      if (!response.ok) throw new Error('tool_request_failed');
      return payload;
    } finally { window.clearTimeout(timeout); toolAbortControllersRef.current.delete(controller); }
  }, []);

  const requestAssetBrief = useCallback(async (nextSymbol: string, context?: string) => {
    if (!canUseVoice()) return { error: 'ai_consent_required' } as Record<string, unknown>;
    const next = normalizeSymbol(nextSymbol);
    if (!next) return { error: 'symbol_required' } as Record<string, unknown>;
    const generation = briefGenerationRef.current;

    const changedAsset = symbolRef.current !== next;
    symbolRef.current = next;
    setSymbol(next);
    if (changedAsset) {
      setLevels([]);
      setDebate(null);
      setThesis(null);
      setDeskBrief(null);
    }

    const startedAt = Date.now();
    setBriefState({ status: 'loading', symbol: next, startedAt, elapsedMs: null });

    const cacheKey = `${lang}:${next}`;
    const cached = briefRequestsRef.current.get(cacheKey);
    const request = cached && startedAt - cached.createdAt < 30_000
      ? cached.promise
      : fetchVoiceTool({ tool: 'run_debate', args: { symbol: next, context, lang, locale: voiceLocale } });

    if (!cached || startedAt - cached.createdAt >= 30_000) {
      briefRequestsRef.current.set(cacheKey, { createdAt: startedAt, promise: request });
      if (briefRequestsRef.current.size > 8) {
        const oldest = [...briefRequestsRef.current.entries()]
          .sort((a, b) => a[1].createdAt - b[1].createdAt)[0]?.[0];
        if (oldest) briefRequestsRef.current.delete(oldest);
      }
    }

    try {
      const output = await request;
      const quickBrief = output.quick_brief as DeskBrief | undefined;
      if (!quickBrief) throw new Error('brief_unavailable');
      if (canUseVoice() && briefGenerationRef.current === generation && symbolRef.current === next) {
        setDeskBrief(quickBrief);
        setBriefState({
          status: 'ready',
          symbol: next,
          startedAt,
          elapsedMs: Math.max(quickBrief.latencyMs, Date.now() - startedAt),
        });
      }
      return output;
    } catch {
      briefRequestsRef.current.delete(cacheKey);
      if (canUseVoice() && briefGenerationRef.current === generation && symbolRef.current === next) {
        setBriefState({ status: 'error', symbol: next, startedAt, elapsedMs: Date.now() - startedAt });
      }
      return { error: 'tool_failed', symbol: next } as Record<string, unknown>;
    }
  }, [lang, voiceLocale, fetchVoiceTool]);

  const runTool = useCallback(async (name: string, callId: string, rawArgs: string) => {
    if (!canUseVoice()) return;
    const generation = connectionGenerationRef.current;
    const eventId = `${callId}-${name}`;
    setTools((prev) => [
      ...prev.slice(-4),
      { id: eventId, tool: name, status: 'running', label: lang === 'es' ? {"Reading market data": "Leyendo mercado", "Analyzing asset": "Analizando activo", "Reading the on-chain record": "Leyendo récord on-chain", "Preparing proposal": "Preparando propuesta", "Changing chart": "Cambiando gráfica", "Publishing debate": "Publicando debate", "Marking levels": "Marcando niveles", "Updating verdict": "Actualizando veredicto"}[TOOL_LABELS[name]] ?? name : translateText(lang, TOOL_LABELS[name] ?? name) },
    ]);

    let output: unknown;
    try {
      const args = rawArgs ? JSON.parse(rawArgs) : {};

      if (UI_TOOLS.has(name)) {
        // Resolved locally: these only move pixels, so they land instantly.
        if (name === 'set_chart') {
          if (args.symbol) {
            // The visible chart switches immediately. The evidence request is
            // deliberately backgrounded so this UI tool can answer the model
            // without adding another sequential wait.
            void requestAssetBrief(String(args.symbol), 'Realtime asset switch');
          }
          if (args.timeframe) setTimeframe(String(args.timeframe));
          output = { ok: true, showing: args.symbol, timeframe: args.timeframe ?? 'unchanged' };
        } else if (name === 'draw_levels') {
          const drawn = ((args.levels ?? []) as Array<Record<string, unknown>>)
            .map((raw) => {
              const price = Number(raw.price);
              if (!Number.isFinite(price)) return null;
              const to = Number(raw.price_to);
              return {
                price,
                label: String(raw.label ?? ''),
                kind: (raw.kind ?? 'level') as ChartLevel['kind'],
                ...(raw.agent ? { agent: raw.agent as ChartLevel['agent'] } : {}),
                ...(Number.isFinite(to) && to > 0 && to !== price ? { priceTo: to } : {}),
              } satisfies ChartLevel;
            })
            .filter((level): level is ChartLevel => level !== null);
          setLevels(drawn);
          output = { ok: true, drawn: drawn.length };
        } else if (name === 'show_debate') {
          const debateLevels = [
            ...debateLevel(args, 'alpha', 'alpha_price', 'alpha_price_label', 'alpha_zone_to', 'Zona Alpha'),
            ...debateLevel(args, 'red', 'red_team_price', 'red_team_price_label', 'red_team_zone_to', 'Invalidación'),
            ...debateLevel(args, 'cio', 'cio_price', 'cio_price_label', 'cio_zone_to', 'Zona CIO'),
          ];
          setDebate({
            alpha: String(args.alpha ?? ''),
            redTeam: String(args.red_team ?? ''),
            cio: String(args.cio ?? ''),
            alphaConviction: typeof args.alpha_conviction === 'number' ? args.alpha_conviction : null,
            redTeamSeverity: typeof args.red_team_severity === 'number' ? args.red_team_severity : null,
            cioConviction: typeof args.cio_conviction === 'number' ? args.cio_conviction : null,
            indicators: Array.isArray(args.indicators) ? args.indicators.map(String).slice(0, 4) : [],
            levels: debateLevels,
          });
          output = { ok: true, published: true, levels_drawn: debateLevels.length };
        } else {
          setThesis({
            verdict: args.verdict,
            conviction: typeof args.conviction === 'number' ? args.conviction : null,
            reason: String(args.reason ?? ''),
            risk: args.risk ? String(args.risk) : null,
            invalidation: args.invalidation ? String(args.invalidation) : null,
          });
          output = { ok: true, published: true };
        }
        setTools((prev) => prev.map((t) => (t.id === eventId ? { ...t, status: 'done' } : t)));
        submitToolOutput(callId, output);
        return;
      }

      if (name === 'run_debate' && args.symbol) {
        output = await requestAssetBrief(String(args.symbol), args.context ? String(args.context) : undefined);
      } else {
        output = await fetchVoiceTool({ tool: name, args: { ...args, lang, locale: voiceLocale } });
      }

      if (generation !== connectionGenerationRef.current) return;
      if (name === 'propose_trade') {
        const p = (output as { proposal?: TradeProposal }).proposal;
        if (p) setProposal(p);
      }
      setTools((prev) => prev.map((t) => (t.id === eventId ? { ...t, status: 'done' } : t)));
    } catch {
      output = { error: 'tool_failed' };
      setTools((prev) => prev.map((t) => (t.id === eventId ? { ...t, status: 'failed' } : t)));
    }

    if (generation === connectionGenerationRef.current) submitToolOutput(callId, output);
  }, [lang, voiceLocale, requestAssetBrief, submitToolOutput, fetchVoiceTool]);

  /** Run a tool exactly once, whichever event surfaces it first. */
  const dispatchTool = useCallback((name: string | undefined, callId: string, args: string) => {
    if (!name || !callId || dispatchedRef.current.has(callId)) return;
    dispatchedRef.current.add(callId);
    if (dispatchedRef.current.size > 64) {
      dispatchedRef.current = new Set([...dispatchedRef.current].slice(-32));
    }
    void runTool(name, callId, args);
  }, [runTool]);

  const handleEvent = useCallback((event: Record<string, unknown>) => {
    const type = String(event.type ?? '');
    if ((type === 'error' && !['response_cancel_not_active', 'conversation_already_has_active_response'].includes(String((event.error as { code?: string })?.code)))
      || (type === 'response.done' && (event.response as { status?: string })?.status === 'failed')) {
      fallbackRef.current(); return;
    }
    if (type === 'input_audio_buffer.speech_stopped') armWatchdog();
    if (type === 'output_audio_buffer.started' || type === 'response.output_audio.delta') clearWatchdog();

    // --- speaking / listening state ---
    if (type === 'input_audio_buffer.speech_started') setState('listening');
    if (type === 'input_audio_buffer.speech_stopped') setState('thinking');
    if (type === 'response.created') responseActiveRef.current = true;
    if (type === 'output_audio_buffer.started' || type === 'response.output_audio.delta') {
      playbackActiveRef.current = true;
      // In speaker mode Bobby must never feed his own audio back into the turn.
      if (inputModeRef.current === 'tap-to-talk') setMicEnabled(false);
      setState('speaking');
    }
    if (type === 'output_audio_buffer.stopped' || type === 'output_audio_buffer.cleared') {
      playbackActiveRef.current = false;
      setState('listening');
    }
    if (type === 'response.done' && !playbackActiveRef.current) {
      setState((s) => (s === 'speaking' || s === 'thinking' ? 'listening' : s));
    }

    // --- transcripts ---
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const text = String(event.transcript ?? '').trim();
      if (text) {
        const rejectedNoise = hasUnexpectedScript(text);
        const visibleText = rejectedNoise
          ? (lang === 'es' ? 'Audio no reconocido — intenta de nuevo.' : translateText(lang, 'Audio not recognized — please try again.'))
          : text;
        const mentioned = rejectedNoise ? null : symbolMentioned(text);
        if (mentioned) {
          void requestAssetBrief(mentioned, text);
        }
        setTranscript((prev) => [...prev.slice(-20), { id: `u-${Date.now()}`, role: 'user', text: visibleText, final: true }]);
      }
    }
    if (type === 'response.output_audio_transcript.delta') {
      const delta = String(event.delta ?? '');
      const id = String(event.response_id ?? 'bobby');
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.id === id && !last.final) {
          return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
        }
        return [...prev.slice(-20), { id, role: 'bobby', text: delta, final: false }];
      });
    }
    if (type === 'response.output_audio_transcript.done') {
      const id = String(event.response_id ?? 'bobby');
      setTranscript((prev) => prev.map((l) => (l.id === id ? { ...l, final: true } : l)));
    }

    // --- tool calls ---
    // The model announces the call here, before any arguments have streamed.
    // Remembering the name lets us fire as soon as the arguments land.
    if (type === 'response.output_item.added') {
      const item = event.item as Record<string, string> | undefined;
      if (item?.type === 'function_call' && item.call_id && item.name) {
        callNamesRef.current.set(item.call_id, item.name);
      }
    }

    // The latency win: arguments are complete, so run the tool NOW — Bobby is
    // usually still speaking, and the chart moves under his voice.
    if (type === 'response.function_call_arguments.done') {
      const callId = String(event.call_id ?? '');
      const name = (event.name as string | undefined) ?? callNamesRef.current.get(callId);
      dispatchTool(name, callId, String(event.arguments ?? ''));
    }

    if (type === 'response.done') {
      responseActiveRef.current = false;
      // Safety net for any call the early path missed (e.g. a truncated turn).
      const output = (event.response as { output?: Array<Record<string, string>> })?.output ?? [];
      output
        .filter((item) => item.type === 'function_call')
        .forEach((item) => dispatchTool(item.name, item.call_id, item.arguments));
      // A tool answered mid-turn; now that the turn is over, let Bobby continue.
      if (responseOwedRef.current) {
        responseOwedRef.current = false;
        send({ type: 'response.create' });
      }
    }
  }, [dispatchTool, lang, requestAssetBrief, send, setMicEnabled]);

  const disconnect = useCallback(() => {
    connectionGenerationRef.current += 1;
    clearWatchdog();
    const lease = leaseRef.current;
    leaseRef.current = null;
    if (lease) void fetch('/api/realtime-session', { method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lease.token}` },
      body: JSON.stringify({ action: 'stop', lease_id: lease.id }),
    }).catch(() => {});
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    connectAbortRef.current?.abort();
    connectAbortRef.current = null;
    for (const controller of toolAbortControllersRef.current) controller.abort();
    toolAbortControllersRef.current.clear();
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    sessionTimerRef.current = null;
    baseInstructionsRef.current = '';
    playbackActiveRef.current = false;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.srcObject = null; }
    audioRef.current = null;
    if (dcRef.current) { dcRef.current.onmessage = null; dcRef.current.onopen = null; dcRef.current.onclose = null; dcRef.current.onerror = null; }
    if (pcRef.current) { pcRef.current.ontrack = null; pcRef.current.onconnectionstatechange = null; }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    dcRef.current?.close();
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    dcRef.current = null;
    pcRef.current = null;
    micRef.current = null;
    ctxRef.current = null;
    analysersRef.current = {};
    callNamesRef.current.clear();
    dispatchedRef.current.clear();
    responseActiveRef.current = false;
    responseOwedRef.current = false;
    briefGenerationRef.current += 1;
    briefRequestsRef.current.clear();
    setMicMuted(inputModeRef.current === 'tap-to-talk');
    setLevel(0);
    stateRef.current = 'idle';
    setState('idle');
  }, []);

  fallbackRef.current = () => { disconnect(); if (canUseVoice()) setFallback(true); };

  const resetConversation = useCallback(() => {
    briefGenerationRef.current += 1;
    setTranscript([]);
    setTools([]);
    setProposal(null);
    setLevels([]);
    setThesis(null);
    setDebate(null);
    setDeskBrief(null);
    setBriefState({ status: 'idle', symbol: null, startedAt: null, elapsedMs: null });
    briefRequestsRef.current.clear();
  }, []);

  const connect = useCallback(async () => {
    if (!canUseVoice()) return;
    if (stateRef.current !== 'idle' && stateRef.current !== 'error') return;
    const generation = ++connectionGenerationRef.current;
    const isCurrent = () => canUseVoice() && generation === connectionGenerationRef.current;
    stateRef.current = 'connecting';
    setError(null);
    setFallback(false);
    setNeedsSignIn(false);
    setState('connecting');
    const controller = new AbortController();
    connectAbortRef.current = controller;

    try {
      const { data: auth } = await bobbySupabase().auth.getSession();
      if (!isCurrent()) return;
      const accessToken = auth.session?.access_token;
      if (!accessToken) {
        setNeedsSignIn(true);
        throw Object.assign(new Error(lang === 'es' ? 'Inicia sesión para usar tus 3 min diarios.' : translateText(lang, 'Sign in for your 3 daily minutes.')), { name: 'VoiceSignInError' });
      }
      // Permission delays must not consume the account's allowance.
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      if (!isCurrent()) { mic.getTracks().forEach((track) => track.stop()); return; }
      micRef.current = mic;
      setMicMuted(false);
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      await ctx.resume();
      if (!isCurrent()) return;

      armWatchdog();
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audio = new Audio();
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (event) => {
        if (!isCurrent()) return;
        audio.srcObject = event.streams[0];
        const out = ctx.createAnalyser();
        out.fftSize = 512;
        ctx.createMediaStreamSource(event.streams[0]).connect(out);
        analysersRef.current.out = out;
      };
      pc.onconnectionstatechange = () => {
        if (!isCurrent() || pc.connectionState !== 'failed') return;
        fallbackRef.current();
      };
      pc.addTrack(mic.getAudioTracks()[0], mic);
      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 512;
      ctx.createMediaStreamSource(mic).connect(micAnalyser);
      analysersRef.current.mic = micAnalyser;

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = (e) => {
        if (!isCurrent()) return;
        try { handleEvent(JSON.parse(e.data)); } catch { /* ignore malformed frame */ }
      };
      dc.onclose = dc.onerror = () => { if (isCurrent()) fallbackRef.current(); };
      dc.onopen = () => {
        if (!isCurrent()) return;
        clearWatchdog();
        setState('listening');
        syncScreen();
      };
      const offer = await pc.createOffer();
      if (!isCurrent()) return;
      await pc.setLocalDescription(offer);
      if (!isCurrent()) return;
      // The server keeps the provider credential and owns the hangup deadline.
      const sessionRes = await fetch('/api/realtime-session', {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ sdp: offer.sdp, lang, locale: voiceLocale, autoLanguage, voice: voice ?? getConfiguredVoice() ?? undefined,
          symbol: symbolRef.current, timeframe: timeframeRef.current }),
      });
      const session = await sessionRes.json();
      if (session.lease_id) {
        const lease = { id: session.lease_id as string, token: accessToken };
        if (!isCurrent()) {
          void fetch('/api/realtime-session', { method: 'POST', keepalive: true,
            headers: { Authorization: `Bearer ${lease.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop', lease_id: lease.id }) }).catch(() => {});
          return;
        }
        leaseRef.current = lease;
      }
      if (!isCurrent()) return;
      if (!sessionRes.ok || !session.sdp) {
        if (sessionRes.status !== 401) { fallbackRef.current(); return; }
        if (sessionRes.status === 401) setNeedsSignIn(true);
        const messages: Record<string, [string, string]> = {
          voice_daily_limit: ['Usaste tus 3 min de hoy. Vuelve mañana.', 'Your 3 minutes are used for today. Come back tomorrow.'],
          voice_busy: ['Ya tienes una llamada abierta. Ciérrala para continuar.', 'A call is already open. Close it to continue.'],
          voice_sign_in: ['Inicia sesión para usar tus 3 min diarios.', 'Sign in for your 3 daily minutes.'],
        };
        const message = messages[sessionRes.status === 401 ? 'voice_sign_in' : session.error];
        throw Object.assign(new Error(lang === 'es' ? message?.[0] ?? 'Voz no disponible. Intenta de nuevo.' : translateText(lang, message?.[1] ?? 'Voice unavailable. Please try again.')), { name: sessionRes.status === 401 ? 'VoiceSignInError' : 'VoiceUnavailableError' });
      }
      baseInstructionsRef.current = typeof session.instructions === 'string' ? session.instructions : '';
      const seconds = Math.max(0, Math.min(180, Number(session.max_duration_seconds) || 0));
      const deadline = Date.now() + seconds * 1000;
      setRemainingSeconds(seconds);
      countdownRef.current = setInterval(() => setRemainingSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 1000);
      sessionTimerRef.current = setTimeout(() => {
        setRemainingSeconds(0);
        fallbackRef.current();
      }, seconds * 1000);
      await pc.setRemoteDescription({ type: 'answer', sdp: session.sdp });
      if (isCurrent()) rafRef.current = requestAnimationFrame(meter);
    } catch (err) {
      if (!isCurrent()) return;
      disconnect();
      if (!(err instanceof Error && (err.message.includes('3 min') || err.message.includes('3 daily') || err.name === 'NotAllowedError' || err.name === 'VoiceSignInError'))) setFallback(true);
      setError(err instanceof Error ? (err.name === 'NotAllowedError' ? translateText(lang, 'Microphone access was denied. Enable it in your browser.') : translateText(lang, err.message)) : translateText(lang, 'Voice failed to start'));
      stateRef.current = 'error';
      setState('error');
    }
  }, [lang, voiceLocale, autoLanguage, voice, handleEvent, meter, disconnect, syncScreen]);

  useEffect(() => {
    const unsubscribe = progressStore.subscribe(() => { if (!canUseVoice()) disconnect(); });
    return () => { unsubscribe(); disconnect(); };
  }, [disconnect]);

  /** Tap-to-talk prevents room audio from becoming a new user turn while Bobby speaks. */
  const startTalking = useCallback(() => {
    if (!canUseVoice()) return;
    if (inputModeRef.current !== 'tap-to-talk') return;
    if (stateRef.current === 'speaking' || stateRef.current === 'thinking') {
      send({ type: 'response.cancel' });
      send({ type: 'output_audio_buffer.clear' });
    }
    send({ type: 'input_audio_buffer.clear' });
    setMicEnabled(true);
    setState('listening');
  }, [send, setMicEnabled]);

  const stopTalking = useCallback(() => {
    if (inputModeRef.current === 'tap-to-talk') setMicEnabled(false);
  }, [setMicEnabled]);

  return {
    state,
    needsSignIn,
    fallback,
    dismissSignIn: () => setNeedsSignIn(false),
    remainingSeconds,
    error,
    level,
    transcript,
    tools,
    proposal,
    symbol,
    timeframe,
    levels,
    thesis,
    debate,
    deskBrief,
    briefState,
    connect,
    disconnect,
    startTalking,
    stopTalking,
    micMuted,
    requestAssetBrief,
    resetConversation,
    setSymbol: (nextSymbol: string) => { void requestAssetBrief(nextSymbol, 'Manual asset switch'); },
    setTimeframe,
    dismissProposal: () => setProposal(null),
  };
}
