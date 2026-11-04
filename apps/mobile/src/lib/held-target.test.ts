import { deferReplay, holdJoinAttempt, holdTarget, joinAttemptHeld, releaseReplayHolds, replayVersion, subscribeReplay, takeHeldTarget, takeReplayTarget } from './held-target'

test('take with nothing held returns null', () => {
  expect(takeHeldTarget()).toBeNull()
})

test('hold then take returns the path exactly once', () => {
  holdTarget('/play/quick/abc')
  expect(takeHeldTarget()).toBe('/play/quick/abc')
  expect(takeHeldTarget()).toBeNull()
})

test('latest hold wins', () => {
  holdTarget('/first')
  holdTarget('/second')
  expect(takeHeldTarget()).toBe('/second')
  expect(takeHeldTarget()).toBeNull()
})

describe('replay holds', () => {
  beforeEach(() => { releaseReplayHolds(); takeHeldTarget() })

  test('a hold keeps the link held until it is released', () => {
    holdTarget('/unit/u1')
    const release = deferReplay()
    expect(takeReplayTarget()).toBeNull()
    release()
    expect(takeReplayTarget()).toBe('/unit/u1')
  })

  test('signing out releases every hold, and a stale release cannot end a newer hold', () => {
    holdTarget('/unit/u1')
    const stale = deferReplay()
    deferReplay()
    releaseReplayHolds()
    const current = deferReplay()
    stale()
    stale()
    expect(takeReplayTarget()).toBeNull()
    current()
    expect(takeReplayTarget()).toBe('/unit/u1')
  })

  test('releasing the last hold with a held link notifies the layout exactly once', () => {
    const listener = jest.fn()
    const unsubscribe = subscribeReplay(listener)
    holdTarget('/unit/u1')
    const first = deferReplay()
    const second = deferReplay()
    const before = replayVersion()
    first()
    expect(listener).not.toHaveBeenCalled()
    second()
    second()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(replayVersion()).toBe(before + 1)
    unsubscribe()
  })

  test('releasing with no held link does not notify', () => {
    const listener = jest.fn()
    const unsubscribe = subscribeReplay(listener)
    deferReplay()()
    const release = deferReplay()
    releaseReplayHolds()
    release()
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
})

describe('join attempt holds', () => {
  beforeEach(() => { releaseReplayHolds(); takeHeldTarget() })

  test('an attempt hold lasts until it is released, and does not hold replay', () => {
    holdTarget('/unit/u1')
    const first = holdJoinAttempt()
    const second = holdJoinAttempt()
    expect(joinAttemptHeld()).toBe(true)
    first()
    first()
    expect(joinAttemptHeld()).toBe(true)
    second()
    expect(joinAttemptHeld()).toBe(false)
    expect(takeReplayTarget()).toBe('/unit/u1')
  })

  test('sign-out ends every attempt hold, and a stale release does nothing', () => {
    const release = holdJoinAttempt()
    releaseReplayHolds()
    expect(joinAttemptHeld()).toBe(false)
    const next = holdJoinAttempt()
    release()
    expect(joinAttemptHeld()).toBe(true)
    next()
    expect(joinAttemptHeld()).toBe(false)
  })
})
