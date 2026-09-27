// src/pages/NotFound.tsx — a missing page on bobbyprotocol.xyz, in the Núcleo look: warm charcoal,
// Sora headline, ivory pill back to the desk. Language follows the rest of the app (en/es/pt).
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { htmlLang, t } from '@/lib/companions/i18n';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #15121C 0%, #0B0A09 65%)', color: '#F2EDE4', fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif" }}
    >
      <Helmet><html lang={htmlLang()} /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600&family=Geist+Mono:wght@400&family=Sora:wght@300&display=swap" /><title>{t('Page not found', 'Página no encontrada', 'Página não encontrada')} | Bobby</title></Helmet>
      <span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: 12, letterSpacing: '.2em', color: '#8A8378' }}>404</span>
      <h1 style={{ fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif", fontWeight: 300, fontSize: 'clamp(28px, 5vw, 44px)', letterSpacing: '-.02em', lineHeight: 1.15, textWrap: 'balance' }}>
        {t('This page doesn’t exist.', 'Esta página no existe.', 'Esta página não existe.')}
      </h1>
      <p style={{ color: '#A39C91', fontSize: 15, maxWidth: 380, lineHeight: 1.6 }}>
        {t('It may have moved. Bobby is on the desk.', 'Quizá se movió. Bobby está en el desk.', 'Talvez tenha mudado de lugar. O Bobby está no desk.')}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link to="/desk" className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold" style={{ background: '#F2EDE4', color: '#0B0A09' }}>
          {t('Open the desk', 'Abrir el desk', 'Abrir o desk')}
        </Link>
        <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="inline-flex min-h-11 items-center rounded-full border px-6 text-sm" style={{ borderColor: 'rgba(242,237,228,.14)', color: '#F2EDE4' }}>
          {t('Go back', 'Volver', 'Voltar')}
        </button>
      </div>
    </div>
  );
}
