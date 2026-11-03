import type { Reveal } from '@learnquiz/api'
import { canAdvance, canLoadSession, initialOverlay, noticeFor, overlayStep, pickedOptionIds, reportAvailable, revealMarks, type OverlayAction, type OverlayState } from './overlay'

function run(actions: OverlayAction[], from: OverlayState = initialOverlay) {
  let state = from
  const advances: unknown[] = []
  for (const action of actions) {
    const step = overlayStep(state, action)
    state = step.state
    if (step.advance) advances.push(step.advance)
  }
  return { state, advances }
}

test('the overlay opens on the result with focus on the band', () => {
  expect(initialOverlay).toEqual({ mode: 'result', focus: 'band', reflection: '', reported: false, submittedWhy: null })
})

test('Report swaps to the report content with focus on its heading', () => {
  expect(run([{ type: 'report' }]).state).toMatchObject({ mode: 'report', focus: 'heading' })
})

test('Back from Report returns to the result with focus on the Report link', () => {
  expect(run([{ type: 'report' }, { type: 'back' }])).toEqual({
    state: { mode: 'result', focus: 'report', reflection: '', reported: false, submittedWhy: null },
    advances: [],
  })
})

test('Back on the result changes nothing', () => {
  expect(run([{ type: 'back' }]).state).toBe(initialOverlay)
})

test('the reflection survives the Report round trip and is sent trimmed as why', () => {
  const { state, advances } = run([
    { type: 'reflection', text: '  I mixed up the steps ' },
    { type: 'report' },
    { type: 'back' },
    { type: 'continue' },
  ])
  expect(state.reflection).toBe('  I mixed up the steps ')
  expect(advances).toEqual([{ why: 'I mixed up the steps', reported: false }])
})

test('an empty reflection sends no why', () => {
  expect(run([{ type: 'reflection', text: '   ' }, { type: 'continue' }]).advances).toEqual([{ reported: false }])
})

test('a sent report advances the session once and returns to the result', () => {
  const { state, advances } = run([{ type: 'reflection', text: 'why' }, { type: 'report' }, { type: 'sent' }])
  expect(state).toEqual({ mode: 'result', focus: 'band', reflection: 'why', reported: true, submittedWhy: 'why' })
  expect(advances).toEqual([{ why: 'why', reported: true }])
})

test('a second sent never advances again', () => {
  expect(run([{ type: 'report' }, { type: 'sent' }, { type: 'sent' }]).advances).toHaveLength(1)
})

test('Report cannot open again after a report was sent', () => {
  const { state, advances } = run([{ type: 'report' }, { type: 'sent' }, { type: 'report' }, { type: 'sent' }])
  expect(state.mode).toBe('result')
  expect(advances).toHaveLength(1)
})

test('a sent on a reveal that already reported never advances', () => {
  expect(overlayStep({ ...initialOverlay, mode: 'report', reported: true }, { type: 'sent' }).advance).toBeNull()
})

test('a sent outside Report does nothing', () => {
  expect(run([{ type: 'sent' }])).toEqual({ state: initialOverlay, advances: [] })
})

test('Continue retries keep the report flag after a send', () => {
  expect(run([{ type: 'report' }, { type: 'sent' }, { type: 'continue' }]).advances).toEqual([{ reported: true }, { reported: true }])
})

test('Continue does nothing while Report is showing', () => {
  expect(run([{ type: 'report' }, { type: 'continue' }]).advances).toEqual([])
})

test('a retry after a failed Continue sends the first why, even after the reflection is edited', () => {
  const { state, advances } = run([
    { type: 'reflection', text: ' I mixed up the steps ' },
    { type: 'continue' },
    { type: 'reflection', text: 'Something else entirely' },
    { type: 'continue' },
  ])
  expect(state.reflection).toBe('Something else entirely')
  expect(advances).toEqual([{ why: 'I mixed up the steps', reported: false }, { why: 'I mixed up the steps', reported: false }])
})

test('a retry after a Continue with no reflection still sends no why', () => {
  expect(run([{ type: 'continue' }, { type: 'reflection', text: 'Added later' }, { type: 'continue' }]).advances)
    .toEqual([{ reported: false }, { reported: false }])
})

test('a report sent after a failed Continue keeps the first why', () => {
  expect(run([
    { type: 'reflection', text: 'first' },
    { type: 'continue' },
    { type: 'reflection', text: 'second' },
    { type: 'report' },
    { type: 'sent' },
  ]).advances).toEqual([{ why: 'first', reported: false }, { why: 'first', reported: true }])
})

test.each([
  ['on the result while idle', initialOverlay, false, true],
  ['while Continue is pending', initialOverlay, true, false],
  ['after a report was sent', { ...initialOverlay, reported: true }, false, false],
  ['while Report is showing', { ...initialOverlay, mode: 'report' as const }, false, false],
])('Report availability %s', (_case, state, busy, available) => {
  expect(reportAvailable(state, busy)).toBe(available)
})

test.each([
  [{ active: true, inFlight: false, overlayOpen: false }, true],
  [{ active: true, inFlight: false, overlayOpen: true }, false],
  [{ active: true, inFlight: true, overlayOpen: false }, false],
  [{ active: false, inFlight: false, overlayOpen: false }, false],
])('GET /sessions/:id is allowed for %o: %s', (input, allowed) => {
  expect(canLoadSession(input)).toBe(allowed)
})

test.each([
  [{ active: true, inFlight: false, overlayOpen: true }, true],
  [{ active: true, inFlight: true, overlayOpen: true }, false],
  [{ active: true, inFlight: false, overlayOpen: false }, false],
  [{ active: false, inFlight: false, overlayOpen: true }, false],
])('POST /next is allowed for %o: %s', (input, allowed) => {
  expect(canAdvance(input)).toBe(allowed)
})

test('picked options are read by format', () => {
  const answer = { optionId: 'a', optionIds: ['b', 'c'], text: 'x' }
  expect(pickedOptionIds('mcq', answer)).toEqual(['a'])
  expect(pickedOptionIds('multi', answer)).toEqual(['b', 'c'])
  expect(pickedOptionIds('short', answer)).toEqual([])
  expect(pickedOptionIds('mcq', {})).toEqual([])
})

const reveal = { state: 'D', correctOptionIds: ['a'], detail: null } as unknown as Reveal

test('marks show only while a reveal is open', () => {
  expect(revealMarks(null, 'mcq', { optionId: 'b' })).toBeNull()
  expect(revealMarks(reveal, 'mcq', { optionId: 'b', optionIds: ['c'] })).toEqual({ a: 'correct', b: 'wrong' })
})

test('the Report sent notice shows only on the question that follows', () => {
  const notice = { key: 'i2:3', text: 'Report sent' }
  expect(noticeFor(notice, 'i2:3')).toBe('Report sent')
  expect(noticeFor(notice, 'i3:4')).toBeNull()
  expect(noticeFor(null, 'i2:3')).toBeNull()
  expect(noticeFor(notice, null)).toBeNull()
})
