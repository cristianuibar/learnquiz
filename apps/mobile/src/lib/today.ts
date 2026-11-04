import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { todayFixtures, todayView, type Today, type TodayView } from '@learnquiz/api/today'
import { api, ApiError } from './api'
import { getToken } from './auth'
import { useSession, type Branding } from './session-store'
import { loadTodayCache, saveTodayCache } from './today-cache'

// The session Loading route makes the start call; Today only navigates there.
export const PLAY_LOADING = '/play/loading'
export const BUILDING_POLL_MS = 15_000

export type TodayStatus = 'loading' | 'ready' | 'offline' | 'error'
export type TodayFixtureName = 'first' | 'normal' | 'done' | 'building' | 'basics'
const fixtureNames: readonly string[] = ['first', 'normal', 'done', 'building', 'basics'] satisfies TodayFixtureName[]

// Dev-only switch: EXPO_PUBLIC_TODAY_FIXTURE=<name> renders a shared fixture
// instead of calling the API.
export function todayFixture(name: string | undefined, dev: boolean): Today | null {
  if (!dev || !name || !fixtureNames.includes(name)) return null
  return todayFixtures[name as TodayFixtureName]
}

// A request that never got an HTTP response (network, timeout) is offline;
// any server response that failed is an error.
export function failureStatus(error: unknown): 'offline' | 'error' {
  return error instanceof ApiError && error.status === null ? 'offline' : 'error'
}

// floor(pct / 10) of the questions being built, or null when nothing is building.
export function buildingStep(today: Today | null): number | null {
  const building = today?.role?.building
  if (!building || building.total <= 0) return null
  return Math.floor((building.ready / building.total) * 10)
}

// Announce only when the step changes after the first reading.
export function shouldAnnounce(previous: number | null, next: number | null): boolean {
  return previous !== null && next !== null && next !== previous
}

// Play is unavailable while offline or while the payload is still unverified
// (initial load, including a cache-painted but not yet confirmed value). An
// ordinary HTTP error keeps the last confirmed value playable.
export function playParams(
  today: Today | null,
  status: TodayStatus = 'ready',
): { topicId: string; start: 'session' | 'placement' } | null {
  if (status === 'offline' || status === 'loading') return null
  if (!today?.topic || !today.plan) return null
  return { topicId: today.topic.id, start: today.plan.start }
}

// The user-visible model: while offline or unverified/loading the hero action
// renders disabled. An ordinary HTTP error preserves the confirmed view as-is.
export function viewForStatus(base: TodayView | null, status: TodayStatus): TodayView | null {
  if (!base || status === 'ready' || status === 'error') return base
  const hero = base.hero
  if (hero.kind === 'empty') return base
  if (hero.kind === 'done') {
    return { ...base, hero: { ...hero, action: { ...hero.action, disabled: true } } }
  }
  return { ...base, hero: { ...hero, play: { ...hero.play, disabled: true } } }
}

// The streak reward pops once per UTC day for each run of the app.
const poppedDays = new Set<string>()
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}
export function claimStreakPop(day: string): boolean {
  if (poppedDays.has(day)) return false
  poppedDays.add(day)
  return true
}

export function useStreakPop(reward: boolean): boolean {
  const decided = useRef<{ day: string; pop: boolean } | null>(null)
  if (!reward) {
    // Leaving the done state uses up the pop, so coming back the same UTC day stays quiet.
    if (decided.current) decided.current.pop = false
    return false
  }
  const day = utcDay(Date.now())
  if (decided.current?.day !== day) decided.current = { day, pop: claimStreakPop(day) }
  return decided.current.pop
}

type Identity = { id: string | null; branding: Branding | null; token: string | null }
type Owner = { id: string; token: string | null }

export function useToday(): {
  today: Today | null
  view: TodayView | null
  status: TodayStatus
  refreshing: boolean
  refresh: () => Promise<void>
} {
  const fixture = todayFixture(process.env.EXPO_PUBLIC_TODAY_FIXTURE, __DEV__)
  const session = useSession()
  const user = session.user
  const userId = user?.id ?? null
  const branding = session.branding ?? null
  // The bearer behind this render. SessionProvider retains the previous ready
  // state while /session resolves, so the token can move before user.id does;
  // identity covers both, so nothing is shown or stored under a stale user.
  const token = getToken()
  const [today, setToday] = useState<Today | null>(fixture)
  const [payloadDay, setPayloadDay] = useState<string | null>(null)
  const [status, setStatus] = useState<TodayStatus>(fixture ? 'ready' : 'loading')
  const [refreshing, setRefreshing] = useState(false)
  // Keep polling a building plan through midnight until a fresh plan replaces it.
  const [building, setBuilding] = useState(false)
  // Which identity's payload is on screen. Compared during render so an
  // identity change hides the old data on the very first committed render,
  // before any effect runs.
  const [owner, setOwner] = useState<Owner | null>(null)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(AppState.currentState !== 'background')
  const issued = useRef(0)
  const applied = useRef(0)
  const inFlight = useRef<Promise<void> | null>(null)
  const inFlightOwner = useRef<Owner | null>(null)
  // The identity whose network payload is confirmed on screen. A late cache
  // read never overwrites it.
  const freshOwner = useRef<Owner | null>(null)
  // Set while the token moved ahead of the session user: completions and
  // cache paints wait until the fresh session.user arrives.
  const suspended = useRef(false)
  const mounted = useRef(true)
  const focusedRef = useRef(false)
  const identityRef = useRef<Identity>({ id: userId, branding, token })
  const prevIdentity = useRef<{ id: string | null; token: string | null } | null>(null)
  const identitySettled = useRef(false)

  // Render-phase guard: never show one identity's payload under another.
  const visibleToday = fixture ? today : owner?.id === userId && owner?.token === token &&
    (payloadDay === null || payloadDay === utcDay(Date.now())) ? today : null

  // Keep the captured identity fresh for request completions. Declared first
  // so later effects observe the current identity.
  useEffect(() => {
    identityRef.current = { id: userId, branding, token }
  }, [userId, branding, token])

  function stillCurrent(captured: Identity, requestToken: string | null, sequence: number): boolean {
    if (!mounted.current || sequence <= applied.current) return false
    if (suspended.current) return false
    if (getToken() !== requestToken) return false
    const live = identityRef.current
    return live.id === captured.id && live.token === captured.token
  }

  // One request at a time per identity: a poll, focus or foreground refetch
  // that arrives while /today is still loading joins that request instead of
  // replacing it, so a slow response still lands. A response is only applied
  // when its identity and token still match and the session is not stale;
  // anything else is dropped.
  const refresh = useCallback((): Promise<void> => {
    if (fixture) return Promise.resolve()
    const captured = identityRef.current
    // Auth can publish a new bearer before React renders its session user.
    // Wait for that identity to settle before attributing any new response.
    if (captured.id == null || suspended.current || captured.token !== getToken()) return Promise.resolve()
    if (
      inFlight.current &&
      inFlightOwner.current?.id === captured.id &&
      inFlightOwner.current?.token === captured.token
    ) {
      return inFlight.current
    }
    const requestToken = getToken()
    const sentAt = Date.now()
    const requestDay = utcDay(sentAt)
    const sequence = ++issued.current
    setRefreshing(true)
    let refreshForNewDay = false
    const ownerForRun: Owner | null = captured.id == null ? null : { id: captured.id, token: requestToken }
    const run: Promise<void> = api<Today>('/today').then(
      (next) => {
        if (!stillCurrent(captured, requestToken, sequence)) return
        // A plan belongs to the UTC day on which it was requested.
        if (utcDay(Date.now()) !== requestDay) {
          refreshForNewDay = true
          return
        }
        applied.current = sequence
        freshOwner.current = ownerForRun
        setOwner(ownerForRun)
        setToday(next)
        setBuilding(next.role?.building != null)
        setPayloadDay(requestDay)
        setStatus('ready')
        // Persist only the confirmed network payload, for the identity that
        // fetched it. Storage failure is contained inside saveTodayCache.
        if (captured.id != null) void saveTodayCache(captured.id, next, captured.branding, sentAt)
      },
      (error: unknown) => {
        // Keep the last value on screen; only the status changes. A 401 is
        // owned by auth (it signs out); it never surfaces as an error here.
        if (error instanceof ApiError && error.status === 401) return
        if (!stillCurrent(captured, requestToken, sequence)) return
        setStatus(failureStatus(error))
      },
    ).finally(() => {
      if (inFlight.current === run) {
        inFlight.current = null
        inFlightOwner.current = null
        // Start exactly one new-day request after releasing deduplication.
        // Returning it also keeps a learner retry busy through the recovery.
        if (refreshForNewDay && stillCurrent(captured, requestToken, sequence)) return refresh()
        if (mounted.current) setRefreshing(false)
      }
    })
    inFlight.current = run
    inFlightOwner.current = ownerForRun
    return run
  }, [fixture])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Identity transition: drop the old payload and start this identity's load.
  // The render-phase guard above already hides the old data; this settles the
  // state. A token-only change means the session still names the previous
  // user, so fetching waits for the fresh session.user instead of attributing
  // the new token's data to the stale user.
  useEffect(() => {
    if (fixture) return
    const prev = prevIdentity.current
    if (prev && prev.id === userId && prev.token === token) return
    const idChanged = !prev || prev.id !== userId
    prevIdentity.current = { id: userId, token }
    // The first mount is owned by the focus effect below (or a manual refresh
    // when unfocused); only later identity transitions act here.
    if (!identitySettled.current) {
      identitySettled.current = true
      return
    }
    freshOwner.current = null
    setOwner(null)
    setToday(null)
    setBuilding(false)
    setPayloadDay(null)
    setStatus('loading')
    if (!idChanged) {
      suspended.current = userId != null
      return
    }
    suspended.current = false
    if (userId != null) void refresh()
  }, [fixture, userId, token, refresh])

  // The session re-resolved (a new user object): a token-only suspension is
  // over. When the id is unchanged the identity effect above stays quiet, so
  // this effect restarts the load for the confirmed session.
  useEffect(() => {
    if (fixture || !suspended.current || userId == null) return
    suspended.current = false
    void refresh()
  }, [fixture, user, userId, refresh])

  // Stale-while-revalidate: read this user's same-day cache alongside the
  // initial request and paint it while the request is pending (status stays
  // loading, so the hero action stays disabled until confirmed). The paint is
  // applied only when no fresher network payload landed first, the token and
  // identity still match, the session is not stale, and the cached day still
  // matches at resolve time.
  useEffect(() => {
    if (fixture || userId == null) return
    const capturedId = userId
    const requestToken = getToken()
    void loadTodayCache(capturedId).then((entry) => {
      if (!mounted.current) return
      if (suspended.current) return
      if (getToken() !== requestToken) return
      const live = identityRef.current
      if (live.id !== capturedId || live.token !== requestToken) return
      if (!entry || entry.userId !== capturedId) return
      if (entry.day !== utcDay(Date.now())) return
      if (freshOwner.current?.id === capturedId && freshOwner.current?.token === requestToken) return
      setOwner({ id: capturedId, token: requestToken })
      setToday(entry.today)
      setBuilding(entry.today.role?.building != null)
      setPayloadDay(entry.day)
    })
  }, [fixture, userId, token])

  // Last-known plans expire at UTC midnight, including values fetched in this run.
  useEffect(() => {
    if (payloadDay === null) return
    const remaining = Date.parse(`${payloadDay}T00:00:00.000Z`) + 86_400_000 - Date.now()
    const timer = setTimeout(() => {
      setToday(null)
      setOwner(null)
      setPayloadDay(null)
      setStatus((previous) => previous === 'ready' ? 'loading' : previous)
      if (focusedRef.current && active) void refresh()
    }, Math.max(0, remaining))
    return () => clearTimeout(timer)
  }, [payloadDay, active, refresh])

  useFocusEffect(useCallback(() => {
    focusedRef.current = true
    setFocused(true)
    void refresh()
    return () => {
      focusedRef.current = false
      setFocused(false)
    }
  }, [refresh]))

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active')
      if (state === 'active' && focusedRef.current) void refresh()
    })
    return () => subscription.remove()
  }, [refresh])

  useEffect(() => {
    if (fixture || !building || !focused || !active) return
    const timer = setInterval(() => { void refresh() }, BUILDING_POLL_MS)
    return () => clearInterval(timer)
  }, [fixture, building, focused, active, refresh])

  const baseView = useMemo(() => (visibleToday ? todayView(visibleToday, new Date()) : null), [visibleToday])
  const view = useMemo(() => viewForStatus(baseView, status), [baseView, status])

  const step = useRef<number | null>(null)
  useEffect(() => {
    const next = buildingStep(visibleToday)
    if (shouldAnnounce(step.current, next) && view?.hero.kind === 'building' && view.hero.status) {
      AccessibilityInfo.announceForAccessibility(view.hero.status)
    }
    step.current = next
  }, [visibleToday, view])

  return { today: visibleToday, view, status, refreshing, refresh }
}
