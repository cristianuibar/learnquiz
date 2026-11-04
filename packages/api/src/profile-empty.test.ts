import { describe, expect, it } from 'vitest'
import { profileEmptyView } from './profile-empty.ts'

describe('profileEmptyView', () => {
  it('shows the onboarding day with the benchmark', () => {
    expect(profileEmptyView({ benchmark: 0.85, onboarding: { day: 1, days: 30 } })).toEqual({
      heading: 'Day 1 of 30 · Benchmark 85%',
      barValueText: 'No sessions yet, benchmark 85%',
      body: 'Your progress shows up after your first session.',
    })
  })

  it('shows only the benchmark without onboarding', () => {
    expect(profileEmptyView({ benchmark: 0.85, onboarding: null }).heading).toBe('Benchmark 85%')
  })

  it('carries the benchmark and day through', () => {
    const view = profileEmptyView({ benchmark: 0.9, onboarding: { day: 16, days: 30 } })
    expect(view.heading).toBe('Day 16 of 30 · Benchmark 90%')
    expect(view.barValueText).toBe('No sessions yet, benchmark 90%')
  })
})
