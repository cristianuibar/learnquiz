import type { Profile } from '@learnquiz/api/progress'
import { conceptPresentation, criticalSteps, unitPresentation } from './profile-details'

const concept = { status: 'learning', measured: true, pKnown: 0.724, critical: false } as const
const NativeDateTimeFormat = Intl.DateTimeFormat
let dateTimeFormat: jest.SpyInstance

beforeAll(() => {
  // Jest isolates process.env, so changing TZ here does not change the native
  // timezone. Simulate a western default while honoring explicit UTC options.
  dateTimeFormat = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation((locales, options) =>
    new NativeDateTimeFormat(locales, { timeZone: 'America/Los_Angeles', ...options }))
})
afterAll(() => { dateTimeFormat.mockRestore() })

test('chooses the concept mastery chip and independently adds Critical', () => {
  expect(conceptPresentation(concept)).toEqual({ chips: ['learning'], percent: '72%', showBar: true })
  expect(conceptPresentation({ ...concept, status: 'mastered', critical: true })).toEqual({
    chips: ['mastered', 'critical'], percent: '72%', showBar: true,
  })
  expect(conceptPresentation({ ...concept, status: 'not_started', measured: false, critical: true })).toEqual({
    chips: ['none', 'critical'], percent: null, showBar: false,
  })
  expect(conceptPresentation({ ...concept, status: 'not_started', measured: false })).toEqual({
    chips: ['none'], percent: null, showBar: false,
  })
})

test('only estimate units get a chip, dashed bar and placement caption', () => {
  expect(unitPresentation({ state: 'estimate', mastery: 0.4 })).toEqual({
    value: 40, estimate: true, percent: '~40%', spokenPercent: 'about 40%', chip: 'estimate', caption: 'From your placement check. Not practiced yet.',
  })
  for (const state of ['mastered', 'learning', 'not_started', 'locked'] as const) {
    expect(unitPresentation({ state, mastery: 0 })).toEqual({ value: 0, estimate: false, percent: '0%', spokenPercent: '0%', chip: null, caption: null })
  }
})

test.each([
  ['not_started', 0.9, '90%'],
  ['locked', 0.15, '15%'],
  ['locked', 0.6, '60%'],
] as const)('%s units keep their percent but never fill their bar from a seeded prior of %s', (state, mastery, percent) => {
  expect(unitPresentation({ state, mastery })).toEqual({
    value: 0, estimate: false, percent, spokenPercent: percent, chip: null, caption: null,
  })
})

test.each(['learning', 'mastered'] as const)('%s units retain their measured bar', (state) => {
  expect(unitPresentation({ state, mastery: 0.9 })).toMatchObject({ value: 90, estimate: false, percent: '90%' })
})

test('critical records use neutral chips and UTC dates even west of UTC', () => {
  const jan1 = Date.UTC(2026, 0, 1, 0, 30)
  // This suite pins a western formatter default, so dropping UTC
  // from a formatter crosses the date boundary and fails these assertions.
  expect(new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(jan1)).toBe('Dec 31')
  const errors: Profile['confidentErrors'] = [
    { id: 'corrected', conceptId: 'c1', concept: 'Record damage', at: Date.UTC(2026, 9, 28), correctedAt: Date.UTC(2026, 9, 30) },
    { id: 'pending', conceptId: 'c2', concept: 'Check sign-off', at: jan1, correctedAt: null },
    { id: 'epoch', conceptId: 'c3', concept: 'Check label', at: 0, correctedAt: 0 },
  ]
  expect(criticalSteps(errors)).toEqual([
    { ...errors[1], chip: 'neutral', chipText: 'Comes back first', caption: 'Answered with confidence, missed Jan 1' },
    { ...errors[0], chip: 'neutral', chipText: 'Corrected Oct 30', caption: 'Answered with confidence, missed Oct 28' },
    { ...errors[2], chip: 'neutral', chipText: 'Corrected Jan 1', caption: 'Answered with confidence, missed Jan 1' },
  ])
  expect(criticalSteps([{ ...errors[0], correctedAt: jan1 }])[0].chipText).toBe('Corrected Jan 1')
  expect(criticalSteps([])).toEqual([])
  expect(errors.map(({ id }) => id)).toEqual(['corrected', 'pending', 'epoch'])
})

test('critical steps preserve the shared newest-first, unresolved-first limit of five', () => {
  const errors = Array.from({ length: 7 }, (_, i) => ({
    id: String(i), conceptId: String(i), concept: `Step ${i}`, at: i, correctedAt: i === 6 ? 7 : null,
  }))
  expect(criticalSteps(errors).map(({ id }) => id)).toEqual(['5', '4', '3', '2', '1'])
})
