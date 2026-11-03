import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import type { Branding, SessionResponse, SessionUser } from '@learnquiz/api'
import { api, ApiError } from './api'
import { getToken, handleUnauthorized, loadToken, signOut, subscribeAuth } from './auth'
import { releaseReplayHolds } from './held-target'
import * as kv from './kv'

export type { Branding, SessionUser } from '@learnquiz/api'

type State = {
  status: 'loading' | 'signedOut' | 'ready'
  user: SessionUser | null
  needsDisclosure: boolean
  branding: Branding | null
  // The stored session is shown without the server (no signal or a 5xx); user is
  // null when no session was confirmed on this phone yet. Retried on foreground.
  offline?: boolean
}
type Session = State & { refresh(): Promise<void>; setDisclosed(): void }
const signedOut: State = { status: 'signedOut', user: null, needsDisclosure: false, branding: null }
const SessionContext = createContext<Session | null>(null)

// The last session the server confirmed. It is an `lq:` key, so sign-out and
// 401 cleanup erase it with the rest of the learner's data.
const SESSION_KEY = 'lq:session'
type StoredSession = Pick<SessionResponse, 'needsDisclosure'> & { user: SessionUser; branding: Branding | null }

async function readStored(): Promise<StoredSession | null> {
  try {
    const stored = await kv.getJSON<StoredSession>(SESSION_KEY)
    return typeof stored?.user?.id === 'string' ? stored : null
  } catch {
    return null
  }
}

function writeStored(value: StoredSession) {
  return kv.setJSON(SESSION_KEY, value).catch(() => {})
}

// How long sign-out may wait on its own steps (push unregistration first) before
// the local session is cleared anyway.
export const SIGN_OUT_WAIT_MS = 5_000

// Sign out from a screen. Never rejects, and never leaves the learner signed in:
// when signOut() rejects or stalls while the same bearer is still live, the local
// session is cleared directly (token, lq: data, the signedOut event).
export async function endSession(waitMs = SIGN_OUT_WAIT_MS): Promise<void> {
  const bearer = getToken()
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    signOut().catch(() => {}),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, waitMs) }),
  ])
  clearTimeout(timer)
  // A cleared or newer bearer means sign-out already happened, or someone signed in since.
  if (bearer !== null && getToken() === bearer) await handleUnauthorized().catch(() => {})
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ ...signedOut, status: 'loading' })
  const request = useRef(0)
  const stored = useRef<StoredSession | null>(null)
  const offline = useRef(false)
  const bearer = useRef<string | null>(null)
  const refresh = useCallback(async () => {
    const current = ++request.current
    let token: string | null = null
    const stale = () => current !== request.current || token !== getToken()
    try {
      token = await loadToken()
      if (current !== request.current) return
      if (!token) { setState(signedOut); return }
      // A bearer from another sign-in this run: the stored session may be another
      // learner's, so it must not stand in for this one, now or on a relaunch.
      const newBearer = bearer.current !== null && bearer.current !== token
      bearer.current = token
      if (newBearer) await kv.remove(SESSION_KEY).catch(() => {})
      if (stale()) return
      let session: Pick<SessionResponse, 'user' | 'needsDisclosure'>
      try {
        session = await api<SessionResponse>('/session')
      } catch (error) {
        if (stale()) return
        if (error instanceof ApiError && error.status === 401) { await handleUnauthorized(); return }
        // No signal or a server error: keep the token and show the signed-in shell.
        const last = newBearer ? null : await readStored()
        if (stale()) return
        stored.current = last
        offline.current = true
        setState({ status: 'ready', user: last?.user ?? null, needsDisclosure: last?.needsDisclosure ?? false,
          branding: last?.branding ?? null, offline: true })
        return
      }
      if (stale()) return
      if (!session.user) { await handleUnauthorized(); return }
      const user = session.user
      const last = await readStored()
      if (stale()) return
      // Another learner (or an unknown one) used this phone: drop their drafts and
      // caches before this learner's screens can read them.
      if (last?.user.id !== user.id) await kv.clearPrefix('lq:')
      if (stale()) return
      let branding: Branding | null
      try {
        branding = await api<Branding | null>('/branding')
      } catch (error) {
        if (stale()) return
        if (error instanceof ApiError && error.status === 401) { await handleUnauthorized(); return }
        branding = last?.user.id === user.id ? last.branding : null
      }
      if (stale()) return
      const next = { user, needsDisclosure: session.needsDisclosure, branding }
      await writeStored(next)
      if (stale()) return
      stored.current = next
      offline.current = false
      setState({ status: 'ready', ...next })
    } catch {
      // Local storage failed (clearing another learner's data, or a 401's cleanup).
      // Never show the shell over data that may not belong to this learner.
      if (current === request.current) setState(signedOut)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeAuth((event) => {
      // Sign-out also ends every hold on held-link replay (an unfinished join).
      if (event === 'signedOut') { request.current++; releaseReplayHolds(); setState(signedOut) }
      else void refresh()
    })
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active' && offline.current) void refresh()
    })
    void refresh()
    return () => { unsubscribe(); appState.remove(); request.current++ }
  }, [refresh])

  const setDisclosed = useCallback(() => {
    setState((previous) => ({ ...previous, needsDisclosure: false }))
    // An offline relaunch must not show the disclosure again.
    if (stored.current) {
      stored.current = { ...stored.current, needsDisclosure: false }
      void writeStored(stored.current)
    }
  }, [])

  return <SessionContext.Provider value={{ ...state, refresh, setDisclosed }}>{children}</SessionContext.Provider>
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used within a SessionProvider')
  return session
}
