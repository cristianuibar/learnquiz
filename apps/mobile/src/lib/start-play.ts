// Pure request/lifecycle module for the session Loading screen. Screens own
// all UI state; this module only starts the session, maps errors to copy,
// and drives navigation through injected effects.

import { offlineBody, offlineTitle, slowAfterMs, startFailed } from '@learnquiz/api/system-copy'
import { ApiError, api } from './api'

export interface StartPlayParams {
  topicId: string
  start: 'session' | 'placement'
  unitId?: string
}

export interface StartFailure {
  title?: string
  message: string
  retry: boolean
  retryLabel?: 'Retry'
}

export interface StartPlayEffects {
  onSlow(): void
  onFailure(failure: StartFailure): void
  onReady(): void
  replace(path: `/play/${string}` | '/(tabs)/today'): void
  dismissAll(): void
}

export interface StartPlayHandle {
  cancel(): void
  dispose(): void
  done: Promise<void>
}

const START_TIMEOUT_MS = 250_000

export async function startPlay(params: StartPlayParams, signal?: AbortSignal): Promise<string | undefined> {
  if (signal?.aborted) return undefined
  const topic = encodeURIComponent(params.topicId)
  const path = params.start === 'placement' ? `/topics/${topic}/placement` : `/topics/${topic}/sessions`
  const body = params.unitId === undefined ? {} : { unitId: params.unitId }
  try {
    const data = await api<{ sessionId?: unknown } | null>(path, {
      method: 'POST',
      body,
      timeoutMs: START_TIMEOUT_MS,
      signal,
    })
    // Aborted while the response was in flight: there is no session to land on.
    if (signal?.aborted) return undefined
    if (typeof data?.sessionId !== 'string' || !data.sessionId.trim()) {
      throw new ApiError(200, startFailed)
    }
    return data.sessionId
  } catch (error) {
    if (signal?.aborted) return undefined
    throw error
  }
}

export function describeStartFailure(error: unknown): StartFailure {
  if (error instanceof ApiError && error.reason === 'timeout') {
    return {
      title: 'Still preparing',
      message: 'Your questions are taking longer than usual. Try again in a moment.',
      retry: true,
      retryLabel: 'Retry',
    }
  }
  if (error instanceof ApiError && error.status !== null) {
    if (error.status >= 500 || (error.status >= 200 && error.status < 300)) {
      return { message: startFailed, retry: true }
    }
    return { message: error.message, retry: false }
  }
  return { title: offlineTitle, message: offlineBody, retry: true }
}

export function beginStartPlay(params: StartPlayParams, effects: StartPlayEffects): StartPlayHandle {
  const controller = new AbortController()
  // Failure leaves the screen open, so Cancel must still work after an error.
  let closed = false
  const timer = setTimeout(() => {
    if (!closed) effects.onSlow()
  }, slowAfterMs(params.start))

  const done = startPlay(params, controller.signal).then(
    (sessionId) => {
      if (closed) return
      closed = true
      clearTimeout(timer)
      if (sessionId === undefined) return
      effects.replace(`/play/${encodeURIComponent(sessionId)}`)
      effects.onReady()
    },
    (error: unknown) => {
      if (closed) return
      clearTimeout(timer)
      effects.onFailure(describeStartFailure(error))
    },
  )

  return {
    cancel() {
      if (closed) return
      closed = true
      controller.abort()
      clearTimeout(timer)
      effects.dismissAll()
      effects.replace('/(tabs)/today')
    },
    dispose() {
      if (closed) return
      closed = true
      controller.abort()
      clearTimeout(timer)
    },
    done,
  }
}
