// ============================================================
// b20-attestation — the eligibility statement a wallet signs (EIP-712)
// before Bobby returns swap calldata. Bound to the wallet, the terms
// version, the country the edge saw, and a 24h expiry, so a pasted
// `attest=1` flag from another browser means nothing.
// ============================================================

import { verifyTypedData, type Address, type Hex } from 'viem';

export const B20_TERMS_VERSION = 1;
export const B20_ATTESTATION_TTL_SEC = 24 * 3600;

export const B20_ATTESTATION_DOMAIN = {
  name: 'Bobby Tokenized Stocks',
  version: '1',
  chainId: 8453,
} as const;

export const B20_ATTESTATION_TYPES = {
  Attestation: [
    { name: 'wallet', type: 'address' },
    { name: 'termsVersion', type: 'uint256' },
    { name: 'notUsPerson', type: 'bool' },
    { name: 'country', type: 'string' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
} as const;

export interface B20AttestationMessage {
  wallet: Address;
  termsVersion: number;
  notUsPerson: boolean;
  country: string;
  issuedAt: number;
  expiresAt: number;
}

export interface B20SignedAttestation {
  message: B20AttestationMessage;
  signature: Hex;
}

export interface AttestationVerdict {
  ok: boolean;
  reasons: string[];
}

/**
 * Verify a signed attestation against what the server itself knows: the
 * recipient wallet of the quote, the edge country, the current terms version
 * and the clock. Every failure is a reason; the caller withholds calldata on any.
 */
export async function verifyB20Attestation(
  raw: unknown,
  expected: { wallet: Address; country: string | null; now?: number },
): Promise<AttestationVerdict> {
  const reasons: string[] = [];
  const now = expected.now ?? Math.floor(Date.now() / 1000);
  const att = parseAttestation(raw);
  if (!att) return { ok: false, reasons: ['signed eligibility attestation required'] };
  const m = att.message;

  if (m.wallet.toLowerCase() !== expected.wallet.toLowerCase()) reasons.push('attestation was signed by a different wallet');
  if (m.termsVersion !== B20_TERMS_VERSION) reasons.push('attestation covers an older version of the terms');
  if (!m.notUsPerson) reasons.push('attestation does not state non-US status');
  if (!expected.country) reasons.push('viewer country unavailable; cannot confirm eligibility');
  else if (m.country.toUpperCase() !== expected.country.toUpperCase()) reasons.push('attestation country does not match the connection');
  if (expected.country && expected.country.toUpperCase() === 'US') reasons.push('Coinbase tokenized stocks are not available to US persons');
  if (m.expiresAt <= now) reasons.push('attestation expired; sign it again');
  if (m.expiresAt - m.issuedAt > B20_ATTESTATION_TTL_SEC + 60) reasons.push('attestation validity window too long');
  if (m.issuedAt > now + 300) reasons.push('attestation issued in the future');

  let signatureOk = false;
  try {
    signatureOk = await verifyTypedData({
      address: m.wallet,
      domain: B20_ATTESTATION_DOMAIN,
      types: B20_ATTESTATION_TYPES,
      primaryType: 'Attestation',
      message: {
        wallet: m.wallet,
        termsVersion: BigInt(m.termsVersion),
        notUsPerson: m.notUsPerson,
        country: m.country,
        issuedAt: BigInt(m.issuedAt),
        expiresAt: BigInt(m.expiresAt),
      },
      signature: att.signature,
    });
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) reasons.push('attestation signature is invalid');

  return { ok: reasons.length === 0, reasons };
}

function parseAttestation(raw: unknown): B20SignedAttestation | null {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      try { obj = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')); } catch { return null; }
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const { message, signature } = obj as { message?: Record<string, unknown>; signature?: unknown };
  if (!message || typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
  const wallet = message.wallet;
  if (typeof wallet !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return null;
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN);
  const termsVersion = num(message.termsVersion);
  const issuedAt = num(message.issuedAt);
  const expiresAt = num(message.expiresAt);
  if (![termsVersion, issuedAt, expiresAt].every(Number.isFinite)) return null;
  if (typeof message.country !== 'string' || !/^[A-Za-z]{2}$/.test(message.country)) return null;
  return {
    message: {
      wallet: wallet as Address,
      termsVersion,
      notUsPerson: message.notUsPerson === true,
      country: message.country,
      issuedAt,
      expiresAt,
    },
    signature: signature as Hex,
  };
}
