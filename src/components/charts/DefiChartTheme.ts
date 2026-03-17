// DeFi México branded chart theme constants

export const CHART_COLORS = {
  neonGreen: '#00FF88',
  electricBlue: '#00D4FF',
  darkSurface: '#161A1D',
  darkBg: '#0D0F12',
  gridLine: '#2A2D32',
  textMuted: '#6B7280',
  textLight: '#E5E7EB',
} as const;

export const CHART_GRADIENTS = {
  neonGreen: {
    id: 'gradientNeonGreen',
    stops: [
      { offset: '0%', color: CHART_COLORS.neonGreen, opacity: 0.4 },
      { offset: '100%', color: CHART_COLORS.neonGreen, opacity: 0.02 },
    ],
  },
  electricBlue: {
    id: 'gradientElectricBlue',
    stops: [
      { offset: '0%', color: CHART_COLORS.electricBlue, opacity: 0.4 },
      { offset: '100%', color: CHART_COLORS.electricBlue, opacity: 0.02 },
    ],
  },
} as const;

export const TIME_RANGES = [
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'ALL', days: 0 },
] as const;

export type TimeRange = (typeof TIME_RANGES)[number];
