// ============================================================
// Rows that never travel — ONE definition shared by t0-manifest, export
// and verify, so the three always count the same set (Codex: a common
// filter, not manual cleanup).
//
// Decision (Anthony, 2026-09-03): the `e2e-test-agent` Hardness agent is
// test data — its signal tx reverted on X Layer and its prediction hash is
// not recomputable. It goes out together with its sessions and their
// dependent proofs.
// ============================================================
import { headers, type Project } from './lib.js';

export const EXCLUDED_HARDNESS_AGENTS = ['e2e-test-agent'];
/**
 * agent_events rows to leave behind, by id. Empty by default: the 2026-04-14
 * `generate-activity` demo rows include 4 REVERTED X Layer transactions
 * (verify-proofs report); whether that synthetic history travels is a
 * product decision — add the ids here and every tool applies it.
 */
export const EXCLUDED_AGENT_EVENT_IDS: string[] = [];

export interface ExclusionSet { agentIds: string[]; sessionIds: string[]; agentEventIds: string[] }

/** Resolve the dependent keys on a project (sessions of the excluded agents). */
export async function resolveExclusions(p: Project): Promise<ExclusionSet> {
  const agentIds = EXCLUDED_HARDNESS_AGENTS;
  const r = await fetch(`${p.url}/rest/v1/hardness_agent_sessions?agent_id=in.(${agentIds.map(encodeURIComponent).join(',')})&select=session_id`, { headers: headers(p) });
  const sessionIds = r.ok ? ((await r.json()) as Array<{ session_id: string }>).map((x) => x.session_id) : [];
  return { agentIds, sessionIds, agentEventIds: EXCLUDED_AGENT_EVENT_IDS };
}

const inList = (values: string[]) => `(${values.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')})`;

/** PostgREST query fragment (starts with '&') that removes the excluded rows of a table; '' when none apply. */
export function exclusionFilter(table: string, ex: ExclusionSet): string {
  if (table === 'hardness_agents' && ex.agentIds.length) return `&agent_id=not.in.${inList(ex.agentIds)}`;
  if (table === 'hardness_agent_sessions' && ex.agentIds.length) return `&agent_id=not.in.${inList(ex.agentIds)}`;
  if (table === 'hardness_agent_proofs' && ex.sessionIds.length) return `&session_id=not.in.${inList(ex.sessionIds)}`;
  if (table === 'agent_events' && ex.agentEventIds.length) return `&id=not.in.${inList(ex.agentEventIds)}`;
  return '';
}
