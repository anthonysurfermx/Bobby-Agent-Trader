// ============================================================
// LiveOrb — the visual centre of the realtime voice desk.
//
// Distinct from VoiceOrb (the Siri-style orb used by the classic chat): this one
// is driven by a single normalised level from the live WebRTC session, so it
// reads as a meter of the conversation rather than a decorative loop.
// ============================================================

import { useEffect, useRef } from 'react';
import type { VoiceState } from '@/hooks/useRealtimeVoice';

const BASE = { r: 0, g: 82, b: 255 };
const LIGHT = { r: 125, g: 166, b: 255 };

const PARTICLES = 120;

interface Particle {
  angle: number;
  radius: number;
  speed: number;
  size: number;
}

export function LiveOrb({ state, level }: { state: VoiceState; level: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const levelRef = useRef(level);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { levelRef.current = level; }, [level]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const particles: Particle[] = Array.from({ length: PARTICLES }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.55 + Math.random() * 0.75,
      speed: 0.0009 + Math.random() * 0.0026,
      size: 0.6 + Math.random() * 1.7,
    }));

    let frame = 0;
    let raf = 0;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = () => {
      frame += 1;
      const t = frame / 60;
      const s = stateRef.current;
      const lvl = levelRef.current;
      const cx = width / 2;
      const cy = height / 2;
      const unit = Math.min(width, height) / 2;
      const core = unit * 0.30;

      // Energy: idle breathes gently, active tracks the live voice.
      const idle = 0.10 + Math.sin(t * 1.4) * 0.035;
      const energy = s === 'idle' || s === 'error' ? idle : Math.max(idle, lvl);
      const rgb = s === 'speaking' ? BASE : LIGHT;
      const dim = s === 'idle' || s === 'error' ? 0.4 : 1;

      ctx.clearRect(0, 0, width, height);

      // --- ambient halo ---
      const halo = ctx.createRadialGradient(cx, cy, core * 0.2, cx, cy, unit * (0.95 + energy * 0.3));
      halo.addColorStop(0, `rgba(${BASE.r},${BASE.g},${BASE.b},${(0.30 + energy * 0.45) * dim})`);
      halo.addColorStop(0.45, `rgba(${BASE.r},${BASE.g},${BASE.b},${0.09 * dim})`);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      // --- particle field: converges while listening, radiates while speaking ---
      particles.forEach((p, i) => {
        if (!prefersReduced) p.angle += p.speed * (s === 'thinking' ? 3.2 : 1);
        const pull = s === 'listening' ? 1 - energy * 0.3 : s === 'speaking' ? 1 + energy * 0.32 : 1;
        const wobble = Math.sin(t * 1.6 + i) * 0.02;
        const r = unit * p.radius * pull + unit * wobble;
        const x = cx + Math.cos(p.angle) * r;
        const y = cy + Math.sin(p.angle) * r * 0.82;
        const alpha = (0.16 + energy * 0.5) * dim * (1 - Math.min(1, p.radius / 1.5) * 0.5);
        ctx.beginPath();
        ctx.arc(x, y, p.size * (0.7 + energy * 0.8), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${LIGHT.r},${LIGHT.g},${LIGHT.b},${alpha})`;
        ctx.fill();
      });

      // --- audio-reactive spectrum ring ---
      const bars = 96;
      const inner = core * 1.42;
      for (let i = 0; i < bars; i++) {
        const a = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const noise = Math.sin(i * 0.7 + t * 3.1) * 0.5 + Math.sin(i * 1.9 - t * 2.2) * 0.5;
        const len = unit * (0.035 + energy * 0.30 * (0.55 + noise * 0.45));
        const x1 = cx + Math.cos(a) * inner;
        const y1 = cy + Math.sin(a) * inner;
        const x2 = cx + Math.cos(a) * (inner + len);
        const y2 = cy + Math.sin(a) * (inner + len);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${(0.22 + energy * 0.7) * dim})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // --- orbital rings (tilted ellipses) ---
      const rings = [
        { rx: 0.62, ry: 0.24, tilt: t * 0.18, w: 1.2 },
        { rx: 0.78, ry: 0.32, tilt: -t * 0.12 + 1, w: 1 },
        { rx: 0.92, ry: 0.20, tilt: t * 0.08 + 2.2, w: 0.8 },
      ];
      rings.forEach((ring, i) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ring.tilt);
        ctx.beginPath();
        ctx.ellipse(0, 0, unit * ring.rx, unit * ring.ry * (1 + energy * 0.14), 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${LIGHT.r},${LIGHT.g},${LIGHT.b},${(0.16 + energy * 0.24 - i * 0.03) * dim})`;
        ctx.lineWidth = ring.w;
        ctx.stroke();
        // travelling node on the ring
        const na = t * (0.5 + i * 0.25);
        const nx = Math.cos(na) * unit * ring.rx;
        const ny = Math.sin(na) * unit * ring.ry * (1 + energy * 0.14);
        ctx.beginPath();
        ctx.arc(nx, ny, 2.4 + energy * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(0.5 + energy * 0.5) * dim})`;
        ctx.fill();
        ctx.restore();
      });

      // --- thinking sweep ---
      if (s === 'thinking' || s === 'connecting') {
        const sweep = (t * 2.4) % (Math.PI * 2);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, unit * 0.98, sweep, sweep + 0.55);
        ctx.closePath();
        const g = ctx.createRadialGradient(cx, cy, core, cx, cy, unit);
        g.addColorStop(0, 'rgba(125,166,255,0)');
        g.addColorStop(1, 'rgba(125,166,255,0.16)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
      }

      // --- core ---
      const coreR = core * (1 + energy * 0.24);
      const grad = ctx.createRadialGradient(cx - coreR * 0.3, cy - coreR * 0.35, coreR * 0.1, cx, cy, coreR);
      grad.addColorStop(0, `rgba(190,215,255,${0.95 * dim})`);
      grad.addColorStop(0.4, `rgba(${LIGHT.r},${LIGHT.g},${LIGHT.b},${0.9 * dim})`);
      grad.addColorStop(1, `rgba(${BASE.r},${BASE.g},${BASE.b},${0.92 * dim})`);
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowColor = `rgba(${BASE.r},${BASE.g},${BASE.b},${0.75 * dim})`;
      ctx.shadowBlur = 45 + energy * 90;
      ctx.fill();
      ctx.shadowBlur = 0;

      // inner rim
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 0.97, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${(0.22 + energy * 0.4) * dim})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
