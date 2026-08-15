export const PROTOCOL_RELEASE = {
  updatedAt: '2026-08-15',
  stage: 'Base release candidate',
  mainnetState: 'Mainnet gated',
  trackRecordState: 'Security-reviewed',
  trackRecordDetail: 'ABI frozen · P1 fixed · backend adapter code complete',
  testEvidence: '214 contract tests · 53 adapter checks · layout drift gate',
  readinessUrl:
    'https://github.com/anthonysurfermx/Bobby-Agent-Trader/blob/main/docs/release-readiness.md',
  gates: [
    'Deploy and verify TrackRecord V2',
    'Exercise the adapter against the live Sepolia deployment',
    'Enable the historical stop-breach watcher',
    'Finalize Safe 2-of-3 ownership',
    'Complete the Base Sepolia V2 soak',
  ],
} as const;
