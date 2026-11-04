import { percentText, type Profile } from './progress.ts'

export type ProfileEmptyView = { heading: string; barValueText: string; body: string }

// Training progress empty state before the first session.
export function profileEmptyView(profile: Pick<Profile, 'benchmark' | 'onboarding'>): ProfileEmptyView {
  const percent = percentText(profile.benchmark)
  const benchmark = `Benchmark ${percent}`
  const { onboarding } = profile
  return {
    heading: onboarding ? `Day ${onboarding.day} of ${onboarding.days} · ${benchmark}` : benchmark,
    barValueText: `No sessions yet, benchmark ${percent}`,
    body: 'Your progress shows up after your first session.',
  }
}
