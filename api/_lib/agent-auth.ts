import type { VercelRequest } from '@vercel/node';
import { recoverMessageAddress } from 'viem';
import { buildAgentAuthChallenge } from '../../src/lib/agent-request-auth.js';
import { isInternalRequest } from './request-security.js';

const AUTH_WINDOW_MS = 10 * 60 * 1000;

export function getAuthHeaders(req: VercelRequest) {
  return {
    signature: String(req.headers['x-agent-signature'] || ''),
    timestamp: String(req.headers['x-agent-timestamp'] || ''),
    address: String(req.headers['x-agent-address'] || ''),
  };
}

export function buildAuthChallenge(action: string, payload: Record<string, unknown>, timestamp: string) {
  return buildAgentAuthChallenge(action, payload, timestamp);
}

export async function verifyAgentRequest(
  req: VercelRequest,
  action: string,
  payload: Record<string, unknown>,
  expectedOwner?: string | null
) {
  if (isInternalRequest(req)) {
    return { ok: true, mode: 'internal' as const, signer: null, message: null };
  }

  const { signature, timestamp, address } = getAuthHeaders(req);
  if (!signature || !timestamp || !address) {
    // Demo mode: allow read-only GET requests without auth, reject mutations
    const method = req.method?.toUpperCase();
    if (method === 'GET' || method === 'OPTIONS') {
      return { ok: true, mode: 'demo' as const, signer: null, message: null };
    }
    return { ok: false, error: 'Missing x-agent-signature, x-agent-timestamp, and x-agent-address headers' };
  }

  const tsMs = Date.parse(timestamp);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > AUTH_WINDOW_MS) {
    return { ok: false, error: 'Stale or invalid x-agent-timestamp' };
  }

  const message = buildAgentAuthChallenge(action, payload, timestamp);
  const signer = await recoverMessageAddress({
    message,
    signature: signature as `0x${string}`,
  });
  if (signer.toLowerCase() !== address.toLowerCase()) {
    return { ok: false, error: 'Signature does not match x-agent-address' };
  }
  if (expectedOwner && signer.toLowerCase() !== expectedOwner.toLowerCase()) {
    return { ok: false, error: 'Signer is not the registered owner' };
  }

  return { ok: true, mode: 'signed' as const, signer, message };
}
