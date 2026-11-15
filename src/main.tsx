import { createRoot } from 'react-dom/client'
import { SpeedInsights } from '@vercel/speed-insights/react'
import App, { router } from './App.tsx'
import './index.css'
import './i18n/config'
import { startTracking } from './lib/track'
import { startClientTelemetry } from './lib/client-telemetry-browser'

startTracking();
// Optional operational reports must never stop React from mounting.
try { startClientTelemetry(); } catch { /* Telemetry remains unmeasured when bootstrap is unavailable. */ }

const container = document.getElementById('root')!;
function mount() {
  createRoot(container).render(
    <>
      <App />
      <SpeedInsights />
    </>
  );
}

// Keep the prerendered page and its links usable during the initial route download.
if (container.firstElementChild && !router.state.initialized) {
  const unsubscribe = router.subscribe((state) => {
    if (!state.initialized) return;
    unsubscribe();
    if (!state.errors) mount();
  });
} else {
  mount();
}
