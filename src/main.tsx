import { createRoot } from 'react-dom/client'
import { SpeedInsights } from '@vercel/speed-insights/react'
import App from './App.tsx'
import './index.css'
import './i18n/config'
import { startTracking } from './lib/track'
import { startClientTelemetry } from './lib/client-telemetry-browser'

startTracking();
// Optional operational reports must never stop React from mounting.
try { startClientTelemetry(); } catch { /* Telemetry remains unmeasured when bootstrap is unavailable. */ }

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <SpeedInsights />
  </>
);
