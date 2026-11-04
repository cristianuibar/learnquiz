import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import type { TopicPath } from '@learnquiz/api/progress'
import { api, ApiError } from './api'
import { getToken } from './auth'
import { topicPathUrl } from './path'
import { useSession } from './session-store'

export type TopicPathStatus = 'loading' | 'ready' | 'offline' | 'error'

type Loaded = {
  token: string | null
  topicId: string | null
  path: TopicPath | null
  status: TopicPathStatus
}

const empty: Loaded = { token: null, topicId: null, path: null, status: 'loading' }

// A request that never got an HTTP response (network, timeout) is offline;
// any server response that failed is an error.
export function pathFailure(error: unknown): 'offline' | 'error' {
  return error instanceof ApiError && error.status === null ? 'offline' : 'error'
}

// Whether a loaded value belongs on screen: it must have been fetched under
// the current token and for the topic being shown.
export function ownsPath(loaded: Pick<Loaded, 'token' | 'topicId'>, token: string | null, topicId: string | null): boolean {
  return token !== null && topicId !== null && loaded.token === token && loaded.topicId === topicId
}

// GET /topics/:topicId/path, refetched on every arrival at the tab. A refetch
// keeps the loaded path on screen (no skeleton flash); only the first load for
// a token and topic starts empty. A response is applied only while the screen
// is focused and the token that sent it is still current.
export function useTopicPath(topicId: string | null): {
  path: TopicPath | null
  status: TopicPathStatus
  // The token the shown path was fetched under, or null when none is shown.
  owner: string | null
  retry: () => void
} {
  const { status: sessionStatus } = useSession()
  const token = getToken()
  const [loaded, setLoaded] = useState<Loaded>(empty)
  const [attempt, setAttempt] = useState(0)
  // Render-phase guard: another token's or topic's path is never shown, even
  // before the focus effect below has run.
  const current = sessionStatus === 'ready' && ownsPath(loaded, token, topicId)

  useFocusEffect(useCallback(() => {
    if (!token || !topicId || sessionStatus !== 'ready') return
    const controller = new AbortController()
    const active = () => !controller.signal.aborted && getToken() === token
    setLoaded((previous) => ownsPath(previous, token, topicId) ? previous : { token, topicId, path: null, status: 'loading' })
    api<TopicPath>(topicPathUrl(topicId), { signal: controller.signal }).then(
      (path) => {
        if (active()) setLoaded({ token, topicId, path, status: 'ready' })
      },
      (error: unknown) => {
        // A 401 is owned by auth, which signs out.
        if (!active() || (error instanceof ApiError && error.status === 401)) return
        setLoaded((previous) => ownsPath(previous, token, topicId)
          ? { ...previous, status: pathFailure(error) }
          : { token, topicId, path: null, status: pathFailure(error) })
      },
    )
    return () => controller.abort()
  }, [token, topicId, sessionStatus, attempt]))

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return { path: current ? loaded.path : null, status: current ? loaded.status : 'loading', owner: current ? loaded.token : null, retry }
}
