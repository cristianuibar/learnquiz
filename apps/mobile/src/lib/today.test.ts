import { createElement } from 'react'
import { AccessibilityInfo, AppState, Text, type AppStateStatus } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'
import { todayFixtures, todayView, type Today, type TodayView } from '@learnquiz/api/today'
import { api, ApiError } from './api'
import { getToken } from './auth'
import { useSession, type Branding } from './session-store'
import { loadTodayCache, saveTodayCache } from './today-cache'
import type { TodayCache } from './today-cache'
import {
  BUILDING_POLL_MS,
  buildingStep,
  claimStreakPop,
  failureStatus,
  playParams,
  shouldAnnounce,
  todayFixture,
  useStreakPop,
  useToday,
  utcDay,
  viewForStatus,
} from './today'

jest.mock('./auth', () => ({ getToken: jest.fn(), handleUnauthorized: jest.fn(() => Promise.resolve()) }))
jest.mock('./session-store', () => ({ useSession: jest.fn() }))
jest.mock('./today-cache', () => ({ loadTodayCache: jest.fn(), saveTodayCache: jest.fn() }))
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

const mockApi = jest.mocked(api)
const mockGetToken = jest.mocked(getToken)
const mockSession = jest.mocked(useSession)
const mockLoadCache = jest.mocked(loadTodayCache)
const mockSaveCache = jest.mocked(saveTodayCache)

const building = (ready: number, total = 42): Today => ({
  ...todayFixtures.building,
  role: { ...todayFixtures.building.role!, building: { ready, total } },
})

function sessionFor(userId: string | null, branding: Branding | null = null) {
  return {
    status: userId ? 'ready' : 'signedOut',
    user: userId ? { id: userId, name: 'Test', isAnonymous: false } : null,
    needsDisclosure: false,
    branding,
    refresh: async () => {},
    setDisclosed: () => {},
  } as unknown as ReturnType<typeof useSession>
}

function cacheEntry(userId: string, today: Today, day?: string): TodayCache {
  return { userId, day: day ?? utcDay(Date.now()), today, branding: null }
}

let current: ReturnType<typeof useToday>
function Probe() {
  current = useToday()
  return createElement(Text, null, `${current.status}:${current.view?.hero.kind ?? '-'}`)
}

function heroPlayDisabled(): boolean | undefined {
  const hero = current.view?.hero
  if (!hero || hero.kind === 'empty' || hero.kind === 'done') return undefined
  return hero.play.disabled
}

let appStateListener: ((state: AppStateStatus) => void) | undefined
beforeEach(() => {
  jest.resetAllMocks()
  mockBlurred = false
  appStateListener = undefined
  mockGetToken.mockReturnValue(null)
  mockSession.mockReturnValue(sessionFor('u1'))
  mockLoadCache.mockResolvedValue(null)
  mockSaveCache.mockResolvedValue(undefined)
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

  test('Play is denied while offline or loading, allowed on ordinary errors', () => {
    expect(playParams(todayFixtures.normal, 'offline')).toBeNull()
    expect(playParams(todayFixtures.normal, 'loading')).toBeNull()
    expect(playParams(todayFixtures.normal, 'error')).toEqual({ topicId: 'topic-warehouse', start: 'session' })
    expect(playParams(todayFixtures.normal, 'ready')).toEqual({ topicId: 'topic-warehouse', start: 'session' })
  })

  test('viewForStatus disables the hero action while offline or loading', () => {
    const normal: TodayView = todayView(todayFixtures.normal, new Date())
    expect(viewForStatus(normal, 'ready')).toBe(normal)
    expect(viewForStatus(normal, 'error')).toBe(normal)
    expect(viewForStatus(normal, 'offline')?.hero).toMatchObject({ kind: 'normal', play: { disabled: true } })
    expect(viewForStatus(normal, 'loading')?.hero).toMatchObject({ kind: 'normal', play: { disabled: true } })
    expect(viewForStatus(null, 'offline')).toBeNull()
  })

  test('viewForStatus disables the done action and leaves empty alone', () => {
    const done = todayView(todayFixtures.done, new Date())
    expect(done.hero.kind).toBe('done')
    expect(viewForStatus(done, 'offline')?.hero).toMatchObject({ kind: 'done', action: { disabled: true } })
    const empty = todayView({ topic: null, role: null, plan: null }, new Date())
    expect(empty.hero.kind).toBe('empty')
    expect(viewForStatus(empty, 'offline')).toBe(empty)
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
    mockApi.mockResolvedValueOnce(todayFixtures.normal)
    await render(createElement(Probe))
    expect(mockApi).toHaveBeenCalledWith('/today')
    expect(screen.getByText('ready:normal')).toBeOnTheScreen()

    mockApi.mockRejectedValueOnce(new ApiError(null, 'Network request failed'))
    await act(async () => { await current.refresh() })
    expect(screen.getByText('offline:normal')).toBeOnTheScreen()
    expect(current.today).toBe(todayFixtures.normal)
  })

  test('refetches when the app returns to the foreground', async () => {
    mockApi.mockResolvedValue(todayFixtures.normal)
    await render(createElement(Probe))
    expect(mockApi).toHaveBeenCalledTimes(1)
    await act(async () => { appStateListener?.('background') })
    expect(mockApi).toHaveBeenCalledTimes(1)
    await act(async () => { appStateListener?.('active') })
    expect(mockApi).toHaveBeenCalledTimes(2)
  })

  test('polls every 15 s only while questions are building', async () => {
    jest.useFakeTimers()
    mockApi.mockResolvedValue(building(28))
    await render(createElement(Probe))
    expect(mockApi).toHaveBeenCalledTimes(1)
    await act(async () => { jest.advanceTimersByTime(BUILDING_POLL_MS) })
    expect(mockApi).toHaveBeenCalledTimes(2)

    mockApi.mockResolvedValue(todayFixtures.normal)
    await act(async () => { jest.advanceTimersByTime(BUILDING_POLL_MS) })
    expect(mockApi).toHaveBeenCalledTimes(3)
    await act(async () => { jest.advanceTimersByTime(BUILDING_POLL_MS * 3) })
    expect(mockApi).toHaveBeenCalledTimes(3)
  })

  test('does not poll while the app is in the background', async () => {
    jest.useFakeTimers()
    mockApi.mockResolvedValue(building(28))
    await render(createElement(Probe))
    await act(async () => { appStateListener?.('background') })
    await act(async () => { jest.advanceTimersByTime(BUILDING_POLL_MS * 2) })
    expect(mockApi).toHaveBeenCalledTimes(1)
  })

  test('does not poll when the screen is not focused', async () => {
    jest.useFakeTimers()
    mockBlurred = true
    mockApi.mockResolvedValue(building(28))
    await render(createElement(Probe))
    await act(async () => { await current.refresh() })
    await act(async () => { jest.advanceTimersByTime(BUILDING_POLL_MS * 2) })
    expect(mockApi).toHaveBeenCalledTimes(1)
  })

  test('announces building progress only when the tens of percent change', async () => {
    mockApi.mockResolvedValueOnce(building(28))
    await render(createElement(Probe))
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()

    mockApi.mockResolvedValueOnce(building(29))
    await act(async () => { await current.refresh() })
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()

    mockApi.mockResolvedValueOnce(building(33))
    await act(async () => { await current.refresh() })
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1)
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('33 of 42 topics ready')
  })

  test('a 20 s response still lands while polls arrive every 15 s', async () => {
    jest.useFakeTimers()
    mockApi.mockResolvedValueOnce(building(28))
    await render(createElement(Probe))
    expect(current.view?.hero).toMatchObject({ status: '28 of 42 topics ready' })

    mockApi.mockImplementation(() => new Promise((resolve) => { setTimeout(() => resolve(building(35)), 20_000) }))
    await act(async () => { await jest.advanceTimersByTimeAsync(BUILDING_POLL_MS) })
    expect(mockApi).toHaveBeenCalledTimes(2)
    // The next poll and a manual refresh join the request still in flight.
    await act(async () => { await jest.advanceTimersByTimeAsync(BUILDING_POLL_MS) })
    // Joins the in-flight request, so no new network call and no state write
    // outside act.
    expect(current.refresh()).toBeDefined()
    expect(mockApi).toHaveBeenCalledTimes(2)
    await act(async () => { await jest.advanceTimersByTimeAsync(5_000) })
    expect(current.view?.hero).toMatchObject({ status: '35 of 42 topics ready' })
  })

  test('a busy refresh joins the in-flight request and reports refreshing', async () => {
    let resolveApi!: (value: Today) => void
    mockApi.mockReturnValue(new Promise<Today>((resolve) => { resolveApi = resolve }))
    await render(createElement(Probe))
    expect(current.refreshing).toBe(true)
    // Both calls join the mount's in-flight request: no state writes, so no
    // act wrapper is needed and none may be used (a sync act would poison the
    // async act scopes of every later test in this file).
    const first = current.refresh()
    const second = current.refresh()
    expect(second).toBe(first)
    expect(mockApi).toHaveBeenCalledTimes(1)
    expect(current.refreshing).toBe(true)
    await act(async () => {
      resolveApi(todayFixtures.normal)
      await first
    })
    expect(current.refreshing).toBe(false)
    expect(screen.getByText('ready:normal')).toBeOnTheScreen()
  })

  test('a 401 never surfaces as an ordinary error', async () => {
    mockApi.mockRejectedValueOnce(new ApiError(401, 'Unauthorized'))
    await render(createElement(Probe))
    expect(current.status).toBe('loading')
    expect(current.today).toBeNull()
    expect(current.view).toBeNull()
    expect(mockSaveCache).not.toHaveBeenCalled()
  })

  test('an HTTP error keeps the last value playable, offline disables play', async () => {
    mockApi.mockResolvedValueOnce(todayFixtures.normal)
    await render(createElement(Probe))
    expect(heroPlayDisabled()).toBe(false)

    mockApi.mockRejectedValueOnce(new ApiError(500, 'boom'))
    await act(async () => { await current.refresh() })
    expect(current.status).toBe('error')
    expect(current.today).toBe(todayFixtures.normal)
    expect(heroPlayDisabled()).toBe(false)
    expect(playParams(current.today, current.status)).not.toBeNull()

    mockApi.mockRejectedValueOnce(new ApiError(null, 'Network request failed'))
    await act(async () => { await current.refresh() })
    expect(current.status).toBe('offline')
    expect(current.today).toBe(todayFixtures.normal)
    expect(heroPlayDisabled()).toBe(true)
    expect(playParams(current.today, current.status)).toBeNull()
  })

  test('foreground refetch recovers from offline to ready', async () => {
    mockApi.mockRejectedValueOnce(new ApiError(null, 'Network request failed'))
    await render(createElement(Probe))
    expect(screen.getByText('offline:-')).toBeOnTheScreen()

    mockApi.mockResolvedValueOnce(todayFixtures.normal)
    await act(async () => { appStateListener?.('active') })
    expect(screen.getByText('ready:normal')).toBeOnTheScreen()
    expect(mockSaveCache).toHaveBeenCalledWith('u1', todayFixtures.normal, null)
  })

  test('a token change drops the stale network completion', async () => {
    mockGetToken.mockReturnValue('t1')
    let resolveApi!: (value: Today) => void
    mockApi.mockReturnValue(new Promise<Today>((resolve) => { resolveApi = resolve }))
    await render(createElement(Probe))
    mockGetToken.mockReturnValue('t2')
    await act(async () => { resolveApi(todayFixtures.normal) })
    expect(current.today).toBeNull()
    expect(current.status).toBe('loading')
    expect(mockSaveCache).not.toHaveBeenCalled()
  })

  test('a refresh cannot attribute a new token to the previous session user', async () => {
    mockApi.mockResolvedValue(todayFixtures.normal)
    await render(createElement(Probe))
    expect(mockApi).toHaveBeenCalledTimes(1)
    mockSaveCache.mockClear()

    // Auth publishes the bearer before SessionProvider resolves the new user.
    // A foreground refresh can run before any Today render observes it.
    mockGetToken.mockReturnValue('new-user-token')
    await act(async () => { await current.refresh() })
    expect(mockApi).toHaveBeenCalledTimes(1)
    expect(mockSaveCache).not.toHaveBeenCalled()
  })

  test('a token ahead of the session suspends the stale user until it resolves', async () => {
    const resolvers: Array<(value: Today) => void> = []
    mockApi.mockImplementation(() => new Promise<Today>((resolve) => { resolvers.push(resolve) }))
    const mounted = await render(createElement(Probe))
    await act(async () => { resolvers[0](todayFixtures.normal) })
    expect(screen.getByText('ready:normal')).toBeOnTheScreen()
    expect(mockSaveCache).toHaveBeenCalledTimes(1)

    // A second request starts under the old token, then the token moves while
    // the session still names u1. The late completion is dropped, and the
    // first render observing the new token suspends the stale payload; the
    // cache re-read on that same render must not paint either.
    await act(async () => { void current.refresh() })
    expect(mockApi).toHaveBeenCalledTimes(2)
    mockLoadCache.mockResolvedValue(cacheEntry('u1', todayFixtures.basics))
    mockGetToken.mockReturnValue('t2')
    await act(async () => { resolvers[1](todayFixtures.basics) })
    expect(screen.getByText('loading:-')).toBeOnTheScreen()
    expect(current.today).toBeNull()
    expect(current.status).toBe('loading')
    expect(mockSaveCache).toHaveBeenCalledTimes(1)

    // Nothing new is fetched until the fresh session arrives.
    await mounted.rerender(createElement(Probe))
    expect(screen.getByText('loading:-')).toBeOnTheScreen()
    expect(current.today).toBeNull()
    expect(mockApi).toHaveBeenCalledTimes(2)

    // A refresh waits for the confirmed user instead of fetching with the
    // new token while the session still names the previous user.
    await act(async () => { void current.refresh() })
    expect(mockApi).toHaveBeenCalledTimes(2)
    expect(current.today).toBeNull()
    expect(current.status).toBe('loading')
    expect(mockSaveCache).toHaveBeenCalledTimes(1)

    // The fresh session user arrives: the new identity loads and saves.
    mockSession.mockReturnValue(sessionFor('u2'))
    await mounted.rerender(createElement(Probe))
    expect(mockApi).toHaveBeenCalledTimes(3)
    await act(async () => { resolvers[2](todayFixtures.normal) })
    expect(screen.getByText('ready:normal')).toBeOnTheScreen()
    expect(mockSaveCache).toHaveBeenCalledTimes(2)
    expect(mockSaveCache).toHaveBeenLastCalledWith('u2', todayFixtures.normal, null)
  })

  test('a re-resolved session lifts the suspension for the same user', async () => {
    const resolvers: Array<(value: Today) => void> = []
    mockApi.mockImplementation(() => new Promise<Today>((resolve) => { resolvers.push(resolve) }))
    const mounted = await render(createElement(Probe))
    await act(async () => { resolvers[0](todayFixtures.normal) })
    expect(screen.getByText('ready:normal')).toBeOnTheScreen()

    mockGetToken.mockReturnValue('t2')
    await mounted.rerender(createElement(Probe))
    expect(screen.getByText('loading:-')).toBeOnTheScreen()
    expect(mockApi).toHaveBeenCalledTimes(1)

    // The session confirms the same user with a new user object: the load
    // restarts and the confirmed payload applies.
    mockSession.mockReturnValue(sessionFor('u1'))
    await mounted.rerender(createElement(Probe))
    expect(mockApi).toHaveBeenCalledTimes(2)
    await act(async () => { resolvers[1](todayFixtures.basics) })
    expect(screen.getByText('ready:basics')).toBeOnTheScreen()
    expect(mockSaveCache).toHaveBeenLastCalledWith('u1', todayFixtures.basics, null)
  })
})

describe('useToday per-user cache', () => {
  test('cache paints first while the request is pending, then fresh replaces it', async () => {
    let resolveCache!: (value: TodayCache | null) => void
    mockLoadCache.mockReturnValue(new Promise<TodayCache | null>((resolve) => { resolveCache = resolve }))
    let resolveApi!: (value: Today) => void
    mockApi.mockReturnValue(new Promise<Today>((resolve) => { resolveApi = resolve }))
    await render(createElement(Probe))
    expect(current.view).toBeNull()

    await act(async () => { resolveCache(cacheEntry('u1', todayFixtures.basics)) })
    // Cache paints, but stays unverified: loading with a disabled Play.
    expect(current.today).toBe(todayFixtures.basics)
    expect(current.status).toBe('loading')
    expect(screen.getByText('loading:basics')).toBeOnTheScreen()
    expect(heroPlayDisabled()).toBe(true)
    expect(playParams(current.today, current.status)).toBeNull()

    await act(async () => { resolveApi(todayFixtures.normal) })
    expect(current.today).toBe(todayFixtures.normal)
    expect(current.status).toBe('ready')
    expect(heroPlayDisabled()).toBe(false)
    expect(mockSaveCache).toHaveBeenCalledWith('u1', todayFixtures.normal, null)
  })

  test('a late cache read never overwrites fresh network data', async () => {
    let resolveCache!: (value: TodayCache | null) => void
    mockLoadCache.mockReturnValue(new Promise<TodayCache | null>((resolve) => { resolveCache = resolve }))
    mockApi.mockResolvedValueOnce(todayFixtures.normal)
    await render(createElement(Probe))
    expect(current.today).toBe(todayFixtures.normal)

    await act(async () => { resolveCache(cacheEntry('u1', todayFixtures.basics)) })
    expect(current.today).toBe(todayFixtures.normal)
    expect(current.status).toBe('ready')
  })

  test('another user’s cache is ignored', async () => {
    mockLoadCache.mockResolvedValue(cacheEntry('u1', todayFixtures.basics))
    mockSession.mockReturnValue(sessionFor('u2'))
    mockApi.mockReturnValueOnce(new Promise<Today>(() => {}))
    await render(createElement(Probe))
    expect(current.today).toBeNull()
    expect(current.status).toBe('loading')
    expect(mockSaveCache).not.toHaveBeenCalled()
  })

  test('a stale UTC day is ignored at resolve time', async () => {
    const yesterday = utcDay(Date.now() - 86_400_000)
    mockLoadCache.mockResolvedValue(cacheEntry('u1', todayFixtures.basics, yesterday))
    mockApi.mockReturnValueOnce(new Promise<Today>(() => {}))
    await render(createElement(Probe))
    expect(current.today).toBeNull()
    expect(current.status).toBe('loading')
  })

  test('an offline cached plan expires when its UTC day ends', async () => {
    jest.useFakeTimers({ now: Date.UTC(2035, 1, 4, 23, 59) })
    mockLoadCache.mockResolvedValue(cacheEntry('u1', todayFixtures.normal))
    mockApi.mockRejectedValue(new ApiError(null, 'Offline'))
    await render(createElement(Probe))
    expect(current.today).toBe(todayFixtures.normal)
    expect(current.status).toBe('offline')

    await act(async () => { await jest.advanceTimersByTimeAsync(60_000) })
    expect(current.today).toBeNull()
    expect(current.view).toBeNull()
    expect(current.status).toBe('offline')
  })

  test('a live plan refetches at UTC midnight and cannot become yesterday’s offline plan', async () => {
    jest.useFakeTimers({ now: Date.UTC(2035, 1, 4, 23, 59) })
    mockApi.mockResolvedValueOnce(todayFixtures.normal)
    await render(createElement(Probe))
    expect(current.status).toBe('ready')
    mockApi.mockRejectedValueOnce(new ApiError(null, 'Offline'))

    await act(async () => { await jest.advanceTimersByTimeAsync(60_000) })
    expect(mockApi).toHaveBeenCalledTimes(2)
    expect(current.today).toBeNull()
    expect(current.status).toBe('offline')
  })

  test('midnight expiry in the background stays loading until foreground recovery', async () => {
    jest.useFakeTimers({ now: Date.UTC(2035, 1, 4, 23, 59) })
    mockApi.mockResolvedValue(todayFixtures.normal)
    await render(createElement(Probe))
    await act(async () => { appStateListener?.('background') })

    await act(async () => { await jest.advanceTimersByTimeAsync(60_000) })
    expect(current.today).toBeNull()
    expect(current.status).toBe('loading')
    expect(current.refreshing).toBe(false)
    expect(mockApi).toHaveBeenCalledTimes(1)

    await act(async () => { appStateListener?.('active') })
    expect(current.status).toBe('ready')
    expect(current.today).toBe(todayFixtures.normal)
    expect(mockApi).toHaveBeenCalledTimes(2)
  })

  test('identity change drops the old render and ignores pending reads and responses', async () => {
    const resolvers: Array<(value: Today) => void> = []
    mockApi.mockImplementation(() => new Promise<Today>((resolve) => { resolvers.push(resolve) }))
    let resolveCache!: (value: TodayCache | null) => void
    mockLoadCache.mockImplementation((userId: string) => (
      userId === 'u1'
        ? new Promise<TodayCache | null>((resolve) => { resolveCache = resolve })
        : Promise.resolve(null)
    ))
    const mounted = await render(createElement(Probe))
    await act(async () => { resolvers[0](todayFixtures.basics) })
    expect(screen.getByText('ready:basics')).toBeOnTheScreen()
    expect(mockSaveCache).toHaveBeenCalledWith('u1', todayFixtures.basics, null)

    // A second request for u1 is still pending when the identity switches:
    // the old render disappears and the new user starts its own request.
    await act(async () => { void current.refresh() })
    mockSession.mockReturnValue(sessionFor('u2'))
    await mounted.rerender(createElement(Probe))
    expect(screen.getByText('loading:-')).toBeOnTheScreen()
    expect(current.today).toBeNull()
    expect(mockApi).toHaveBeenCalledTimes(3)

    // The old user's late cache read and late network response are dropped.
    await act(async () => { resolveCache(cacheEntry('u1', todayFixtures.basics)) })
    expect(current.today).toBeNull()
    await act(async () => { resolvers[1](todayFixtures.done) })
    expect(current.today).toBeNull()
    expect(current.status).toBe('loading')

    // The new user's own response lands and saves under the new identity.
    await act(async () => { resolvers[2](todayFixtures.normal) })
    expect(screen.getByText('ready:normal')).toBeOnTheScreen()
    expect(mockSaveCache).toHaveBeenLastCalledWith('u2', todayFixtures.normal, null)
  })

  test('successful payloads save the captured branding', async () => {
    const branding: Branding = { name: 'Acme', logoUrl: null, accent: '#fff' }
    mockSession.mockReturnValue(sessionFor('u1', branding))
    mockApi.mockResolvedValueOnce(todayFixtures.normal)
    await render(createElement(Probe))
    expect(mockSaveCache).toHaveBeenCalledWith('u1', todayFixtures.normal, branding)
  })
})

describe('useStreakPop', () => {
  let pop: boolean
  function PopProbe({ reward }: { reward: boolean }) {
    pop = useStreakPop(reward)
    return null
  }

  test('pops once per UTC day, even across done, normal and done again', async () => {
    jest.useFakeTimers({ now: Date.UTC(2032, 2, 1, 10, 0) })
    const view = await render(createElement(PopProbe, { reward: true }))
    expect(pop).toBe(true)
    await view.rerender(createElement(PopProbe, { reward: false }))
    expect(pop).toBe(false)
    await view.rerender(createElement(PopProbe, { reward: true }))
    expect(pop).toBe(false)

    jest.setSystemTime(Date.UTC(2032, 2, 2, 0, 5))
    await view.rerender(createElement(PopProbe, { reward: true }))
    expect(pop).toBe(true)
  })
})
