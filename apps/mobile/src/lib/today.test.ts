import { createElement } from 'react'
import { AccessibilityInfo, AppState, Text, type AppStateStatus } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'
import { todayFixtures, type Today } from '@learnquiz/api/today'
import { api, ApiError } from './api'
import {
  BUILDING_POLL_MS,
  buildingStep,
  claimStreakPop,
  failureStatus,
  playParams,
  shouldAnnounce,
  todayFixture,
  useToday,
  utcDay,
} from './today'

jest.mock('./auth', () => ({ getToken: () => null, handleUnauthorized: async () => {} }))
jest.mock('./api', () => {
  const actual = jest.requireActual('./api')
  return { ApiError: actual.ApiError, api: jest.fn() }
})
let mockBlurred = false
jest.mock('expo-router', () => ({
  // Focus runs like an effect; tests can blur by unmounting the probe.
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect: useMountEffect } = jest.requireActual('react')
    useMountEffect(() => (mockBlurred ? undefined : effect()), [effect])
  },
}))

const building = (ready: number, total = 42): Today => ({
  ...todayFixtures.building,
  role: { ...todayFixtures.building.role!, building: { ready, total } },
})

let current: ReturnType<typeof useToday>
function Probe() {
  current = useToday()
  return createElement(Text, null, `${current.status}:${current.view?.hero.kind ?? '-'}`)
}

let appStateListener: ((state: AppStateStatus) => void) | undefined
beforeEach(() => {
  jest.resetAllMocks()
  mockBlurred = false
  appStateListener = undefined
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void
    return { remove: jest.fn() }
  })
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
})
afterEach(() => { jest.useRealTimers() })

describe('pure helpers', () => {
  test('the dev fixture switch only accepts the five named fixtures in dev', () => {
    expect(todayFixture('done', true)).toBe(todayFixtures.done)
    expect(todayFixture('basics', true)).toBe(todayFixtures.basics)
    expect(todayFixture('done', false)).toBeNull()
    expect(todayFixture('preparing', true)).toBeNull()
    expect(todayFixture('nope', true)).toBeNull()
    expect(todayFixture(undefined, true)).toBeNull()
  })

  test('no HTTP response means offline, a failed response means error', () => {
    expect(failureStatus(new ApiError(null, 'Network request failed'))).toBe('offline')
    expect(failureStatus(new ApiError(500, 'boom'))).toBe('error')
    expect(failureStatus(new Error('x'))).toBe('error')
  })

  test('the building step is floor(pct / 10) and announces only on change', () => {
    expect(buildingStep(building(28))).toBe(6)
    expect(buildingStep(building(29))).toBe(6)
    expect(buildingStep(building(42))).toBe(10)
    expect(buildingStep(building(0, 0))).toBeNull()
    expect(buildingStep(todayFixtures.normal)).toBeNull()
    expect(shouldAnnounce(null, 6)).toBe(false)
    expect(shouldAnnounce(6, 6)).toBe(false)
    expect(shouldAnnounce(6, 7)).toBe(true)
    expect(shouldAnnounce(7, null)).toBe(false)
  })

  test('Play goes to loading with the topic and start mode, never without a plan', () => {
    expect(playParams(todayFixtures.normal)).toEqual({ topicId: 'topic-warehouse', start: 'session' })
    expect(playParams(todayFixtures.preparing)).toBeNull()
    expect(playParams(null)).toBeNull()
  })

  test('the streak reward pops once per UTC day', () => {
    const day = utcDay(Date.UTC(2031, 0, 5, 23, 59))
    expect(day).toBe('2031-01-05')
    expect(claimStreakPop(day)).toBe(true)
    expect(claimStreakPop(day)).toBe(false)
    expect(claimStreakPop(utcDay(Date.UTC(2031, 0, 6, 0, 1)))).toBe(true)
  })
})

describe('useToday', () => {
  test('loads on focus and keeps the last value through a failed refetch', async () => {
    jest.mocked(api).mockResolvedValueOnce(todayFixtures.normal)
    await render(createElement(Probe))
    expect(api).toHaveBeenCalledWith('/today')
    expect(screen.getByText('ready:normal')).toBeOnTheScreen()

    jest.mocked(api).mockRejectedValueOnce(new ApiError(null, 'Network request failed'))
    await act(async () => { await current.refresh() })
    expect(screen.getByText('offline:normal')).toBeOnTheScreen()
    expect(current.today).toBe(todayFixtures.normal)
  })

  test('refetches when the app returns to the foreground', async () => {
    jest.mocked(api).mockResolvedValue(todayFixtures.normal)
    await render(createElement(Probe))
    expect(api).toHaveBeenCalledTimes(1)
    await act(async () => { appStateListener?.('background') })
    expect(api).toHaveBeenCalledTimes(1)
    await act(async () => { appStateListener?.('active') })
    expect(api).toHaveBeenCalledTimes(2)
  })

  test('polls every 15 s only while questions are building', async () => {
    jest.useFakeTimers()
    jest.mocked(api).mockResolvedValue(building(28))
    await render(createElement(Probe))
    expect(api).toHaveBeenCalledTimes(1)
    await act(async () => { jest.advanceTimersByTime(BUILDING_POLL_MS) })
    expect(api).toHaveBeenCalledTimes(2)

    jest.mocked(api).mockResolvedValue(todayFixtures.normal)
    await act(async () => { jest.advanceTimersByTime(BUILDING_POLL_MS) })
    expect(api).toHaveBeenCalledTimes(3)
    await act(async () => { jest.advanceTimersByTime(BUILDING_POLL_MS * 3) })
    expect(api).toHaveBeenCalledTimes(3)
  })

  test('does not poll while the app is in the background', async () => {
    jest.useFakeTimers()
    jest.mocked(api).mockResolvedValue(building(28))
    await render(createElement(Probe))
    await act(async () => { appStateListener?.('background') })
    await act(async () => { jest.advanceTimersByTime(BUILDING_POLL_MS * 2) })
    expect(api).toHaveBeenCalledTimes(1)
  })

  test('does not poll when the screen is not focused', async () => {
    jest.useFakeTimers()
    mockBlurred = true
    jest.mocked(api).mockResolvedValue(building(28))
    await render(createElement(Probe))
    await act(async () => { await current.refresh() })
    await act(async () => { jest.advanceTimersByTime(BUILDING_POLL_MS * 2) })
    expect(api).toHaveBeenCalledTimes(1)
  })

  test('announces building progress only when the tens of percent change', async () => {
    jest.mocked(api).mockResolvedValueOnce(building(28))
    await render(createElement(Probe))
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()

    jest.mocked(api).mockResolvedValueOnce(building(29))
    await act(async () => { await current.refresh() })
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()

    jest.mocked(api).mockResolvedValueOnce(building(33))
    await act(async () => { await current.refresh() })
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1)
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('33 of 42 topics ready')
  })
})

