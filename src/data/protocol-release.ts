export const PROTOCOL_RELEASE = {
  updatedAt: '2026-08-14',
  stage: 'Base release candidate',
  mainnetState: 'Mainnet gated',
  trackRecordState: 'Security-reviewed',
  trackRecordDetail: 'ABI frozen · P1 fixed · mutation coverage active',
  testEvidence: '208 contract tests · layout drift gate',
  readinessUrl:
    'https://github.com/anthonysurfermx/Bobby-Agent-Trader/blob/main/docs/release-readiness.md',
  gates: [
    'Deploy and verify TrackRecord V2',
    'Wire the backend to the frozen ABI',
    'Finalize Safe 2-of-3 ownership',
    'Complete the Base Sepolia V2 soak',
  ],
} as const;
