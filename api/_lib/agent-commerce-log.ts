import { bobbyAnonKey, bobbyDbUrl, bobbyServiceKeyOptional } from './bobby-db.js';
const SB_URL = bobbyDbUrl();
const SB_KEY = bobbyServiceKeyOptional()
  || bobbyAnonKey()
  || '';

function hasSupabaseConfig() {
  return Boolean(SB_URL && SB_KEY);
}

function headers() {
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };
}

export interface AgentCommerceEventInput {
  source?: string;
  tool_name: string;
  payment_tx_hash?: string | null;
  payment_amount_wei?: string | null;
  payment_status?: string;
  payer_address?: string | null;
  external_agent?: string | null;
  request_ip?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logAgentCommerceEvent(event: AgentCommerceEventInput): Promise<void> {
  if (!hasSupabaseConfig()) return;

  try {
    const res = await fetch(`${SB_URL}/rest/v1/agent_commerce_events`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        source: event.source || 'mcp',
        tool_name: event.tool_name,
        payment_tx_hash: event.payment_tx_hash || null,
        payment_amount_wei: event.payment_amount_wei || null,
        payment_status: event.payment_status || 'verified',
        payer_address: event.payer_address || null,
        external_agent: event.external_agent || null,
        request_ip: event.request_ip || null,
        user_agent: event.user_agent || null,
        metadata: event.metadata || {},
      }),
    });
    if (!res.ok) {
      const message = await res.text().catch(() => '');
      console.error('[agent-commerce-log] insert failed', res.status, message);
    }
  } catch {
    // Logging is best-effort. Bobby should still serve the tool response.
  }
}

export async function listAgentCommerceEvents(limit = 20): Promise<any[]> {
  if (!hasSupabaseConfig()) return [];

  const query = new URLSearchParams({
    select: 'created_at,source,tool_name,payment_tx_hash,payment_amount_wei,payment_status,payer_address,external_agent,metadata',
    order: 'created_at.desc',
    limit: String(limit),
  });

  try {
    const res = await fetch(`${SB_URL}/rest/v1/agent_commerce_events?${query.toString()}`, {
      headers: headers(),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
