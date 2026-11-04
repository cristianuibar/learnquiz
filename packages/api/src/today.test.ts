import { describe, expect, it } from 'vitest'
import { nextReviewsLine, todayFixtureNow, todayFixtures, todayView } from './today'
import type { Today } from './today'

type Topic = NonNullable<Today['topic']>
type Role = NonNullable<Today['role']>
type Plan = NonNullable<Today['plan']>

type Overrides = {
  topic?: Partial<Topic> | null
  role?: Partial<Role> | null
  plan?: Partial<Plan> | null
}

const now = new Date(2026, 10, 3, 12, 0)

const baseTopic: Topic = {
  id: 't1',
  title: 'Topic One',
  placed: true,
  placeable: true,
  due: 4,
  xp: 100,
  streak: 3,
}
const baseRole: Role = {
  name: 'Warehouse picker',
  company: 'Acme',
  topicTitle: 'Topic One',
  preparing: false,
  mastery: 0.66,
  benchmark: 0.85,
  day: 16,
  days: 30,
  building: null,
}
const basePlan: Plan = {
  state: 'normal',
  start: 'session',
  nextUnit: 'Picking',
  reviewsLeft: 4,
  reviewsCleared: 2,
  sessionDone: false,
  sessionSize: 20,
  playable: true,
  nextReviewAt: null,
}

function base(over: Overrides = {}): Today {
  return {
    topic: over.topic === null ? null : { ...baseTopic, ...over.topic },
    role: over.role === null ? null : { ...baseRole, ...over.role },
    plan: over.plan === null ? null : { ...basePlan, ...over.plan },
  }
}

const play = { label: 'Play · 5 min', accessibleLabel: 'Play, 5 minutes', disabled: false }

const buildingNote =
  'Play unlocks as soon as your first questions are ready. This page updates on its own, so you can come back later.'

describe('todayView hero', () => {
  describe('building', () => {
    it('shows progress and the next unit in the play label', () => {
      const view = todayView(base({ role: { building: { ready: 28, total: 42 } } }), now)
      expect(view.hero).toEqual({
        kind: 'building',
        title: 'Building your questions',
        ready: 28,
        total: 42,
        status: '28 of 42 topics ready',
        note: null,
        play: { label: 'Play Picking · 5 min', accessibleLabel: 'Play Picking, 5 minutes', disabled: false },
      })
    })

    it('falls back to the default play label without a next unit', () => {
      const view = todayView(
        base({ role: { building: { ready: 1, total: 3 } }, plan: { nextUnit: null } }),
        now,
      )
      expect(view.hero).toEqual({
        kind: 'building',
        title: 'Building your questions',
        ready: 1,
        total: 3,
        status: '1 of 3 topics ready',
        note: null,
        play,
      })
    })

    it('has null progress and an honest status when preparing without building info', () => {
      const view = todayView(
        base({ role: { preparing: true, building: null, mastery: null }, plan: { nextUnit: null } }),
        now,
      )
      expect(view.hero).toEqual({
        kind: 'building',
        title: 'Building your questions',
        ready: null,
        total: null,
        status: 'No questions are ready yet',
        note: buildingNote,
        play: { ...play, disabled: true },
      })
    })

    it('disables play while the role is preparing even if the plan is playable', () => {
      const view = todayView(
        base({ role: { preparing: true, building: { ready: 0, total: 5 } }, plan: { playable: true } }),
        now,
      )
      expect(view.hero.kind).toBe('building')
      if (view.hero.kind === 'building') expect(view.hero.play.disabled).toBe(true)
    })

    it('disables play when the plan is not playable', () => {
      const view = todayView(
        base({ role: { building: { ready: 5, total: 9 } }, plan: { playable: false } }),
        now,
      )
      if (view.hero.kind !== 'building') throw new Error('expected building hero')
      expect(view.hero.play.disabled).toBe(true)
      expect(view.hero.note).toBe(buildingNote)
    })

    it('is beaten by done', () => {
      const view = todayView(
        base({
          role: { building: { ready: 28, total: 42 } },
          plan: { state: 'done', reviewsLeft: 0, nextReviewAt: null },
        }),
        now,
      )
      expect(view.hero.kind).toBe('done')
    })

    it('is beaten by done even while preparing', () => {
      const view = todayView(base({ role: { preparing: true }, plan: { state: 'done' } }), now)
      expect(view.hero.kind).toBe('done')
    })
  })

  describe('empty', () => {
    it('is empty with no topic and no role', () => {
      expect(todayView(base({ topic: null, role: null }), now).hero).toEqual({ kind: 'empty' })
    })

    it('is empty when there is no plan', () => {
      expect(todayView(base({ plan: null }), now).hero).toEqual({ kind: 'empty' })
    })

    it('is empty with no plan even without a topic and role', () => {
      expect(todayView(base({ topic: null, role: null, plan: null }), now).hero).toEqual({ kind: 'empty' })
    })
  })

  describe('first', () => {
    it('describes placement', () => {
      const view = todayView(base({ plan: { state: 'first', start: 'placement' } }), now)
      expect(view.hero).toEqual({
        kind: 'first',
        title: 'Your first session',
        meta: 'Finds your starting level',
        play,
      })
    })

    it('starts with the next unit for a session', () => {
      const view = todayView(base({ plan: { state: 'first', start: 'session', nextUnit: 'Receiving' } }), now)
      expect(view.hero).toEqual({
        kind: 'first',
        title: 'Your first session',
        meta: 'Starts with Receiving',
        play,
      })
    })

    it('falls back to the question count without a next unit', () => {
      const view = todayView(
        base({ plan: { state: 'first', start: 'session', nextUnit: null, sessionSize: 12 } }),
        now,
      )
      expect(view.hero).toEqual({
        kind: 'first',
        title: 'Your first session',
        meta: '12 questions',
        play,
      })
    })

    it('disables play when not playable', () => {
      const view = todayView(base({ plan: { state: 'first', playable: false } }), now)
      if (view.hero.kind !== 'first') throw new Error('expected first hero')
      expect(view.hero.play).toEqual({ ...play, disabled: true })
    })
  })

  describe('basics', () => {
    it('names the unit', () => {
      const view = todayView(base({ plan: { state: 'basics', nextUnit: 'Receiving', sessionSize: 20 } }), now)
      expect(view.hero).toEqual({
        kind: 'basics',
        title: 'Back to basics: Receiving',
        meta: 'Full explanations · 20 questions',
        play,
      })
    })

    it('drops the unit when there is none', () => {
      const view = todayView(base({ plan: { state: 'basics', nextUnit: null, sessionSize: 15 } }), now)
      expect(view.hero).toEqual({
        kind: 'basics',
        title: 'Back to basics',
        meta: 'Full explanations · 15 questions',
        play,
      })
    })
  })

  describe('normal', () => {
    it.each([
      [4, 'Picking', '4 reviews, then Picking'],
      [1, 'Picking', '1 review, then Picking'],
      [4, null, '4 reviews'],
      [1, null, '1 review'],
      [0, 'Picking', 'Picking'],
    ])('with %i reviews and unit %s the title is %s', (reviewsLeft, nextUnit, title) => {
      const view = todayView(base({ plan: { reviewsLeft, nextUnit, sessionSize: 20 } }), now)
      expect(view.hero).toEqual({ kind: 'normal', title, meta: '20 questions', play })
    })

    it('says nothing is due and disables play with no reviews and no unit', () => {
      const view = todayView(base({ plan: { reviewsLeft: 0, nextUnit: null, playable: true } }), now)
      expect(view.hero).toEqual({
        kind: 'normal',
        title: 'Nothing due yet',
        meta: '20 questions',
        play: { ...play, disabled: true },
      })
    })

    it('uses the session size in the meta', () => {
      const view = todayView(base({ plan: { sessionSize: 8 } }), now)
      if (view.hero.kind !== 'normal') throw new Error('expected normal hero')
      expect(view.hero.meta).toBe('8 questions')
    })

    it('disables play when the plan is not playable', () => {
      const view = todayView(base({ plan: { playable: false } }), now)
      if (view.hero.kind !== 'normal') throw new Error('expected normal hero')
      expect(view.hero.play).toEqual({ ...play, disabled: true })
    })
  })

  describe('done', () => {
    it('offers practice and reports the next reviews', () => {
      const view = todayView(
        base({ plan: { state: 'done', nextReviewAt: new Date(2026, 10, 4, 9, 0).getTime() } }),
        now,
      )
      expect(view.hero).toEqual({
        kind: 'done',
        title: 'Done for today',
        meta: 'Next reviews tomorrow',
        action: { label: 'Practice anyway', accessibleLabel: 'Practice anyway', disabled: false },
      })
    })

    it('reports no reviews scheduled', () => {
      const view = todayView(base({ plan: { state: 'done', nextReviewAt: null } }), now)
      if (view.hero.kind !== 'done') throw new Error('expected done hero')
      expect(view.hero.meta).toBe('No reviews scheduled')
    })

    it('disables the action when not playable', () => {
      const view = todayView(base({ plan: { state: 'done', playable: false } }), now)
      if (view.hero.kind !== 'done') throw new Error('expected done hero')
      expect(view.hero.action).toEqual({
        label: 'Practice anyway',
        accessibleLabel: 'Practice anyway',
        disabled: true,
      })
    })

    it('does not disable the action just because the role is preparing', () => {
      const view = todayView(base({ role: { preparing: true }, plan: { state: 'done', playable: true } }), now)
      if (view.hero.kind !== 'done') throw new Error('expected done hero')
      expect(view.hero.action.disabled).toBe(false)
    })
  })
})

describe('todayView streak', () => {
  it.each([
    [4, '4 days', '4 days in a row'],
    [1, '1 day', '1 day in a row'],
    [30, '30 days', '30 days in a row'],
  ])('streak %i gives %s', (streak, text, label) => {
    expect(todayView(base({ topic: { streak } }), now).streak).toEqual({ text, label })
  })

  it('is null at zero', () => {
    expect(todayView(base({ topic: { streak: 0 } }), now).streak).toBeNull()
  })

  it('is null when negative', () => {
    expect(todayView(base({ topic: { streak: -1 } }), now).streak).toBeNull()
  })

  it('is null on the first session', () => {
    expect(todayView(base({ topic: { streak: 5 }, plan: { state: 'first' } }), now).streak).toBeNull()
  })

  it('is null with no topic', () => {
    expect(todayView(base({ topic: null }), now).streak).toBeNull()
  })

  it('still shows with no plan', () => {
    expect(todayView(base({ topic: { streak: 2 }, plan: null }), now).streak).toEqual({
      text: '2 days',
      label: '2 days in a row',
    })
  })
})

describe('todayView quests', () => {
  const session = { key: 'session', label: 'One session', count: null, done: false }

  it('is empty without a plan', () => {
    expect(todayView(base({ plan: null }), now).quests).toEqual([])
  })

  it('lists reviews then session', () => {
    const view = todayView(base({ topic: { due: 4 }, plan: { reviewsCleared: 2 } }), now)
    expect(view.quests).toEqual([
      { key: 'reviews', label: 'Clear your reviews', count: '2 of 6', done: false },
      session,
    ])
  })

  it('marks reviews done when nothing is due', () => {
    const view = todayView(base({ topic: { due: 0 }, plan: { reviewsCleared: 6 } }), now)
    expect(view.quests[0]).toEqual({ key: 'reviews', label: 'Clear your reviews', count: '6 of 6', done: true })
  })

  it('shows zero cleared of the due count', () => {
    const view = todayView(base({ topic: { due: 2 }, plan: { reviewsCleared: 0 } }), now)
    expect(view.quests[0]).toEqual({ key: 'reviews', label: 'Clear your reviews', count: '0 of 2', done: false })
  })

  it('hides reviews when nothing was cleared and nothing is due', () => {
    const view = todayView(base({ topic: { due: 0 }, plan: { reviewsCleared: 0 } }), now)
    expect(view.quests).toEqual([session])
  })

  it('hides reviews on the first session even with reviews counted', () => {
    const view = todayView(base({ topic: { due: 3 }, plan: { state: 'first', reviewsCleared: 2 } }), now)
    expect(view.quests).toEqual([session])
  })

  it('treats a missing topic as nothing due', () => {
    const view = todayView(base({ topic: null, plan: { reviewsCleared: 3 } }), now)
    expect(view.quests).toEqual([
      { key: 'reviews', label: 'Clear your reviews', count: '3 of 3', done: true },
      session,
    ])
  })

  it('reflects a finished session', () => {
    const view = todayView(base({ topic: { due: 0 }, plan: { reviewsCleared: 0, sessionDone: true } }), now)
    expect(view.quests).toEqual([{ ...session, done: true }])
  })

  it('keeps the session quest in the done state', () => {
    const view = todayView(base({ plan: { state: 'done', sessionDone: true } }), now)
    expect(view.quests.at(-1)).toEqual({ ...session, done: true })
  })
})

describe('todayView role', () => {
  it('is null when there is no role', () => {
    expect(todayView(base({ role: null }), now).role).toBeNull()
  })

  it('describes a started role', () => {
    const view = todayView(base({ role: { mastery: 0.66, benchmark: 0.85, day: 16, days: 30 } }), now)
    expect(view.role).toEqual({
      name: 'Warehouse picker',
      pct: 66,
      benchmarkPct: 85,
      started: true,
      chip: null,
      progressLabel: '66% of 85% benchmark',
      dayLabel: 'Day 16 of 30',
      accessibleLabel: 'Warehouse picker: 66% of 85% benchmark, day 16 of 30',
    })
  })

  it('rounds percentages', () => {
    const view = todayView(base({ role: { mastery: 0.666, benchmark: 0.854 } }), now)
    expect(view.role?.pct).toBe(67)
    expect(view.role?.benchmarkPct).toBe(85)
  })

  it('is started at zero mastery', () => {
    const view = todayView(base({ role: { mastery: 0 } }), now)
    expect(view.role?.started).toBe(true)
    expect(view.role?.pct).toBe(0)
  })

  it('describes a role with no mastery as not started', () => {
    const view = todayView(base({ role: { mastery: null, day: 1, days: 30 } }), now)
    expect(view.role).toEqual({
      name: 'Warehouse picker',
      pct: null,
      benchmarkPct: 85,
      started: false,
      chip: 'Not started',
      progressLabel: 'Benchmark 85%',
      dayLabel: 'Day 1 of 30',
      accessibleLabel: 'Warehouse picker: not started, benchmark 85%, day 1 of 30',
    })
  })

  it('is not started on the first session even with mastery', () => {
    const view = todayView(base({ role: { mastery: 0.5 }, plan: { state: 'first' } }), now)
    expect(view.role?.started).toBe(false)
    expect(view.role?.pct).toBeNull()
    expect(view.role?.chip).toBe('Not started')
    expect(view.role?.progressLabel).toBe('Benchmark 85%')
  })

  it('with a null plan and mastery counts as started', () => {
    const view = todayView(base({ role: { mastery: 0.3 }, plan: null }), now)
    expect(view.role?.started).toBe(true)
    expect(view.role?.pct).toBe(30)
  })
})

describe('nextReviewsLine', () => {
  it('reports nothing scheduled', () => {
    expect(nextReviewsLine(null, now)).toBe('No reviews scheduled')
  })

  it('reports later today', () => {
    expect(nextReviewsLine(new Date(2026, 10, 3, 18, 0).getTime(), now)).toBe('Next reviews later today')
  })

  it('treats the end of today as later today', () => {
    expect(nextReviewsLine(new Date(2026, 10, 3, 23, 59).getTime(), now)).toBe('Next reviews later today')
  })

  it('treats a time already past as later today', () => {
    expect(nextReviewsLine(new Date(2026, 10, 3, 8, 0).getTime(), now)).toBe('Next reviews later today')
  })

  it('reports tomorrow by calendar day', () => {
    expect(nextReviewsLine(new Date(2026, 10, 4, 9, 0).getTime(), now)).toBe('Next reviews tomorrow')
  })

  it('reports tomorrow just after midnight', () => {
    const lateNow = new Date(2026, 10, 3, 23, 30)
    expect(nextReviewsLine(new Date(2026, 10, 4, 0, 5).getTime(), lateNow)).toBe('Next reviews tomorrow')
  })

  it.each([
    [5, 'Thursday'],
    [6, 'Friday'],
    [7, 'Saturday'],
    [8, 'Sunday'],
    [9, 'Monday'],
  ])('reports November %i as %s', (day, weekday) => {
    expect(nextReviewsLine(new Date(2026, 10, day, 9, 0).getTime(), now)).toBe(`Next reviews on ${weekday}`)
  })

  it.each([
    [new Date(2026, 10, 10, 9, 0), 'Next reviews on Nov 10'],
    [new Date(2026, 10, 12, 9, 0), 'Next reviews on Nov 12'],
    [new Date(2026, 11, 1, 9, 0), 'Next reviews on Dec 1'],
    [new Date(2027, 0, 15, 9, 0), 'Next reviews on Jan 15'],
  ])('reports a far date %s as %s', (at, line) => {
    expect(nextReviewsLine(at.getTime(), now)).toBe(line)
  })
})

describe('todayFixtures', () => {
  const names = ['first', 'normal', 'done', 'building', 'basics', 'preparing'] as const

  it('has exactly the expected fixtures', () => {
    expect(Object.keys(todayFixtures).sort()).toEqual([...names].sort())
  })

  it('uses a local Tuesday noon as the fixture time', () => {
    expect(todayFixtureNow.getTime()).toBe(new Date(2026, 10, 3, 12, 0).getTime())
  })

  it.each(names)('%s names the company and, with a topic, whether it is placeable', (name) => {
    const fixture = todayFixtures[name]
    expect(fixture.role?.company).toBe('Northwind')
    if (fixture.topic) expect(typeof fixture.topic.placeable).toBe('boolean')
    else expect(name).toBe('preparing')
  })

  it.each(names)('%s renders without throwing', (name) => {
    expect(() => todayView(todayFixtures[name], todayFixtureNow)).not.toThrow()
  })

  const view = (name: (typeof names)[number]) => todayView(todayFixtures[name], todayFixtureNow)

  it('first', () => {
    const v = view('first')
    expect(v.streak).toBeNull()
    expect(v.hero).toEqual({ kind: 'first', title: 'Your first session', meta: 'Starts with Receiving', play })
    expect(v.quests).toEqual([{ key: 'session', label: 'One session', count: null, done: false }])
    expect(v.role?.chip).toBe('Not started')
    expect(v.role?.dayLabel).toBe('Day 1 of 30')
  })

  it('normal', () => {
    const v = view('normal')
    expect(v.streak).toEqual({ text: '4 days', label: '4 days in a row' })
    expect(v.hero).toEqual({ kind: 'normal', title: '4 reviews, then Picking', meta: '20 questions', play })
    expect(v.quests).toEqual([
      { key: 'reviews', label: 'Clear your reviews', count: '2 of 6', done: false },
      { key: 'session', label: 'One session', count: null, done: false },
    ])
    expect(v.role?.pct).toBe(66)
    expect(v.role?.dayLabel).toBe('Day 16 of 30')
  })

  it('done', () => {
    const v = view('done')
    expect(v.streak).toEqual({ text: '5 days', label: '5 days in a row' })
    expect(v.hero).toEqual({
      kind: 'done',
      title: 'Done for today',
      meta: 'Next reviews tomorrow',
      action: { label: 'Practice anyway', accessibleLabel: 'Practice anyway', disabled: false },
    })
    expect(v.quests).toEqual([
      { key: 'reviews', label: 'Clear your reviews', count: '6 of 6', done: true },
      { key: 'session', label: 'One session', count: null, done: true },
    ])
  })

  it('building', () => {
    const v = view('building')
    expect(v.hero).toEqual({
      kind: 'building',
      title: 'Building your questions',
      ready: 28,
      total: 42,
      status: '28 of 42 topics ready',
      note: null,
      play: { label: 'Play Receiving · 5 min', accessibleLabel: 'Play Receiving, 5 minutes', disabled: false },
    })
    expect(v.quests).toEqual([{ key: 'session', label: 'One session', count: null, done: false }])
  })

  it('basics', () => {
    const v = view('basics')
    expect(v.hero).toEqual({
      kind: 'basics',
      title: 'Back to basics: Receiving',
      meta: 'Full explanations · 20 questions',
      play,
    })
    expect(v.quests).toEqual([
      { key: 'reviews', label: 'Clear your reviews', count: '0 of 2', done: false },
      { key: 'session', label: 'One session', count: null, done: false },
    ])
  })

  it('preparing', () => {
    const v = view('preparing')
    expect(v.streak).toBeNull()
    expect(v.hero).toEqual({
      kind: 'building',
      title: 'Building your questions',
      ready: 0,
      total: 42,
      status: '0 of 42 topics ready',
      note: buildingNote,
      play: { label: 'Play · 5 min', accessibleLabel: 'Play, 5 minutes', disabled: true },
    })
    expect(v.quests).toEqual([])
    expect(v.role?.started).toBe(false)
    expect(v.role?.chip).toBe('Not started')
  })
})
