// The only network call site in the Android app. Every screen reaches the
// backend through api(), authCall() or postForm() below, so auth headers,
// timeouts and 401 handling stay in one place.
//
// Integration contract (owned by ./auth, imported here): getToken() is a
// synchronous hydrated cache of the session token, and handleUnauthorized()
// clears the token, drops local per-user state and routes to sign-in. This
// module never touches storage itself.

import { getToken, handleUnauthorized } from './auth'

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://app.learnquiz.com'

const DEFAULT_TIMEOUT_MS = 90_000

export class ApiError extends Error {
  status: number | null
  constructor(status: number | null, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface ApiOptions {
  method?: string
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

export interface AuthCallOptions {
  method?: string
  // Credential failures report ApiError without invalidating a session.
  // Other auth endpoints handle 401s like api()/postForm() by default.
  authenticated?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

export interface AuthResult<T> {
  data: T
  // Better Auth bearer plugin returns the session token in this header.
  token: string | null
}

export interface MediaSource {
  uri: string
  headers: Record<string, string>
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (typeof record.error === 'string' && record.error) return record.error
    // Better Auth error shape fallback.
    if (typeof record.message === 'string' && record.message) return record.message
  }
  return `Request failed with status ${status}`
}

let unauthorizedInFlight: Promise<void> | null = null

function noteUnauthorized(requestToken: string | null): Promise<void> {
  // A stale 401 must not invalidate a newer session: only act when the token
  // is unchanged since this request sent it.
  if (getToken() !== requestToken) return Promise.resolve()
  // Concurrent 401s for the same invalid session share one handler call.
  const current = unauthorizedInFlight
  if (current) return current
  // Storage failure must not replace the response's structured ApiError. The
  // auth handler resets in-memory state before attempting persistent cleanup.
  const next = handleUnauthorized().catch(() => {})
  unauthorizedInFlight = next
  return next.finally(() => {
    if (unauthorizedInFlight === next) unauthorizedInFlight = null
  })
}

interface CoreArgs {
  method: string
  content: { kind: 'json'; text: string } | { kind: 'form'; form: FormData } | { kind: 'none' }
  timeoutMs: number
  signal?: AbortSignal
  // False for unauthenticated auth endpoints (sign-in/sign-up): their 401
  // means bad credentials, not an invalid session.
  routeUnauthorized: boolean
}

// Single network call site: api(), authCall() and postForm() all funnel here.
async function request<T>(url: string, args: CoreArgs): Promise<{ data: T; token: string | null }> {
  const requestToken = getToken()
  const headers: Record<string, string> = {}
  if (args.content.kind === 'json') headers['Content-Type'] = 'application/json'
  if (requestToken) headers.Authorization = `Bearer ${requestToken}`
  // Never send Origin: Better Auth would then enforce origin checks and break
  // local and early-production sign-in.

  // Timeout aborts even when the caller also passed a signal: both feed one
  // internal controller, so either can abort the fetch.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, args.timeoutMs)
  const abort = () => controller.abort()
  if (args.signal?.aborted) abort()
  else args.signal?.addEventListener('abort', abort, { once: true })

  try {
    const response = await fetch(url, {
      method: args.method,
      headers,
      body: args.content.kind === 'json' ? args.content.text
        : args.content.kind === 'form' ? args.content.form
        : undefined,
      credentials: 'omit',
      signal: controller.signal,
    })
    if (response.status === 401 && args.routeUnauthorized) await noteUnauthorized(requestToken)

    // Keep the timeout active while the body downloads, too.
    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try { payload = JSON.parse(text) }
      catch {
        if (response.ok) throw new ApiError(response.status, 'Invalid JSON response')
      }
    }
    if (!response.ok) throw new ApiError(response.status, errorMessage(payload, response.status))
    return { data: payload as T, token: response.headers.get('set-auth-token') }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(
      null,
      timedOut
        ? `Request timed out after ${args.timeoutMs} ms`
        : args.signal?.aborted
          ? 'Request was aborted'
          : 'Network request failed',
    )
  } finally {
    clearTimeout(timer)
    args.signal?.removeEventListener('abort', abort)
  }
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method, body, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options
  const { data } = await request<T>(`${API_URL}/api/v1${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    content: body === undefined ? { kind: 'none' } : { kind: 'json', text: JSON.stringify(body) },
    timeoutMs,
    signal,
    routeUnauthorized: true,
  })
  return data
}

export async function authCall<T>(
  path: string,
  body?: unknown,
  options: AuthCallOptions = {},
): Promise<AuthResult<T>> {
  const { method, authenticated = !['/sign-in/email', '/sign-up/email'].includes(path), timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options
  return request<T>(`${API_URL}/api/auth${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    content: body === undefined ? { kind: 'none' } : { kind: 'json', text: JSON.stringify(body) },
    timeoutMs,
    signal,
    routeUnauthorized: authenticated,
  })
}

export async function postForm<T>(
  path: string,
  form: FormData,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<T> {
  // No Content-Type header: fetch sets the multipart boundary itself.
  const { data } = await request<T>(`${API_URL}/api/v1${path}`, {
    method: 'POST',
    content: { kind: 'form', form },
    timeoutMs,
    signal,
    routeUnauthorized: true,
  })
  return data
}

// expo-image source for relative, member-only media (company logos, media).
export function mediaSource(relativeUrl: string): MediaSource {
  const token = getToken()
  return {
    uri: `${API_URL}${relativeUrl}`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }
}
