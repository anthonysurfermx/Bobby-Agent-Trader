// ============================================================
// VoiceOrb — Bobby's Siri-style fluid intelligence visualizer
// Canvas-based mesh gradient that morphs with voice frequency
// States: idle (breathing) → thinking (rapid pulses) → speaking (flowing waves)
// Mood-reactive colors: green → amber → red
// ============================================================

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type OrbMood = 'confident' | 'cautious' | 'defensive' | 'alpha' | 'redteam' | 'cio';
export type OrbState = 'idle' | 'thinking' | 'speaking' | 'listening';

const MOOD_PALETTES: Record<OrbMood, { primary: string; secondary: string; accent: string; glow: string }> = {
  confident: {
    primary: 'rgba(34,197,94,',    // green-500
    secondary: 'rgba(16,185,129,', // emerald-500
    accent: 'rgba(52,211,153,',    // emerald-400
    glow: '0, 255, 100',
  },
  cautious: {
    primary: 'rgba(245,158,11,',   // amber-500
    secondary: 'rgba(251,191,36,', // amber-400
    accent: 'rgba(252,211,77,',    // amber-300
    glow: '255, 180, 0',
  },
  defensive: {
    primary: 'rgba(239,68,68,',    // red-500
    secondary: 'rgba(248,113,113,',// red-400
    accent: 'rgba(252,165,165,',   // red-300
    glow: '255, 80, 80',
  },
  // Multi-agent debate voices
  alpha: {
    primary: 'rgba(34,197,94,',    // green — aggressive, opportunity
    secondary: 'rgba(74,222,128,', // green-400
    accent: 'rgba(134,239,172,',   // green-300
    glow: '0, 255, 120',
  },
  redteam: {
    primary: 'rgba(239,68,68,',    // red — skeptical, risk
    secondary: 'rgba(220,38,38,',  // red-600
    accent: 'rgba(248,113,113,',   // red-400
    glow: '255, 50, 50',
  },
  cio: {
    primary: 'rgba(250,204,21,',   // gold — Bobby CIO, the boss
    secondary: 'rgba(234,179,8,',  // yellow-500
    accent: 'rgba(253,224,71,',    // yellow-300
    glow: '255, 215, 0',
  },
};

interface VoiceOrbProps {
  analyser: AnalyserNode | null;
  state: OrbState;
  mood?: OrbMood;
  size?: number; // px, default 160
}

export function VoiceOrb({ analyser, state, mood = 'confident', size = 160 }: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);
  const [volume, setVolume] = useState(0);
  const palette = MOOD_PALETTES[mood];

  // Smooth volume tracking
  const smoothVolumeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const baseRadius = size * 0.28;

    const draw = (timestamp: number) => {
      const dt = timestamp - (timeRef.current || timestamp);
      timeRef.current = timestamp;
      const time = timestamp * 0.001;

      // Get audio volume
      let targetVolume = 0;
      if (analyser && state === 'speaking') {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        targetVolume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 128;
      }

      // Smooth volume transitions
      const smoothing = state === 'speaking' ? 0.15 : 0.05;
      smoothVolumeRef.current += (targetVolume - smoothVolumeRef.current) * smoothing;
      const vol = smoothVolumeRef.current;
      setVolume(vol);

      // State-dependent parameters
      let speed: number, complexity: number, amplitude: number, innerGlow: number;
      switch (state) {
        case 'thinking':
          speed = 3.0;        // fast rotation
          complexity = 6;      // more blobs
          amplitude = 0.15;    // tight pulses
          innerGlow = 0.6;
          break;
        case 'speaking':
          speed = 1.2 + vol;   // synced with voice
          complexity = 4;
          amplitude = 0.1 + vol * 0.25; // waves outward
          innerGlow = 0.4 + vol * 0.6;
          break;
        case 'listening':
          speed = 0.8;
          complexity = 3;
          amplitude = 0.08;
          innerGlow = 0.5;
          break;
        default: // idle
          speed = 0.4;         // slow breathing
          complexity = 3;
          amplitude = 0.06;
          innerGlow = 0.3;
      }

      // Clear
      ctx.clearRect(0, 0, size, size);

      // Outer glow
      const glowRadius = baseRadius * (1.8 + vol * 0.6);
      const glowGrad = ctx.createRadialGradient(center, center, 0, center, center, glowRadius);
      glowGrad.addColorStop(0, `rgba(${palette.glow}, ${0.15 + vol * 0.2})`);
      glowGrad.addColorStop(0.5, `rgba(${palette.glow}, ${0.05 + vol * 0.08})`);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, size, size);

      // Draw fluid blobs (the Siri effect)
      for (let layer = 2; layer >= 0; layer--) {
        const layerAlpha = layer === 0 ? 0.9 : layer === 1 ? 0.4 : 0.15;
        const layerRadius = baseRadius * (1 - layer * 0.15);

        ctx.beginPath();
        const points = 120;
        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;

          // Multiple sine waves create the fluid morphing
          let r = layerRadius;
          for (let k = 1; k <= complexity; k++) {
            const phase = time * speed * (k % 2 === 0 ? 1 : -1) + k * 1.5;
            r += Math.sin(angle * k + phase) * layerRadius * amplitude * (1 / k);
          }

          // Voice-reactive bulge
          if (state === 'speaking' && vol > 0.1) {
            r += Math.sin(angle * 2 + time * 4) * layerRadius * vol * 0.12;
          }

          // Thinking: rapid contractions
          if (state === 'thinking') {
            r += Math.sin(time * 8) * layerRadius * 0.03;
          }

          const x = center + Math.cos(angle) * r;
          const y = center + Math.sin(angle) * r;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();

        // Gradient fill per layer
        const grad = ctx.createRadialGradient(
          center + Math.sin(time * 0.7) * 8,
          center + Math.cos(time * 0.5) * 8,
          0,
          center, center, layerRadius * 1.2
        );

        if (layer === 0) {
          grad.addColorStop(0, `${palette.accent}${layerAlpha})`);
          grad.addColorStop(0.5, `${palette.primary}${layerAlpha * 0.8})`);
          grad.addColorStop(1, `${palette.secondary}${layerAlpha * 0.3})`);
        } else {
          grad.addColorStop(0, `${palette.secondary}${layerAlpha})`);
          grad.addColorStop(1, `${palette.primary}${layerAlpha * 0.2})`);
        }

        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Center bright core
      const coreGrad = ctx.createRadialGradient(center, center, 0, center, center, baseRadius * 0.3);
      coreGrad.addColorStop(0, `rgba(255,255,255,${innerGlow * 0.4})`);
      coreGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(center, center, baseRadius * 0.3, 0, Math.PI * 2);
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, state, mood, size, palette]);

  const agentName = useMemo(() => {
    switch (mood) {
      case 'alpha': return 'ALPHA HUNTER';
      case 'redteam': return 'RED TEAM';
      case 'cio': return 'BOBBY CIO';
      default: return null;
    }
  }, [mood]);

  const stateLabel = useMemo(() => {
    switch (state) {
      case 'thinking': return 'PROCESSING';
      case 'speaking': return agentName || 'SPEAKING';
      case 'listening': return 'LISTENING';
      default: return 'ONLINE';
    }
  }, [state, agentName]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col items-center gap-2"
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="cursor-pointer"
        role="img"
        aria-label={`Bobby voice status: ${stateLabel}${agentName ? ` — ${agentName}` : ''}`}
      />
      <div className="flex items-center gap-2">
        <motion.div
          animate={{ opacity: state === 'idle' ? 0.4 : 1 }}
          className={`w-1.5 h-1.5 rounded-full ${
            mood === 'alpha' ? 'bg-green-400' : mood === 'redteam' ? 'bg-red-400' : mood === 'cio' ? 'bg-yellow-400' : mood === 'confident' ? 'bg-green-400' : mood === 'cautious' ? 'bg-amber-400' : 'bg-red-400'
          } ${state !== 'idle' ? 'animate-pulse' : ''}`}
        />
        <span className={`text-[9px] font-mono font-bold tracking-[2px] uppercase ${
          mood === 'alpha' ? 'text-green-400/70' : mood === 'redteam' ? 'text-red-400/70' : mood === 'cio' ? 'text-yellow-400/70' : mood === 'confident' ? 'text-green-400/70' : mood === 'cautious' ? 'text-amber-400/70' : 'text-red-400/70'
        }`}>
          {stateLabel}
        </span>
      </div>
    </motion.div>
  );
}
