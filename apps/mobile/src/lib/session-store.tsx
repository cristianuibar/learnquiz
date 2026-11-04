import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import type { Branding, SessionResponse, SessionUser } from '@learnquiz/api'
import { api, ApiError, authCall } from './api'
import { getToken, handleUnauthorized, loadToken, signOut, subscribeAuth } from './auth'
import { releaseReplayHolds } from './held-target'
import * as kv from './kv'
import { setPushUser } from './push'
import { tokenFingerprint } from './token-fingerprint'

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
// Internal: the bearer each state was built for. A ready state is only ever
// exposed while that bearer is still the live token.
type Held = State & { bearer: string | null }
const signedOut: Held = { status: 'signedOut', user: null, needsDisclosure: false, branding: null, bearer: null }
const loading: Held = { ...signedOut, status: 'loading' }
const SessionContext = createContext<Session | null>(null)

// The last session the server confirmed, bound to the bearer it was confirmed
// under: owner is a fingerprint of that token, never the token. It is an `lq:`
// key, so sign-out and 401 cleanup erase it with the rest of the learner's data.
const SESSION_KEY = 'lq:session'
type SessionView = Pick<SessionResponse, 'needsDisclosure'> & { user: SessionUser; branding: Branding | null }
type StoredSession = SessionView & { owner: string }

// Moves on sign-out and a 401 (both emit signedOut) and on a user switch, always
// before their cleanup. A save started under an older epoch never writes, so no
// learner's session can land after the cleanup that ended it.
let sessionEpoch = 0

function isStored(value: unknown): value is StoredSession {
  const record = value as Partial<StoredSession> | null
  return typeof record?.owner === 'string' && typeof record.user?.id === 'string'
}

async function readStored(): Promise<StoredSession | null> {
  try {
    const stored = await kv.getJSON<unknown>(SESSION_KEY)
    return isStored(stored) ? stored : null
  } catch {
    return null
  }
}

// The saved session only for the bearer it was saved under. Anything else (another
// bearer's, or no owner at all) is ignored and deleted best-effort, so a failed
// delete can never show one learner's session to another.
async function restoreStored(token: string): Promise<StoredSession | null> {
  let stored: unknown = null
  try { stored = await kv.getJSON<unknown>(SESSION_KEY) } catch { return null }
  if (isStored(stored) && stored.owner === tokenFingerprint(token)) return stored
  if (stored !== null) await kv.remove(SESSION_KEY).catch(() => {})
  return null
}

// Writes only while the epoch the save started under is current, checked right
// before the write. If the epoch moved while the write was in flight, the write
// is taken back (when it is still this bearer's record).
async function saveStored(token: string, view: SessionView, epoch: number): Promise<StoredSession> {
  const record: StoredSession = { ...view, owner: tokenFingerprint(token) }
  if (epoch !== sessionEpoch) return record
  try { await kv.setJSON(SESSION_KEY, record) } catch { return record }
  if (epoch !== sessionEpoch && (await readStored())?.owner === record.owner) {
    await kv.remove(SESSION_KEY).catch(() => {})
  }
  return record
}

// How long sign-out may wait on its own steps before the local session is cleared
// anyway. signOut() first unregisters push (the opt-in PR): a pending 5 s registration,
// then a 5 s DELETE, so a slow but working network stays under this.
export const SIGN_OUT_WAIT_MS = 12_000

// Settles when work settles or after ms, whichever comes first; never rejects.
async function within(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([work.catch(() => {}), new Promise<void>((resolve) => { timer = setTimeout(resolve, ms) })])
  clearTimeout(timer)
}

// Sign out from a screen. Never rejects, and never leaves the learner signed in:
// when signOut() rejects or stalls (a hung keystore or SQLite read during push
// unregistration) while the same bearer is still live, this revokes it on the
// server and clears the local session directly (token, lq: data, signedOut event).
export async function endSession(waitMs = SIGN_OUT_WAIT_MS): Promise<void> {
  const bearer = getToken()
  await within(signOut(), waitMs)
  // A cleared or newer bearer means sign-out already happened, or someone signed in since.
  if (bearer === null || getToken() !== bearer) return
  // signOut() skips its revocation once the session is cleared under it; send it while the bearer is current.
  void authCall('/sign-out', {}, { authenticated: true, timeoutMs: 5_000 }).catch(() => {})
  // The token and the signedOut event go synchronously; storage cleanup may share the stalled store.
  await within(handleUnauthorized(), waitMs)
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Held>(loading)
  const request = useRef(0)
  const stored = useRef<StoredSession | null>(null)
  const offline = useRef(false)
  const refresh = useCallback(async () => {
    const current = ++request.current
    let token: string | null = null
    let epoch = sessionEpoch
    const stale = () => current !== request.current || token !== getToken() || epoch !== sessionEpoch
    try {
      token = await loadToken()
      if (current !== request.current) return
      if (!token) { setState(signedOut); return }
      let session: Pick<SessionResponse, 'user' | 'needsDisclosure'>
      try {
        session = await api<SessionResponse>('/session')
      } catch (error) {
        if (stale()) return
        if (error instanceof ApiError && error.status === 401) { await handleUnauthorized(); return }
        // No signal or a server error: keep the token and show the signed-in shell.
        const last = await restoreStored(token)
        if (stale()) return
        stored.current = last
        offline.current = true
        setState({ status: 'ready', user: last?.user ?? null, needsDisclosure: last?.needsDisclosure ?? false,
          branding: last?.branding ?? null, offline: true, bearer: token })
        return
      }
      if (stale()) return
      if (!session.user) { await handleUnauthorized(); return }
      const user = session.user
      setPushUser(user.id)
      const last = await readStored()
      if (stale()) return
      // Another learner (or an unknown one) used this phone: end every older save
      // first, then drop their drafts and caches before this learner's screens read them.
      if (last?.user.id !== user.id) {
        epoch = ++sessionEpoch
        await kv.clearPrefix('lq:')
        if (stale()) return
      }
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
      const saved = await saveStored(token, next, epoch)
      if (stale()) return
      stored.current = saved
      offline.current = false
      setState({ status: 'ready', ...next, bearer: token })
    } catch {
      // Local storage failed (clearing another learner's data, or a 401's cleanup).
      // Never show the shell over data that may not belong to this learner.
      if (current === request.current) setState(signedOut)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeAuth((event) => {
      // Sign-out also ends every hold on held-link replay (an unfinished join).
      // Sign-out, a 401, or a new bearer (sign-in, sign-up, join accept): the epoch
      // moves before any cleanup or refresh, so no older save can land after it.
      sessionEpoch++
      stored.current = null
      offline.current = false
      // A new bearer leaves the previous session in this same tick, before any
      // render: nothing shows until /session confirms who this token belongs to.
      if (event !== 'signedOut') { request.current++; setState(loading) }
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
    const token = getToken()
    if (stored.current && token && stored.current.owner === tokenFingerprint(token)) {
      stored.current = { ...stored.current, needsDisclosure: false }
      void saveStored(token, stored.current, sessionEpoch)
    }
  }, [])

  // Render-time half of the invariant. auth sets the new token one microtask
  // before it emits 'changed', so a render in that gap must already hide the
  // previous bearer's session. getToken() is a synchronous in-memory read.
  const { bearer, ...view } = state.status === 'ready' && state.bearer !== getToken() ? loading : state
  return <SessionContext.Provider value={{ ...view, refresh, setDisclosed }}>{children}</SessionContext.Provider>
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used within a SessionProvider')
  return session
}
