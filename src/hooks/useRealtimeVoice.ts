// ============================================================
// useRealtimeVoice — one live voice session with Bobby.
//
// Browser ⇄ OpenAI Realtime API over WebRTC. The API key never reaches the
// client: /api/realtime-session mints a short-lived ephemeral secret and this
// hook uses only that. Tool calls are executed server-side by /api/voice-tool.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { matchAssetInText, normalizeAssetSymbol } from '@/lib/voice-assets';

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

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

const TOOL_LABELS: Record<string, string> = {
  get_market: 'Leyendo mercado',
  run_debate: 'Debate de 3 agentes',
  get_protocol_stats: 'Leyendo récord on-chain',
  propose_trade: 'Preparando propuesta',
  set_chart: 'Cambiando gráfica',
  show_debate: 'Publicando debate',
  draw_levels: 'Marcando niveles',
  update_thesis: 'Actualizando veredicto',
};

/** Tools resolved in the browser — they drive the UI, so a server hop would only add latency. */
const UI_TOOLS = new Set(['set_chart', 'draw_levels', 'update_thesis', 'show_debate']);

/** Symbol handling lives in the shared registry so the chart, the voice tool
 *  endpoint and this matcher can never disagree about what a ticker is. */
const normalizeSymbol = normalizeAssetSymbol;
const symbolMentioned = matchAssetInText;

/** Pull one agent's price line out of a show_debate payload, or nothing. */
function debateLevel(
  args: Record<string, unknown>,
  agent: 'alpha' | 'red' | 'cio',
  priceKey: string,
  labelKey: string,
  fallbackLabel: string,
): ChartLevel[] {
  const price = Number(args[priceKey]);
  if (!Number.isFinite(price) || price <= 0) return [];
  const label = String(args[labelKey] ?? '').trim() || fallbackLabel;
  return [{ price, label, kind: 'level', agent }];
}

export function useRealtimeVoice(lang: 'es' | 'en' = 'es') {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [tools, setTools] = useState<ToolEvent[]>([]);
  const [proposal, setProposal] = useState<TradeProposal | null>(null);
  const [symbol, setSymbol] = useState('BTC');
  const [timeframe, setTimeframe] = useState('15m');
  const [levels, setLevels] = useState<ChartLevel[]>([]);
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [debate, setDebate] = useState<DebateSides | null>(null);
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

  useEffect(() => { stateRef.current = state; }, [state]);

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
    const dc = dcRef.current;
    if (dc?.readyState === 'open') dc.send(JSON.stringify(payload));
  }, []);

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

  const runTool = useCallback(async (name: string, callId: string, rawArgs: string) => {
    const eventId = `${callId}-${name}`;
    setTools((prev) => [
      ...prev.slice(-4),
      { id: eventId, tool: name, status: 'running', label: TOOL_LABELS[name] ?? name },
    ]);

    let output: unknown;
    try {
      const args = rawArgs ? JSON.parse(rawArgs) : {};

      if (UI_TOOLS.has(name)) {
        // Resolved locally: these only move pixels, so they land instantly.
        if (name === 'set_chart') {
          if (args.symbol) setSymbol(normalizeSymbol(args.symbol));
          if (args.timeframe) setTimeframe(String(args.timeframe));
          output = { ok: true, showing: args.symbol, timeframe: args.timeframe ?? 'unchanged' };
        } else if (name === 'draw_levels') {
          const drawn = (args.levels ?? []) as ChartLevel[];
          setLevels(drawn);
          output = { ok: true, drawn: drawn.length };
        } else if (name === 'show_debate') {
          const debateLevels = [
            ...debateLevel(args, 'alpha', 'alpha_price', 'alpha_price_label', 'Tesis Alpha'),
            ...debateLevel(args, 'red', 'red_team_price', 'red_team_price_label', 'Invalidación'),
            ...debateLevel(args, 'cio', 'cio_price', 'cio_price_label', 'Decisión CIO'),
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

      const response = await fetch('/api/voice-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: name, args }),
      });
      output = await response.json();

      if (name === 'propose_trade') {
        const p = (output as { proposal?: TradeProposal }).proposal;
        if (p) setProposal(p);
      }
      setTools((prev) => prev.map((t) => (t.id === eventId ? { ...t, status: 'done' } : t)));
    } catch {
      output = { error: 'tool_failed' };
      setTools((prev) => prev.map((t) => (t.id === eventId ? { ...t, status: 'failed' } : t)));
    }

    submitToolOutput(callId, output);
  }, [submitToolOutput]);

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

    // --- speaking / listening state ---
    if (type === 'input_audio_buffer.speech_started') setState('listening');
    if (type === 'input_audio_buffer.speech_stopped') setState('thinking');
    if (type === 'response.created') responseActiveRef.current = true;
    if (type === 'response.output_audio.delta') setState('speaking');
    if (type === 'response.done' || type === 'response.output_audio.done') {
      setState((s) => (s === 'speaking' || s === 'thinking' ? 'listening' : s));
    }

    // --- transcripts ---
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const text = String(event.transcript ?? '').trim();
      if (text) {
        const mentioned = symbolMentioned(text);
        if (mentioned) {
          setSymbol(mentioned);
          setLevels([]);
          setDebate(null);
          setThesis(null);
        }
        setTranscript((prev) => [...prev.slice(-20), { id: `u-${Date.now()}`, role: 'user', text, final: true }]);
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
  }, [dispatchTool, send]);

  const disconnect = useCallback(() => {
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
    setLevel(0);
    setState('idle');
  }, []);

  const connect = useCallback(async () => {
    if (stateRef.current !== 'idle' && stateRef.current !== 'error') return;
    setError(null);
    setState('connecting');

    try {
      const sessionRes = await fetch('/api/realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      });
      const session = await sessionRes.json();
      if (!sessionRes.ok || !session.client_secret) {
        throw new Error(session.error || 'Voice session unavailable');
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = new Audio();
      audio.autoplay = true;
      audioRef.current = audio;

      const ctx = new AudioContext();
      ctxRef.current = ctx;

      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        const out = ctx.createAnalyser();
        out.fftSize = 512;
        ctx.createMediaStreamSource(event.streams[0]).connect(out);
        analysersRef.current.out = out;
      };

      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      micRef.current = mic;
      pc.addTrack(mic.getAudioTracks()[0], mic);

      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 512;
      ctx.createMediaStreamSource(mic).connect(micAnalyser);
      analysersRef.current.mic = micAnalyser;

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = (e) => {
        try { handleEvent(JSON.parse(e.data)); } catch { /* ignore malformed frame */ }
      };
      dc.onopen = () => {
        // Ask for the human's transcript too — the model only returns its own by default.
        send({
          type: 'session.update',
          session: { type: 'realtime', audio: { input: { transcription: { model: 'whisper-1' } } } },
        });
        setState('listening');
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.client_secret}`,
          'Content-Type': 'application/sdp',
        },
      });
      if (!sdpRes.ok) throw new Error('Could not establish the voice link');

      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });

      rafRef.current = requestAnimationFrame(meter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice failed to start');
      setState('error');
      disconnect();
      setState('error');
    }
  }, [lang, handleEvent, meter, send, disconnect]);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    state,
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
    connect,
    disconnect,
    setSymbol: (nextSymbol: string) => {
      const next = normalizeSymbol(nextSymbol);
      setSymbol(next);
      setLevels([]);
      setDebate(null);
      setThesis(null);
    },
    setTimeframe,
    dismissProposal: () => setProposal(null),
  };
}
