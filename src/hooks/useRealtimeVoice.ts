// ============================================================
// useRealtimeVoice — one live voice session with Bobby.
//
// Browser ⇄ OpenAI Realtime API over WebRTC. The API key never reaches the
// client: /api/realtime-session mints a short-lived ephemeral secret and this
// hook uses only that. Tool calls are executed server-side by /api/voice-tool.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

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
}

export interface DebateSides {
  alpha: string;
  redTeam: string;
  alphaConviction: number | null;
  redTeamSeverity: number | null;
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
          if (args.symbol) setSymbol(String(args.symbol).toUpperCase());
          if (args.timeframe) setTimeframe(String(args.timeframe));
          output = { ok: true, showing: args.symbol, timeframe: args.timeframe ?? 'unchanged' };
        } else if (name === 'draw_levels') {
          const drawn = (args.levels ?? []) as ChartLevel[];
          setLevels(drawn);
          output = { ok: true, drawn: drawn.length };
        } else if (name === 'show_debate') {
          setDebate({
            alpha: String(args.alpha ?? ''),
            redTeam: String(args.red_team ?? ''),
            alphaConviction: typeof args.alpha_conviction === 'number' ? args.alpha_conviction : null,
            redTeamSeverity: typeof args.red_team_severity === 'number' ? args.red_team_severity : null,
          });
          output = { ok: true, published: true };
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
        send({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
        });
        send({ type: 'response.create' });
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

    send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
    });
    send({ type: 'response.create' });
  }, [send]);

  const handleEvent = useCallback((event: Record<string, unknown>) => {
    const type = String(event.type ?? '');

    // --- speaking / listening state ---
    if (type === 'input_audio_buffer.speech_started') setState('listening');
    if (type === 'input_audio_buffer.speech_stopped') setState('thinking');
    if (type === 'response.output_audio.delta') setState('speaking');
    if (type === 'response.done' || type === 'response.output_audio.done') {
      setState((s) => (s === 'speaking' || s === 'thinking' ? 'listening' : s));
    }

    // --- transcripts ---
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const text = String(event.transcript ?? '').trim();
      if (text) {
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
    if (type === 'response.done') {
      const output = (event.response as { output?: Array<Record<string, string>> })?.output ?? [];
      output
        .filter((item) => item.type === 'function_call')
        .forEach((item) => runTool(item.name, item.call_id, item.arguments));
    }
  }, [runTool]);

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
    setTimeframe,
    dismissProposal: () => setProposal(null),
  };
}
