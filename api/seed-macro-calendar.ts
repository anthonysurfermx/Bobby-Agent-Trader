// ============================================================
// POST /api/seed-macro-calendar — Seeds FOMC/CPI/PCE dates
// Run once or on-demand to populate agent_macro_events table
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

// FOMC meetings 2026 (from federalreserve.gov/monetarypolicy/fomccalendars.htm)
// CPI release dates 2026 (from bls.gov/schedule/news_release/cpi.htm)
// PCE release dates 2026 (from bea.gov/news/schedule)
const MACRO_EVENTS_2026 = [
  // FOMC Meetings (2-day, decision on day 2)
  { key: 'fomc-2026-01', type: 'FOMC', title: 'FOMC Rate Decision', date: '2026-01-28T19:00:00Z', severity: 5 },
  { key: 'fomc-2026-03', type: 'FOMC', title: 'FOMC Rate Decision', date: '2026-03-18T18:00:00Z', severity: 5 },
  { key: 'fomc-2026-05', type: 'FOMC', title: 'FOMC Rate Decision', date: '2026-05-06T18:00:00Z', severity: 5 },
  { key: 'fomc-2026-06', type: 'FOMC', title: 'FOMC Rate Decision', date: '2026-06-17T18:00:00Z', severity: 5 },
  { key: 'fomc-2026-07', type: 'FOMC', title: 'FOMC Rate Decision', date: '2026-07-29T18:00:00Z', severity: 5 },
  { key: 'fomc-2026-09', type: 'FOMC', title: 'FOMC Rate Decision', date: '2026-09-16T18:00:00Z', severity: 5 },
  { key: 'fomc-2026-11', type: 'FOMC', title: 'FOMC Rate Decision', date: '2026-11-04T18:00:00Z', severity: 5 },
  { key: 'fomc-2026-12', type: 'FOMC', title: 'FOMC Rate Decision', date: '2026-12-16T19:00:00Z', severity: 5 },
  // CPI Releases (8:30 AM ET)
  { key: 'cpi-2026-01', type: 'CPI', title: 'CPI January Release', date: '2026-01-14T13:30:00Z', severity: 4 },
  { key: 'cpi-2026-02', type: 'CPI', title: 'CPI February Release', date: '2026-02-11T13:30:00Z', severity: 4 },
  { key: 'cpi-2026-03', type: 'CPI', title: 'CPI March Release', date: '2026-03-11T12:30:00Z', severity: 4 },
  { key: 'cpi-2026-04', type: 'CPI', title: 'CPI April Release', date: '2026-04-10T12:30:00Z', severity: 4 },
  { key: 'cpi-2026-05', type: 'CPI', title: 'CPI May Release', date: '2026-05-12T12:30:00Z', severity: 4 },
  { key: 'cpi-2026-06', type: 'CPI', title: 'CPI June Release', date: '2026-06-10T12:30:00Z', severity: 4 },
  { key: 'cpi-2026-07', type: 'CPI', title: 'CPI July Release', date: '2026-07-14T12:30:00Z', severity: 4 },
  { key: 'cpi-2026-08', type: 'CPI', title: 'CPI August Release', date: '2026-08-12T12:30:00Z', severity: 4 },
  { key: 'cpi-2026-09', type: 'CPI', title: 'CPI September Release', date: '2026-09-11T12:30:00Z', severity: 4 },
  { key: 'cpi-2026-10', type: 'CPI', title: 'CPI October Release', date: '2026-10-13T12:30:00Z', severity: 4 },
  { key: 'cpi-2026-11', type: 'CPI', title: 'CPI November Release', date: '2026-11-12T13:30:00Z', severity: 4 },
  { key: 'cpi-2026-12', type: 'CPI', title: 'CPI December Release', date: '2026-12-10T13:30:00Z', severity: 4 },
  // NFP (Non-Farm Payroll) - first Friday each month 8:30 AM ET
  { key: 'nfp-2026-04', type: 'NFP', title: 'Non-Farm Payroll April', date: '2026-04-03T12:30:00Z', severity: 4 },
  { key: 'nfp-2026-05', type: 'NFP', title: 'Non-Farm Payroll May', date: '2026-05-01T12:30:00Z', severity: 4 },
  { key: 'nfp-2026-06', type: 'NFP', title: 'Non-Farm Payroll June', date: '2026-06-05T12:30:00Z', severity: 4 },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SB_KEY) return res.status(500).json({ error: 'No Supabase key' });

  const rows = MACRO_EVENTS_2026.map(e => ({
    event_key: e.key,
    source: 'seed',
    event_type: e.type,
    country: 'US',
    title: e.title,
    scheduled_at: e.date,
    severity: e.severity,
    risk_window_before_min: e.type === 'FOMC' ? 240 : 120, // 4h before FOMC, 2h before CPI
    risk_window_after_min: e.type === 'FOMC' ? 120 : 60,
    state: new Date(e.date) < new Date() ? 'passed' : 'upcoming',
  }));

  // Upsert (ON CONFLICT DO NOTHING since event_key is PK)
  const result = await fetch(`${SB_URL}/rest/v1/agent_macro_events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Prefer: 'return=representation,resolution=ignore-duplicates',
    },
    body: JSON.stringify(rows),
  });

  const inserted = result.ok ? await result.json() : [];
  return res.status(200).json({ ok: true, seeded: rows.length, inserted: Array.isArray(inserted) ? inserted.length : 0 });
}
