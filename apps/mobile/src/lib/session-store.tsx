import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { getToken, handleUnauthorized, loadToken, subscribeAuth } from './auth'
import { releaseReplayHolds } from './held-target'

export type SessionUser = { id: string; name: string; isAnonymous: boolean; role?: string | null }
export type Branding = { name: string; logoUrl: string | null; accent: string | null }
type State = {
  status: 'loading' | 'signedOut' | 'ready'
  user: SessionUser | null
  needsDisclosure: boolean
  branding: Branding | null
}
type Session = State & { refresh(): Promise<void>; setDisclosed(): void }
const signedOut: State = { status: 'signedOut', user: null, needsDisclosure: false, branding: null }
const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ ...signedOut, status: 'loading' })
  const request = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++request.current
    try {
      const token = await loadToken()
      if (current !== request.current) return
      if (!token) { setState(signedOut); return }
      const session = await api<{ user: SessionUser | null; needsDisclosure: boolean }>('/session')
      if (current !== request.current || token !== getToken()) return
      if (!session.user) { await handleUnauthorized(); return }
      const branding = await api<Branding | null>('/branding')
      if (current !== request.current || token !== getToken()) return
      setState({ status: 'ready', user: session.user, needsDisclosure: session.needsDisclosure, branding })
    } catch {
      // Resolve the startup gate even offline; retain the secure token for retry.
      if (current === request.current) setState(signedOut)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeAuth((event) => {
      // Sign-out also ends every hold on held-link replay (an unfinished join).
      if (event === 'signedOut') { request.current++; releaseReplayHolds(); setState(signedOut) }
      else void refresh()
    })
    void refresh()
    return () => { unsubscribe(); request.current++ }
  }, [refresh])

  const setDisclosed = useCallback(() => {
    setState((previous) => ({ ...previous, needsDisclosure: false }))
  }, [])

  return <SessionContext.Provider value={{ ...state, refresh, setDisclosed }}>{children}</SessionContext.Provider>
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used within a SessionProvider')
  return session
}
