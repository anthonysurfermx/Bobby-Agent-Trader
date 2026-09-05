// Third-round BP-08 (2026-09-05): the database key of a payment challenge is a
// uuid, the on-chain `payMCPCall(bytes32 challengeId, string toolName)` takes a
// bytes32. The transports compared the raw bytes32 against the uuid column, so
// every honestly paid premium call was refused (22P02) after the fee was spent.
// One canonical, invertible mapping — dependency-free so payment verification
// can use it without touching the database layer:
//   bytes32 = 0x + uuid hex (16 bytes, left-aligned) + 16 zero bytes
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BYTES32_RE = /^0x[0-9a-f]{64}$/i;

export function isChallengeUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** uuid → the bytes32 the client must pass to payMCPCall. */
export function challengeIdToBytes32(uuid: string): `0x${string}` {
  if (!UUID_RE.test(uuid)) throw new Error('challenge id is not a uuid');
  return `0x${uuid.replace(/-/g, '').toLowerCase()}${'0'.repeat(32)}`;
}

/** bytes32 (from a paid tx) → the uuid it encodes, or null when it is not a canonical Bobby challenge id. */
export function bytes32ToChallengeId(value: string): string | null {
  if (!BYTES32_RE.test(value)) return null;
  const hex = value.slice(2).toLowerCase();
  if (!/^0{32}$/.test(hex.slice(32))) return null; // the 16-byte zero tail is part of the encoding
  const h = hex.slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
