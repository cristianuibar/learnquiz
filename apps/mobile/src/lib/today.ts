import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { todayFixtures, todayView, type Today, type TodayView } from '@learnquiz/api/today'
import { api, ApiError } from './api'

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

export function playParams(today: Today | null): { topicId: string; start: 'session' | 'placement' } | null {
  if (!today?.topic || !today.plan) return null
  return { topicId: today.topic.id, start: today.plan.start }
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

export function useToday(): { today: Today | null; view: TodayView | null; status: TodayStatus; refresh: () => Promise<void> } {
  const fixture = todayFixture(process.env.EXPO_PUBLIC_TODAY_FIXTURE, __DEV__)
  const [today, setToday] = useState<Today | null>(fixture)
  const [status, setStatus] = useState<TodayStatus>(fixture ? 'ready' : 'loading')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(AppState.currentState !== 'background')
  const issued = useRef(0)
  const applied = useRef(0)
  const inFlight = useRef<Promise<void> | null>(null)
  const mounted = useRef(true)
  const focusedRef = useRef(false)

  // One request at a time: a poll, focus or foreground refetch that arrives
  // while /today is still loading joins that request instead of replacing it,
  // so a slow response still lands. A response is only dropped when a newer
  // one has already been applied.
  const refresh = useCallback((): Promise<void> => {
    if (fixture) return Promise.resolve()
    if (inFlight.current) return inFlight.current
    const sequence = ++issued.current
    const run: Promise<void> = api<Today>('/today').then(
      (next) => {
        if (!mounted.current || sequence <= applied.current) return
        applied.current = sequence
        setToday(next)
        setStatus('ready')
      },
      (error: unknown) => {
        // Keep the last value on screen; only the status changes.
        if (mounted.current && sequence > applied.current) setStatus(failureStatus(error))
      },
    ).finally(() => {
      if (inFlight.current === run) inFlight.current = null
    })
    inFlight.current = run
    return run
  }, [fixture])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

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

  const building = today?.role?.building != null
  useEffect(() => {
    if (fixture || !building || !focused || !active) return
    const timer = setInterval(() => { void refresh() }, BUILDING_POLL_MS)
    return () => clearInterval(timer)
  }, [fixture, building, focused, active, refresh])

  const view = useMemo(() => (today ? todayView(today, new Date()) : null), [today])

  const step = useRef<number | null>(null)
  useEffect(() => {
    const next = buildingStep(today)
    if (shouldAnnounce(step.current, next) && view?.hero.kind === 'building' && view.hero.status) {
      AccessibilityInfo.announceForAccessibility(view.hero.status)
    }
    step.current = next
  }, [today, view])

  return { today, view, status, refresh }
}
