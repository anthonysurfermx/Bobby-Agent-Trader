// ============================================================
// Mascot Showcase — internal viewer for the Bobby squad
// Route: /mascots (standalone, no layout — like the wizard)
// Big 3D stage + the 10 companions + state controls, so design
// review and marketing screenshots don't require running the
// full onboarding. One WebGL scene; switching never remounts.
// ============================================================

import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import BobbyMascot3D from '@/components/kinetic/BobbyMascot3D';
import { MASCOT_AVATARS, DEFAULT_MASCOT, getPalette, type MascotLook } from '@/lib/mascot';
import type { OrbState } from '@/components/adams/VoiceOrb';

// Squad roles from the product vision (character = face, role = subtitle)
const ROLES: Record<string, string> = {
  bobby: 'ORB · NÚCLEO',
  byte: 'VOZ SIMPLE',
  kora: 'CONVERSACIÓN',
  zip: 'ALERTAS',
  glitch: 'RED TEAM',
  momo: 'EXPLORACIÓN',
  flux: 'SEÑALES',
  rook: 'TESIS',
  axiom: 'TRACK RECORD',
  halo: 'RISK GATE',
};

const STATES: Array<{ id: OrbState; label: string }> = [
  { id: 'idle', label: 'REPOSO' },
  { id: 'listening', label: 'ESCUCHA' },
  { id: 'thinking', label: 'PIENSA' },
  { id: 'speaking', label: 'HABLA' },
];

export default function MascotShowcasePage() {
  // null = wall view (all 10 alive at once); an id = focused big stage
  const [focusId, setFocusId] = useState<string | null>(null);
  const [state, setState] = useState<OrbState>('idle');

  const focused = focusId ? MASCOT_AVATARS.find(a => a.id === focusId) : null;

  const stateButtons = (
    <div className="flex gap-2">
      {STATES.map(s => (
        <button key={s.id} onClick={() => setState(s.id)} aria-pressed={state === s.id}
          className={`px-4 py-1.5 text-[10px] font-mono tracking-wider rounded transition-all ${
            state === s.id
              ? 'bg-green-500/15 border border-green-500/30 text-green-400'
              : 'bg-white/[0.02] border border-white/[0.04] text-white/30 hover:text-white/50'
          }`}>
          {s.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] bg-[#050505] flex flex-col text-white overflow-y-auto">
      <Helmet><title>Squad Showcase | Bobby Agent Trader</title></Helmet>

      <div className="flex items-center justify-between px-5 h-12 border-b border-white/5 flex-shrink-0">
        <span className="font-mono text-[9px] text-white/25 tracking-widest">BOBBY SQUAD // SHOWCASE 3D</span>
        <div className="flex items-center gap-4">
          {focused && (
            <button onClick={() => setFocusId(null)}
              className="font-mono text-[9px] text-green-400/70 hover:text-green-400 tracking-widest transition-colors">
              ← VER TODOS
            </button>
          )}
          <span className="font-mono text-[9px] text-white/25">{MASCOT_AVATARS.length} COMPANIONS</span>
        </div>
      </div>

      {focused ? (
        /* ---- Focused stage: one companion, big ---- */
        <div className="flex flex-col items-center pt-8 pb-10">
          <BobbyMascot3D
            look={{ ...DEFAULT_MASCOT, body: focused.palette, avatar: focused.id }}
            state={state} size={340}
          />
          <motion.div key={focused.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center mt-3">
            <div className="text-2xl font-black tracking-wider" style={{ color: getPalette({ ...DEFAULT_MASCOT, body: focused.palette }).base }}>
              {focused.label.toUpperCase()}
            </div>
            <div className="font-mono text-[10px] text-white/35 tracking-[0.2em] mt-1">{ROLES[focused.id] || ''}</div>
          </motion.div>
          <div className="mt-5">{stateButtons}</div>
        </div>
      ) : (
        /* ---- The wall: all 10 alive at once, following your cursor ---- */
        <div className="max-w-5xl w-full mx-auto px-6 pt-6 pb-12">
          <div className="flex items-center justify-center mb-6">{stateButtons}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-8">
            {MASCOT_AVATARS.map(a => {
              const look: MascotLook = { ...DEFAULT_MASCOT, body: a.palette, avatar: a.id };
              const palette = getPalette(look);
              return (
                <button key={a.id} onClick={() => setFocusId(a.id)}
                  className="flex flex-col items-center gap-2 group bg-transparent border-0 cursor-pointer">
                  <BobbyMascot3D look={look} state={state} size={168} />
                  <div className="text-center">
                    <div className="text-sm font-black tracking-wider group-hover:brightness-125 transition-all" style={{ color: palette.base }}>
                      {a.label.toUpperCase()}
                    </div>
                    <div className="font-mono text-[8px] text-white/30 tracking-[0.18em] mt-0.5">{ROLES[a.id] || ''}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-center font-mono text-[9px] text-white/20 mt-8">
            Todos te siguen con la mirada · toca cualquiera para verlo en grande · HABLA los pone a hablar a todos
          </p>
        </div>
      )}
    </div>
  );
}
