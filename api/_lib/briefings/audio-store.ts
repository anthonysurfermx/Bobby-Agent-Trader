// ============================================================
// Bobby Pro market briefings — shared narration audio in a PRIVATE Supabase Storage bucket (decision D2).
// Supabase Storage REST with the service-role key only; the bucket has no policies, so no client key can read
// it and there is never a public URL. Audio leaves storage only through the authenticated `audio` op.
//   · put:    POST   /storage/v1/object/<bucket>/<path>   (x-upsert: true — the same cache key always holds the
//             same text/voice/model, so overwriting a half-finished upload is correct)
//   · get:    GET    /storage/v1/object/authenticated/<bucket>/<path>   → null when the object does not exist
//   · remove: DELETE /storage/v1/object/<bucket>  {prefixes: [...]}   (bulk delete for the retention purge)
// Any other failure throws BriefingStorageError (callers answer 503, never "no audio").
// Paths are content-addressed ('v1/<first two hex>/<cacheKey>.mp3'): no identity, brief or symbol in them.
// ============================================================
import { bobbyDbUrl, bobbyServiceKey } from '../bobby-db.js';
import { AUDIO_BUCKET } from './config.js';
import { BriefingStorageError } from './db.js';

export interface AudioStore { put(path: string, bytes: Buffer, mime: string): Promise<void>; get(path: string): Promise<Buffer | null>; remove(paths: string[]): Promise<void> }

const TIMEOUT_MS = 15_000;
const REMOVE_BATCH = 100;

export function audioPath(cacheKey: string): string {
  if (!/^[0-9a-f]{64}$/.test(cacheKey)) throw new Error('audio cache key must be sha256 hex');
  return `v1/${cacheKey.slice(0, 2)}/${cacheKey}.mp3`;
}

/** Only our own content-addressed paths are ever sent to Storage. */
const SAFE_PATH = /^v1\/[0-9a-f]{2}\/[0-9a-f]{64}\.mp3$/;
const objectPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** Older Storage versions answer a missing object with 400 and statusCode "404" in the body. */
async function isNotFound(r: Response): Promise<boolean> {
  if (r.status === 404) return true;
  if (r.status !== 400) return false;
  try {
    const b = (await r.json()) as { statusCode?: unknown; error?: unknown };
    return String(b?.statusCode) === '404' || /not.?found/i.test(String(b?.error ?? ''));
  } catch {
    return false;
  }
}

export function supabaseAudioStore(fetchImpl?: typeof fetch): AudioStore {
  const doFetch = fetchImpl ?? fetch;
  const base = () => `${bobbyDbUrl()}/storage/v1`;
  const auth = () => { const key = bobbyServiceKey(); return { apikey: key, Authorization: `Bearer ${key}` }; };

  async function send(op: string, url: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      console.error('[briefings-audio]', op, 'network');
      throw new BriefingStorageError(`storage:${op}`, null);
    }
  }

  return {
    async put(path, bytes, mime) {
      if (!SAFE_PATH.test(path)) throw new Error('unexpected audio path');
      const r = await send('put', `${base()}/object/${AUDIO_BUCKET}/${objectPath(path)}`, {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': mime, 'x-upsert': 'true', 'Cache-Control': 'no-store' },
        body: bytes,
      });
      if (!r.ok) {
        console.error('[briefings-audio] put', r.status);
        throw new BriefingStorageError('storage:put', r.status);
      }
    },

    async get(path) {
      if (!SAFE_PATH.test(path)) throw new Error('unexpected audio path');
      const r = await send('get', `${base()}/object/authenticated/${AUDIO_BUCKET}/${objectPath(path)}`, { method: 'GET', headers: auth() });
      if (r.ok) {
        try {
          return Buffer.from(await r.arrayBuffer());
        } catch {
          throw new BriefingStorageError('storage:get', r.status);
        }
      }
      if (await isNotFound(r)) return null;
      console.error('[briefings-audio] get', r.status);
      throw new BriefingStorageError('storage:get', r.status);
    },

    async remove(paths) {
      const safe = paths.filter((p) => SAFE_PATH.test(p));
      for (let i = 0; i < safe.length; i += REMOVE_BATCH) {
        const r = await send('remove', `${base()}/object/${AUDIO_BUCKET}`, {
          method: 'DELETE',
          headers: { ...auth(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: safe.slice(i, i + REMOVE_BATCH) }),
        });
        if (!r.ok) {
          console.error('[briefings-audio] remove', r.status);
          throw new BriefingStorageError('storage:remove', r.status);
        }
      }
    },
  };
}
