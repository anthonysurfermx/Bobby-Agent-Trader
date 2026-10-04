import { isMissing, type AdminLiveResponse, type LiveWindowId, type LiveServerCoverage } from '@/lib/admin-client';

export type OperationalPlatform = 'ios' | 'web' | 'android';
export type OperationalMetric = 'consumed' | 'completed' | 'received' | 'rendered' | 'failed';

/** Capture coverage is separate from activity in the selected customer/team population. */
export function operationalServerCoverage(data: AdminLiveResponse, platform: OperationalPlatform): LiveServerCoverage | null {
  if (!data.live) return null;
  return platform === 'android' ? data.live.platforms.android?.coverage ?? null : data.live.coverage;
}

/** A count is publishable only when its source sent it and its measurement has observed coverage. */
export function operationalValue(data: AdminLiveResponse, windowId: LiveWindowId, platform: OperationalPlatform, key: OperationalMetric): number | null {
  const live = data.live;
  if (!live) return null;
  if (key === 'received' || key === 'rendered') {
    // The Android app does not send these client receipts yet.
    if (platform === 'android') return null;
    const client = live.client?.platforms[platform];
    const since = key === 'received' ? client?.coverage.readReceivedSince : client?.coverage.readRenderedSince;
    return client && since && client.windows[windowId].since && !isMissing(data.missing, `client.platforms.${platform}.windows.${windowId}.${key}`)
      ? client.windows[windowId][key] : null;
  }
  const snapshot = live.windows[windowId][platform];
  const timestamps = live.platforms[platform];
  if (!snapshot || !timestamps || !live.windows[windowId].since) return null;
  const coverage = operationalServerCoverage(data, platform);
  const since = key === 'consumed' ? coverage?.readConsumptionCoverageSince : coverage?.outcomeCoverageSince;
  return since && !isMissing(data.missing, `windows.${windowId}.${platform}.${key}`)
    ? snapshot[key] : null;
}

export function operationalCoverage(data: AdminLiveResponse, windowId: LiveWindowId, platform: OperationalPlatform) {
  if (!data.live) return 'unmeasured';
  const metrics: OperationalMetric[] = ['consumed', 'completed', 'received', 'rendered', 'failed'];
  const available = metrics.filter((key) => operationalValue(data, windowId, platform, key) != null).length;
  if (!available) return 'unmeasured';
  const since = data.live.windows[windowId].since;
  const server = operationalServerCoverage(data, platform);
  const client = platform === 'android' ? null : data.live.client?.platforms[platform];
  const partialWindow = since && [server?.readConsumptionCoverageSince, server?.outcomeCoverageSince,
    client?.coverage.readReceivedSince, client?.coverage.readRenderedSince].some((start) => start && Date.parse(start) > Date.parse(since));
  return available === metrics.length && !partialWindow ? 'observed' : 'partial';
}
