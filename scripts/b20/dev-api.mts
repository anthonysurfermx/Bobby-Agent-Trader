// Local shim for /api/b20-quote: runs the Vercel handler on a plain Node
// server so the Vite dev server can proxy to it. Read-only, no keys.
import { createServer } from 'node:http';
import handler from '../../api/b20-quote.ts';

const port = Number(process.env.B20_DEV_PORT || 3999);
createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const query = Object.fromEntries(url.searchParams.entries());
  let status = 200;
  const vres: any = {
    status(code: number) { status = code; return vres; },
    setHeader(k: string, v: string) { res.setHeader(k, v); return vres; },
    getHeader(k: string) { return res.getHeader(k); },
    json(body: unknown) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return vres; },
    end(body?: string) { res.statusCode = status; res.end(body); return vres; },
  };
  const vreq: any = { method: req.method, query, headers: req.headers, socket: req.socket, body: undefined };
  try { await handler(vreq, vres); } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: (e as Error).message })); }
}).listen(port, () => console.log(`[b20 dev-api] http://localhost:${port}/api/b20-quote`));
