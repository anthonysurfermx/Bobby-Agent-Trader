// ============================================================
// BobbyMascot — the agent's face: a customizable terminal creature
// Replaces the abstract orb for personal agents (Gen Z: pet > orb).
// Same interface as VoiceOrb (state + analyser) so it drops into
// AdamsChat, plus a `look` config from the character creator.
// States: idle (bob + blink) · listening (ring pulse, antenna glow)
//         thinking (eyes up + floating dots) · speaking (mouth
//         driven by AnalyserNode, or procedural sine when absent)
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { type MascotLook, getPalette } from '@/lib/mascot';
import type { OrbState } from '@/components/adams/VoiceOrb';

interface BobbyMascotProps {
  look: MascotLook;
  state?: OrbState;
  analyser?: AnalyserNode | null;
  size?: number;
  className?: string;
}

export default function BobbyMascot({ look, state = 'idle', analyser = null, size = 160, className }: BobbyMascotProps) {
  const palette = getPalette(look);
  const [blink, setBlink] = useState(false);
  const mouthRef = useRef<SVGEllipseElement>(null);
  const rafRef = useRef<number>(0);

  // ---- Blink loop (random 2.5–5.5s) ----
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let alive = true;
    const scheduleBlink = () => {
      timeout = setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        setTimeout(() => { if (alive) setBlink(false); }, 140);
        scheduleBlink();
      }, 2500 + Math.random() * 3000);
    };
    scheduleBlink();
    return () => { alive = false; clearTimeout(timeout); };
  }, []);

  // ---- Mouth animation while speaking ----
  // Real amplitude from the AnalyserNode when available; otherwise a
  // procedural sine so the mascot still "talks" (e.g. wizard previews).
  useEffect(() => {
    if (state !== 'speaking') {
      if (mouthRef.current) mouthRef.current.setAttribute('ry', '3');
      return;
    }
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const start = performance.now();
    const tick = (now: number) => {
      let level: number;
      if (analyser && data) {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        level = sum / data.length / 255; // 0..1
      } else {
        const t = (now - start) / 1000;
        level = 0.35 + 0.3 * Math.abs(Math.sin(t * 7.3)) + 0.2 * Math.abs(Math.sin(t * 13.7));
      }
      if (mouthRef.current) {
        mouthRef.current.setAttribute('ry', String(3 + level * 11));
        mouthRef.current.setAttribute('rx', String(11 + level * 4));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state, analyser]);

  const eyeOffsetY = state === 'thinking' ? -4 : 0;
  const glowStrength = state === 'idle' ? 0.35 : 0.6;

  return (
    <div className={className} style={{ width: size, height: size, position: 'relative' }}>
      {/* Listening ring */}
      {state === 'listening' && (
        <motion.div
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: `rgba(${palette.glow}, 0.5)` }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.7, 0.15, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <motion.svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        animate={
          state === 'speaking'
            ? { y: [0, -3, 0], transition: { duration: 0.5, repeat: Infinity, ease: 'easeInOut' } }
            : { y: [0, -6, 0], transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } }
        }
        style={{ filter: `drop-shadow(0 0 ${18 * glowStrength + 8}px rgba(${palette.glow}, ${glowStrength}))` }}
      >
        <defs>
          <linearGradient id={`body-${palette.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.light} />
            <stop offset="55%" stopColor={palette.base} />
            <stop offset="100%" stopColor={palette.dark} />
          </linearGradient>
          <radialGradient id={`sheen-${palette.id}`} cx="0.35" cy="0.25" r="0.6">
            <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        {/* Body — rounded blob */}
        <path
          d="M100 22 C 148 22 172 58 172 102 C 172 152 142 178 100 178 C 58 178 28 152 28 102 C 28 58 52 22 100 22 Z"
          fill={`url(#body-${palette.id})`}
          stroke={`rgba(${palette.glow}, 0.55)`}
          strokeWidth="2"
        />
        {/* Sheen */}
        <ellipse cx="78" cy="62" rx="42" ry="30" fill={`url(#sheen-${palette.id})`} />
        {/* Terminal scanlines — keeps it native to the Kinetic Terminal world */}
        {[70, 90, 110, 130].map(y => (
          <line key={y} x1="40" y1={y} x2="160" y2={y} stroke="rgba(0,0,0,0.10)" strokeWidth="2" />
        ))}

        {/* Eyes */}
        <g transform={`translate(0 ${eyeOffsetY})`}>
          {blink ? (
            <>
              <line x1="66" y1="94" x2="86" y2="94" stroke="#050505" strokeWidth="5" strokeLinecap="round" />
              <line x1="114" y1="94" x2="134" y2="94" stroke="#050505" strokeWidth="5" strokeLinecap="round" />
            </>
          ) : look.eyes === 'happy' ? (
            <>
              <path d="M64 98 Q 76 84 88 98" stroke="#050505" strokeWidth="6" fill="none" strokeLinecap="round" />
              <path d="M112 98 Q 124 84 136 98" stroke="#050505" strokeWidth="6" fill="none" strokeLinecap="round" />
            </>
          ) : look.eyes === 'focused' ? (
            <>
              <rect x="63" y="88" width="24" height="10" rx="5" fill="#050505" />
              <rect x="113" y="88" width="24" height="10" rx="5" fill="#050505" />
            </>
          ) : look.eyes === 'pixel' ? (
            <>
              <rect x="68" y="84" width="14" height="14" fill="#050505" />
              <rect x="118" y="84" width="14" height="14" fill="#050505" />
            </>
          ) : (
            <>
              <circle cx="76" cy="93" r="9" fill="#050505" />
              <circle cx="124" cy="93" r="9" fill="#050505" />
              <circle cx="79" cy="90" r="3" fill="rgba(255,255,255,0.85)" />
              <circle cx="127" cy="90" r="3" fill="rgba(255,255,255,0.85)" />
            </>
          )}
        </g>

        {/* Mouth */}
        {state === 'thinking' ? (
          <circle cx="100" cy="130" r="5" fill="#050505" opacity="0.8" />
        ) : state === 'speaking' ? (
          <ellipse ref={mouthRef} cx="100" cy="130" rx="11" ry="3" fill="#050505" />
        ) : (
          <path d="M86 128 Q 100 140 114 128" stroke="#050505" strokeWidth="5" fill="none" strokeLinecap="round" />
        )}

        {/* Accessories */}
        {look.accessory === 'visor' && (
          <g transform={`translate(0 ${eyeOffsetY})`}>
            <rect x="52" y="78" width="96" height="30" rx="14" fill="rgba(5,5,5,0.82)" stroke={`rgba(${palette.glow}, 0.9)`} strokeWidth="2" />
            <rect x="60" y="86" width="34" height="4" rx="2" fill={`rgba(${palette.glow}, 0.9)`} />
            <rect x="60" y="94" width="20" height="4" rx="2" fill={`rgba(${palette.glow}, 0.5)`} />
          </g>
        )}
        {look.accessory === 'antenna' && (
          <g>
            <line x1="100" y1="24" x2="100" y2="4" stroke={palette.dark} strokeWidth="4" />
            <motion.circle
              cx="100" cy="2" r="6" fill={palette.light}
              animate={state === 'listening' ? { opacity: [1, 0.3, 1] } : { opacity: 0.85 }}
              transition={state === 'listening' ? { duration: 0.7, repeat: Infinity } : undefined}
            />
          </g>
        )}
        {look.accessory === 'cap' && (
          <g>
            <path d="M56 44 C 60 18 140 18 144 44 L 148 52 L 52 52 Z" fill="#0a0a0a" stroke={`rgba(${palette.glow}, 0.7)`} strokeWidth="2" />
            <path d="M140 46 L 178 40 L 176 52 L 144 54 Z" fill="#0a0a0a" stroke={`rgba(${palette.glow}, 0.7)`} strokeWidth="2" />
            <circle cx="100" cy="34" r="4" fill={palette.base} />
          </g>
        )}
        {look.accessory === 'headphones' && (
          <g>
            <path d="M46 92 C 40 34 160 34 154 92" stroke="#0a0a0a" strokeWidth="9" fill="none" strokeLinecap="round" />
            <rect x="34" y="84" width="20" height="34" rx="9" fill="#0a0a0a" stroke={`rgba(${palette.glow}, 0.8)`} strokeWidth="2" />
            <rect x="146" y="84" width="20" height="34" rx="9" fill="#0a0a0a" stroke={`rgba(${palette.glow}, 0.8)`} strokeWidth="2" />
          </g>
        )}
      </motion.svg>

      {/* Thinking dots */}
      {state === 'thinking' && (
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 flex gap-1.5">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: `rgba(${palette.glow}, 0.9)` }}
              animate={{ y: [0, -6, 0], opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
