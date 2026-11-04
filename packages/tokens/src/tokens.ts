export const colors = {
  brand: ['#0E5A73', '#6FC3DC'],
  'brand-hover': ['#0A4759', '#94D4E7'],
  'on-brand': ['#FFFFFF', '#121417'],
  'brand-tint': ['#E3EFF3', '#163240'],
  accent: ['#F2A900', '#F2A900'],
  'accent-hover': ['#D99700', '#FFBE2E'],
  'on-accent': ['#14181F', '#14181F'],
  'accent-tint': ['#FDF3D9', '#2E2610'],
  ink: ['#14181F', '#ECEEF1'],
  'ink-muted': ['#5B6472', '#A0A8B4'],
  'surface-page': ['#F7F6F2', '#121417'],
  'surface-card': ['#FFFFFF', '#1B1F24'],
  'surface-sunken': ['#EFEDE7', '#0D0F11'],
  border: ['#DEDBD2', '#2E333B'],
  'border-strong': ['#7E8591', '#6B7380'],
  'feedback-correct': ['#1E7F4F', '#5CCB93'],
  'feedback-correct-tint': ['#F0F8F3', '#14291F'],
  'feedback-wrong': ['#C4352B', '#F2786E'],
  'feedback-wrong-tint': ['#FBE9E7', '#301816'],
  'feedback-learning': ['#9A5B00', '#E6A84A'],
  'feedback-learning-tint': ['#FAF0DF', '#2C2112'],
  'on-feedback': ['#FFFFFF', '#121417'],
  scrim: ['rgba(20,24,31,0.48)', 'rgba(0,0,0,0.6)'],
  'surface-inverse': ['#14181F', '#ECEEF1'],
  'on-inverse': ['#F7F6F2', '#121417'],
  'row-hover': ['#F7F6F2', '#20252B'],
  'os-ground': ['#1A1C1F', '#1A1C1F'],
  'os-card': ['#2B2E33', '#2B2E33'],
  'os-ink': ['#F1F2F4', '#F1F2F4'],
  'os-ink-muted': ['#B9BEC6', '#B9BEC6'],
} as const

export const typography = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: 700, letterSpacing: -0.02 },
  'title-1': { fontSize: 28, lineHeight: 34, fontWeight: 700, letterSpacing: -0.01 },
  'title-2': { fontSize: 20, lineHeight: 28, fontWeight: 600, letterSpacing: 0 },
  'title-3': { fontSize: 17, lineHeight: 24, fontWeight: 700, letterSpacing: 0 },
  'body-lg': { fontSize: 17, lineHeight: 26, fontWeight: 400, letterSpacing: 0 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: 400, letterSpacing: 0 },
  'label-lg': { fontSize: 17, lineHeight: 24, fontWeight: 600, letterSpacing: 0 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: 600, letterSpacing: 0 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: 500, letterSpacing: 0 },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: 600, letterSpacing: 0.02 },
  chip: { fontSize: 13, lineHeight: 18, fontWeight: 600, letterSpacing: 0 },
} as const

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48 } as const
export const radius = { sm: 4, md: 8, lg: 16, full: 9999 } as const
export const sizes = { target: 48, topbarH: 56, navH: 64 } as const
export const shadow = {
  raised: ['0 8px 24px rgba(20,24,31,0.12)', '0 8px 24px rgba(0,0,0,0.5)'],
} as const
export const duration = { fast: 150, reveal: 300 } as const
export const easing = 'cubic-bezier(0.2, 0, 0, 1)'
export const breakpoints = { md: 640, lg: 1024 } as const
export const fontFamily = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
