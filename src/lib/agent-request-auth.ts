export function buildAgentAuthChallenge(
  action: string,
  payload: Record<string, unknown>,
  timestamp: string,
): string {
  return [
    'Bobby Hardness Finance',
    `action:${action}`,
    `timestamp:${timestamp}`,
    `payload:${stableStringify(payload)}`,
  ].join('\n');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
