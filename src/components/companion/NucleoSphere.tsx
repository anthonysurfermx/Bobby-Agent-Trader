// The Núcleo glass on the web desk — the same WebGL sphere as the iPhone app and the home page
// (public/home/assets/sphere.js, the shader lifted verbatim from iOS 1.5), wrapped for React.
// The desk drives it: idle, listening, the three-voice debate, then the verdict word on the glass.
import { useEffect, useRef } from 'react';

export type SphereMode = 'idle' | 'listen' | 'debate' | 'verdict';
export type SphereVerdict = 'ready' | 'wait' | 'pass';
export type AgentFocus = 'alpha' | 'red' | 'cio' | null;

interface SphereApi {
  set(mode: string, verdict?: string): SphereApi;
  tint(hex: string, amount?: number): SphereApi;
  destroy?: () => void;
}
declare global {
  interface Window { BobbySphere?: { mount(canvas: HTMLCanvasElement, opts: Record<string, unknown>): SphereApi } }
}

let loading: Promise<void> | null = null;
function loadSphere(): Promise<void> {
  if (window.BobbySphere) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/home/assets/sphere.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(new Error('sphere script failed to load')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** Companion glass tints from the Núcleo design (identity hues, never the three semantic ones). */
export const GLASS_TINT: Record<string, string> = {
  matrix: '#A8C79A', plasma: '#B99CF0', ice: '#A7BFE8', gold: '#E6D6A8', ghost: '#B8C2D3', lava: '#D9A48E',
};
const VERDICT_COLOR: Record<SphereVerdict, string> = { ready: '#3FE0B5', wait: '#F6B94E', pass: '#FF5A5F' };
const AGENT_COLOR = { alpha: '#3FE0B5', red: '#FF5A5F', cio: '#F6B94E' } as const;

interface Props {
  /** Diameter of the glass in CSS px; the canvas is larger so the halo can breathe. */
  size: number;
  mode: SphereMode;
  verdict?: SphereVerdict;
  /** The word that condenses on the glass once the desk has decided. */
  word?: string | null;
  /** A small line under the word (conviction, for instance). */
  sub?: string | null;
  tint?: string | null;
  /** While the desk debates: which voice is speaking. Null hides the three labels. */
  agents?: AgentFocus | 'all';
  agentNames?: { alpha: string; red: string; cio: string };
  /** 'around' places the voices beside the glass (desktop); 'row' lines them up under it (phones). */
  agentsLayout?: 'around' | 'row';
}

export default function NucleoSphere({ size, mode, verdict = 'wait', word, sub, tint, agents = null, agentNames, agentsLayout = 'around' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<SphereApi | null>(null);
  const modeRef = useRef({ mode, verdict, tint });
  modeRef.current = { mode, verdict, tint };

  useEffect(() => {
    let alive = true;
    void loadSphere().then(() => {
      if (!alive || !canvasRef.current || !window.BobbySphere) return;
      const api = window.BobbySphere.mount(canvasRef.current, { scale: 1, dpr: 1.5 });
      apiRef.current = api;
      const m = modeRef.current;
      api.set(m.mode, m.verdict);
      if (m.tint) api.tint(m.tint, 0.28);
    }).catch(() => { /* the page still works without the glass */ });
    return () => { alive = false; apiRef.current?.destroy?.(); apiRef.current = null; };
  }, []);

  useEffect(() => { apiRef.current?.set(mode, verdict); }, [mode, verdict]);
  useEffect(() => { if (apiRef.current) apiRef.current.tint(tint ?? '#B8C2D3', tint ? 0.28 : 0); }, [tint]);

  const canvas = Math.round(size * 1.9);
  const ring = verdict ? VERDICT_COLOR[verdict] : VERDICT_COLOR.wait;
  const showWord = mode === 'verdict' && !!word;
  const r = size / 2;
  const wordSize = Math.round(r * ((word ?? '').length > 6 ? 0.34 : 0.5));

  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
      <canvas ref={canvasRef} style={{ position: 'absolute', left: '50%', top: '50%', width: canvas, height: canvas, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
      {/* the verdict: one word on the glass inside a thin ring, like the iPhone */}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: showWord ? 1 : 0, transition: 'opacity .5s ease', pointerEvents: 'none' }}>
        <span style={{ position: 'absolute', width: size * 1.14, height: size * 1.14, borderRadius: '50%', border: `1.5px solid ${ring}`,
          boxShadow: `0 0 40px -6px ${ring}73, inset 0 0 40px -12px ${ring}59`, transform: `scale(${showWord ? 1 : 1.08})`, transition: 'transform .6s cubic-bezier(.2,.8,.2,1)' }} />
        <span style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
          <span className="n-display" style={{ fontSize: wordSize, lineHeight: 1, color: '#FFF8EC', textShadow: '0 2px 24px rgba(42,28,8,.8)', whiteSpace: 'nowrap' }}>{word}</span>
          {sub && <span className="n-mono" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: ring }}>{sub}</span>}
        </span>
      </div>
      {/* the three voices around the glass while the desk debates */}
      {agents && agentNames && agentsLayout === 'row' && (
        <div style={{ position: 'absolute', left: '50%', top: '100%', marginTop: size * 0.12, transform: 'translateX(-50%)', display: 'flex', gap: 14 }}>
          {(['alpha', 'red', 'cio'] as const).map((k) => (
            <span key={k} className="n-agent" style={{ position: 'static', color: AGENT_COLOR[k], opacity: agents === 'all' || agents === k ? 1 : 0.32 }}><i />{agentNames[k]}</span>
          ))}
        </div>
      )}
      {agents && agentNames && agentsLayout === 'around' && (['alpha', 'red', 'cio'] as const).map((k) => {
        const on = agents === 'all' || agents === k;
        const pos: React.CSSProperties = k === 'alpha' ? { right: '100%', top: '8%', marginRight: -size * 0.06, flexDirection: 'row' }
          : k === 'red' ? { left: '100%', top: '8%', marginLeft: -size * 0.06, flexDirection: 'row-reverse' }
          : { left: '50%', top: '100%', marginTop: size * 0.1, transform: 'translateX(-50%)', flexDirection: 'row' };
        return (
          <span key={k} className="n-agent" style={{ ...pos, color: AGENT_COLOR[k], opacity: on ? 1 : 0.32 }}>
            <i />{agentNames[k]}
          </span>
        );
      })}
    </div>
  );
}
