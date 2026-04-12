import { ethers } from 'ethers';
import type { VercelRequest } from '@vercel/node';

const AUTH_WINDOW_MS = 10 * 60 * 1000;

function buildMessage(action: string, payload: Record<string, unknown>, timestamp: string) {
  return [
    'Bobby Hardness Finance',
    `action:${action}`,
    `timestamp:${timestamp}`,
    `payload:${JSON.stringify(payload)}`,
  ].join('\n');
}

export function getAuthHeaders(req: VercelRequest) {
  return {
    signature: String(req.headers['x-agent-signature'] || ''),
    timestamp: String(req.headers['x-agent-timestamp'] || ''),
    address: String(req.headers['x-agent-address'] || ''),
  };
}

export function buildAuthChallenge(action: string, payload: Record<string, unknown>, timestamp: string) {
  return buildMessage(action, payload, timestamp);
}

export async function verifyAgentRequest(
  req: VercelRequest,
  action: string,
  payload: Record<string, unknown>,
  expectedOwner?: string | null
) {
  const internalSecret = process.env.BOBBY_CYCLE_SECRET || process.env.CRON_SECRET || '';
  const authz = String(req.headers.authorization || '');
  if (internalSecret && authz === `Bearer ${internalSecret}`) {
    return { ok: true, mode: 'internal' as const, signer: null, message: null };
  }

  const { signature, timestamp, address } = getAuthHeaders(req);
  if (!signature || !timestamp || !address) {
    return { ok: true, mode: 'demo' as const, signer: null, message: null };
  }

  const tsMs = Date.parse(timestamp);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > AUTH_WINDOW_MS) {
    return { ok: false, error: 'Stale or invalid x-agent-timestamp' };
  }

  const message = buildMessage(action, payload, timestamp);
  const signer = ethers.verifyMessage(message, signature);
  if (signer.toLowerCase() !== address.toLowerCase()) {
    return { ok: false, error: 'Signature does not match x-agent-address' };
  }
  if (expectedOwner && signer.toLowerCase() !== expectedOwner.toLowerCase()) {
    return { ok: false, error: 'Signer is not the registered owner' };
  }

  return { ok: true, mode: 'signed' as const, signer, message };
}
