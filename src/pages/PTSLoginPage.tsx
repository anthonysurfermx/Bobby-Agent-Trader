// ============================================================
// PTS Login — Branded login for Pro Trading Skills students
// Route: /demopts/login
// ============================================================

import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function PTSLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate login — in production this would verify with PTS backend
    setTimeout(() => {
      localStorage.setItem('bobby_agent_name', 'DANY');
      localStorage.setItem('pts_student', 'true');
      localStorage.setItem('pts_student_email', email);
      navigate('/demopts/onboarding');
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#11121e' }}>
      <Helmet><title>Iniciar Sesión | Pro Trading Skills — Global Investor</title></Helmet>

      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-10 blur-[120px]" style={{ background: '#F8CF2C' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(248,207,44,0.15)', border: '1px solid rgba(248,207,44,0.3)' }}>
              <span className="text-lg font-black" style={{ color: '#F8CF2C' }}>D</span>
            </div>
            <span className="font-mono text-xl font-black tracking-tight" style={{ color: '#F8CF2C' }}>DANY</span>
          </div>
          <h1 className="text-2xl font-black text-white/90 mb-1">Bienvenido de vuelta</h1>
          <p className="text-sm text-white/30">Accede a tu AI Arena de Pro Trading Skills</p>
        </div>

        {/* Login Card */}
        <div className="p-6 rounded-2xl" style={{ background: 'rgba(30,31,43,0.8)', backdropFilter: 'blur(20px)', border: '1px solid rgba(248,207,44,0.1)' }}>
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[10px] font-mono text-white/30 tracking-widest uppercase mb-1.5">EMAIL</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white/90 placeholder:text-white/15 outline-none transition-all font-mono"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  onFocus={e => e.target.style.borderColor = 'rgba(248,207,44,0.3)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-mono text-white/30 tracking-widest uppercase mb-1.5">CONTRASEÑA</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-10 py-3 rounded-xl text-sm text-white/90 placeholder:text-white/15 outline-none transition-all font-mono"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  onFocus={e => e.target.style.borderColor = 'rgba(248,207,44,0.3)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Forgot */}
            <div className="flex justify-end">
              <button type="button" className="text-[10px] font-mono tracking-wider hover:opacity-80" style={{ color: '#F8CF2C' }}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-bold font-mono tracking-wider flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: '#F8CF2C', color: '#3b2f00' }}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <>ACCEDER A MI ARENA <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-[9px] font-mono text-white/15 tracking-widest">O</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {/* Register CTA */}
          <button
            onClick={() => navigate('/demopts')}
            className="w-full py-3 rounded-xl text-sm font-mono tracking-wider text-white/40 hover:text-white/60 transition-all"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            ¿No tienes cuenta? INSCRÍBETE EN GLOBAL INVESTOR
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-[9px] font-mono text-white/10 mt-6">
          Pro Trading Skills © 2026 — Powered by Dany Agent Trader
        </p>
      </motion.div>
    </div>
  );
}
