// ============================================================
// bobby-db-client — the browser's single view of Bobby's database.
//
// Phase 0 of the DeFi México → Bobby Protocol split. Bobby pages resolve
// the project URL and the anon key through here so the cut-over is an env
// change plus a rebuild (VITE_* is inlined at build time). Resolution:
//   VITE_BOBBY_SUPABASE_URL → VITE_SUPABASE_URL
//   VITE_BOBBY_SUPABASE_ANON_KEY → VITE_SUPABASE_ANON_KEY
// Only the anon key ever lives here. Writes go through /api/*.
// ============================================================
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;

export const BOBBY_DB_URL: string = (env.VITE_BOBBY_SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
export const BOBBY_DB_ANON: string = env.VITE_BOBBY_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

if (!BOBBY_DB_URL || !BOBBY_DB_ANON) {
  console.error('[bobby-db-client] VITE_BOBBY_SUPABASE_URL / VITE_BOBBY_SUPABASE_ANON_KEY are not set — Bobby pages cannot read the database');
}

/** PostgREST URL for read-only browser fetches. */
export function bobbyRest(path: string): string {
  return `${BOBBY_DB_URL}/rest/v1/${path.replace(/^\/+/, '')}`;
}

/** Headers for read-only browser fetches (anon key). */
export const bobbyReadHeaders: Record<string, string> = {
  apikey: BOBBY_DB_ANON,
  Authorization: `Bearer ${BOBBY_DB_ANON}`,
};

let client: SupabaseClient | null = null;
/** Lazily created anon client for Bobby pages that use supabase-js. */
export function bobbySupabase(): SupabaseClient {
  if (!client) client = createClient(BOBBY_DB_URL || 'http://localhost', BOBBY_DB_ANON || 'anon');
  return client;
}
