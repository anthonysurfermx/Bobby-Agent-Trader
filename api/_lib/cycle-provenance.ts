// BP-09 (2026-09-04 review): a cycle row's provenance is decided ONCE, here, from
// how the run was authorised — never inferred later from missing columns. Manual
// wallet cycles are private and carry their owner; scheduled and operator runs
// are protocol cycles and are marked public EXPLICITLY. Migration 0011 makes the
// public views require `visibility = 'public'`, so an untagged row is private.

export type CycleVisibility = 'public' | 'private';

export interface CycleProvenance {
  owner_address: string | null;
  visibility: CycleVisibility;
}

/**
 * @param isManual   `?manual=true` — a human triggered this run
 * @param wallet     the wallet that proved ownership for a manual run ('' when none)
 * @param operator   the run carries operator/internal authorisation (cron or ops secret)
 */
export function cycleProvenance(isManual: boolean, wallet: string, operator: boolean): CycleProvenance {
  const owner = (wallet || '').trim().toLowerCase();
  if (isManual && owner) return { owner_address: owner, visibility: 'private' };
  // A manual run with no wallet is only a protocol run when the operator secret was presented.
  if (isManual && !operator) return { owner_address: null, visibility: 'private' };
  return { owner_address: null, visibility: 'public' };
}

/** The exact row the producer writes: the cycle data plus its provenance, which always wins. */
export function buildCycleRow(data: Record<string, unknown>, provenance: CycleProvenance): Record<string, unknown> {
  return { ...data, owner_address: provenance.owner_address, visibility: provenance.visibility };
}
