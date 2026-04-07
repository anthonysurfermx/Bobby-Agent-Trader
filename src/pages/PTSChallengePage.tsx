// ============================================================
// PTS Challenge — Wrapper that adds PTS branding over Bobby Challenge
// "Lo que gane Dany al mes se lo lleva el mejor alumno"
// ============================================================

import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, Users, Zap } from 'lucide-react';
import BobbyChallengePage from './BobbyChallengePage';

export default function PTSChallengePage() {
  return (
    <>
      <Helmet><title>PTS Challenge | Dany Agent Trader — Pro Trading Skills</title></Helmet>

      {/* PTS Challenge Banner — overlays Bobby's original header */}
      <div style={{ background: '#11121e' }}>
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-6">
          {/* Hide original Bobby header text via CSS */}
          <style>{`
            .pts-shell h1:first-of-type,
            .pts-shell [class*="BOBBY"] { visibility: hidden; height: 0; overflow: hidden; }
          `}</style>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-[9px] tracking-widest" style={{ color: '#F8CF2C' }}>SYSTEM_STATUS: ACTIVE</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-1">
              <span style={{ color: '#F8CF2C' }}>PTS</span>{' '}
              <span className="text-white/20">CHALLENGE</span>
            </h1>

            <p className="font-mono text-sm text-white/40 max-w-xl leading-relaxed mt-4 mb-6">
              Dany opera con dinero real. Lo que genere al final del mes{' '}
              <span style={{ color: '#F8CF2C' }} className="font-bold">se lo lleva el mejor alumno de Pro Trading Skills.</span>{' '}
              Sin trucos. Sin capturas editadas. Todo verificable.
            </p>

            {/* How it works */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <div className="p-4 rounded-xl" style={{ background: 'rgba(248,207,44,0.05)', border: '1px solid rgba(248,207,44,0.1)' }}>
                <Trophy className="w-5 h-5 mb-2" style={{ color: '#F8CF2C' }} />
                <div className="font-mono text-[10px] font-bold text-white/60 mb-1">EL PREMIO</div>
                <div className="font-mono text-[9px] text-white/30">Las ganancias del mes van directo al mejor alumno. Si Dany gana $50, tú ganas $50.</div>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'rgba(248,207,44,0.05)', border: '1px solid rgba(248,207,44,0.1)' }}>
                <Users className="w-5 h-5 mb-2" style={{ color: '#F8CF2C' }} />
                <div className="font-mono text-[10px] font-bold text-white/60 mb-1">CÓMO GANAR</div>
                <div className="font-mono text-[9px] text-white/30">El alumno con mejor rendimiento en su cuenta paper trading durante el mes gana el premio.</div>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'rgba(248,207,44,0.05)', border: '1px solid rgba(248,207,44,0.1)' }}>
                <TrendingUp className="w-5 h-5 mb-2" style={{ color: '#F8CF2C' }} />
                <div className="font-mono text-[10px] font-bold text-white/60 mb-1">TRANSPARENCIA TOTAL</div>
                <div className="font-mono text-[9px] text-white/30">Cada trade de Dany queda grabado antes del resultado. No se puede falsificar. Verificable 24/7.</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Original Bobby Challenge content (with green→gold CSS override from PTSShell) */}
      <BobbyChallengePage />
    </>
  );
}
