import { PUSH_TOKEN_KEY, type PushPermission } from './push-prompt'

export type EnableResult = 'granted' | 'denied' | 'unavailable'
export type RetryResult = EnableResult | 'idle'
export interface PushNotifications {
  AndroidImportance: { HIGH: unknown }
  AndroidNotificationVisibility: { PUBLIC: unknown }
  setNotificationChannelAsync(id: string, channel: {
    name: string; importance: unknown; lockscreenVisibility: unknown
  }): Promise<unknown>
  requestPermissionsAsync(): Promise<{ status: string }>
  getPermissionsAsync(): Promise<{ status: string }>
  getExpoPushTokenAsync(options: { projectId: string }): Promise<{ data: unknown }>
}
export interface PushSecureStore {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}
export interface PushStore {
  getJSON<T>(key: string): Promise<T | null>
  setJSON(key: string, value: unknown): Promise<void>
  remove?(key: string): Promise<void>
}
export interface PushDeps {
  notifications?: PushNotifications
  isDevice?: boolean
  projectId?: string | null
  secure?: PushSecureStore
  store?: PushStore
  putExpoToken?: (body: { token: string; timezone: string }) => Promise<unknown>
  deleteExpoToken?: (body: { endpoint: string }, timeoutMs: number) => Promise<unknown>
  getAuthToken?: () => string | null
  timezone?: string
}
export interface PushState {
  permission: PushPermission
  registered: boolean
  token: string | null
}

// SecureStore forbids colons. Only a non-secret registration marker goes in kv
// under Summary's existing key: true when confirmed, { pending: true } for retry.
export const PUSH_SECURE_KEY = PUSH_TOKEN_KEY.replace(/:/g, '.')
export const PUSH_CHANNEL_ID = 'questions'
const ENABLE_TIMEOUT_MS = 15_000
const MAX_FOREGROUND_RETRIES = 3
const RETRY_WINDOW_MS = 60 * 60_000
const RETRY_BACKOFF_MS = 15_000
let generation = 0
let cachedToken: string | null | undefined
// Keep only in memory after a 401; local storage still clears immediately.
let unregisterToken: { endpoint: string; bearer: string } | null = null
let writes: Promise<unknown> = Promise.resolve()
const registrations = new Set<Promise<unknown>>()

function persist<T>(task: () => Promise<T>): Promise<T> {
  const next = writes.then(task, task)
  writes = next.catch(() => undefined)
  return next
}
function store(deps: PushDeps): PushStore { return deps.store ?? require('./kv') }
function secure(deps: PushDeps): PushSecureStore { return deps.secure ?? require('expo-secure-store') }
function projectId(deps: PushDeps): string | null {
  const id = deps.projectId === undefined
    ? require('expo-constants').default?.expoConfig?.extra?.eas?.projectId
    : deps.projectId
  return (deps.isDevice ?? require('expo-device').isDevice) && typeof id === 'string' && id ? id : null
}
function authToken(deps: PushDeps): string | null {
  return deps.getAuthToken ? deps.getAuthToken() : require('./auth').getToken()
}
function timezone(deps: PushDeps): string {
  try { return deps.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC' }
  catch { return 'UTC' }
}
function enrolled(marker: unknown): boolean {
  return marker === true || (!!marker && typeof marker === 'object' && (marker as { pending?: unknown }).pending === true)
}
function current(deps: PushDeps, gen: number, bearer: string | null): boolean {
  return generation === gen && bearer != null && authToken(deps) === bearer
}
async function removeMarker(deps: PushDeps): Promise<void> {
  try { await store(deps).remove?.(PUSH_TOKEN_KEY) } catch { /* Best effort on logout. */ }
}
async function forget(deps: PushDeps, hadToken: boolean, keepForUnregister: string | null = null): Promise<void> {
  await persist(async () => {
    // A native write may have finished while cleanup waited for this queue.
    let shouldDelete = hadToken || cachedToken != null
    try { shouldDelete ||= enrolled(await store(deps).getJSON<unknown>(PUSH_TOKEN_KEY)) }
    catch { /* Continue with what is already known. */ }
    if (shouldDelete) {
      if (keepForUnregister) {
        rememberForUnregister(keepForUnregister, cachedToken)
        try { rememberForUnregister(keepForUnregister, await secure(deps).getItemAsync(PUSH_SECURE_KEY)) }
        catch { /* Keep any endpoint already known in memory. */ }
      }
      try { await secure(deps).deleteItemAsync(PUSH_SECURE_KEY) } catch { /* Logout still completes. */ }
    }
    cachedToken = null
    await removeMarker(deps)
  })
}
function rememberForUnregister(bearer: string | null, endpoint: string | null | undefined): void {
  if (endpoint && bearer) unregisterToken = { endpoint, bearer }
}
async function postToken(deps: PushDeps, token: string): Promise<void> {
  rememberForUnregister(authToken(deps), token)
  const body = { token, timezone: timezone(deps) }
  const request = Promise.resolve().then(() => deps.putExpoToken
    ? deps.putExpoToken(body)
    : require('./api').api('/push/expo', { method: 'PUT', body, timeoutMs: 5_000 }))
  registrations.add(request)
  try { await request } finally { registrations.delete(request) }
}
async function confirm(deps: PushDeps, gen: number, bearer: string | null): Promise<void> {
  await persist(async () => {
    if (current(deps, gen, bearer)) await store(deps).setJSON(PUSH_TOKEN_KEY, true)
  }).catch(() => undefined) // Pending remains durable if confirmation cannot be written.
}

async function fetchAndSaveToken(deps: PushDeps, gen: number, bearer: string | null, signal?: AbortSignal): Promise<string | null> {
  const id = projectId(deps)
  if (!id) return null
  const notifications: PushNotifications = deps.notifications ?? require('expo-notifications')
  const { data: token } = await notifications.getExpoPushTokenAsync({ projectId: id })
  if (typeof token !== 'string' || !token || signal?.aborted || !current(deps, gen, bearer)) return null
  await persist(async () => {
    if (signal?.aborted || !current(deps, gen, bearer)) return
    await secure(deps).setItemAsync(PUSH_SECURE_KEY, token)
    cachedToken = token
  })
  return !signal?.aborted && current(deps, gen, bearer) ? token : null
}

async function beforeDeadline<T extends RetryResult>(run: (signal: AbortSignal) => Promise<T>): Promise<T | 'unavailable'> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<'unavailable'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve('unavailable')
    }, ENABLE_TIMEOUT_MS)
  })
  try { return await Promise.race([run(controller.signal), deadline]) }
  finally { clearTimeout(timer) }
}

export async function enablePush(deps: PushDeps = {}): Promise<EnableResult> {
  const gen = generation
  return beforeDeadline((signal) => enableBeforeDeadline(deps, gen, signal))
}

async function enableBeforeDeadline(deps: PushDeps, gen: number, signal: AbortSignal): Promise<EnableResult> {
  try {
    if (!projectId(deps)) return 'unavailable'
    const bearer = authToken(deps)
    const notifications: PushNotifications = deps.notifications ?? require('expo-notifications')
    await notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
      name: 'Questions',
      importance: notifications.AndroidImportance.HIGH,
      lockscreenVisibility: notifications.AndroidNotificationVisibility.PUBLIC,
    })
    if (generation !== gen) return 'granted'
    if (signal.aborted) return 'unavailable'
    const permission = await notifications.requestPermissionsAsync()
    if (permission.status !== 'granted') return 'denied'
    if (!current(deps, gen, bearer)) return 'granted'
    // Permission is already granted even if FCM cannot produce a token yet.
    // Persist that intent before token acquisition so foreground can recover it.
    await persist(async () => {
      if (!current(deps, gen, bearer)) return
      await store(deps).setJSON(PUSH_TOKEN_KEY, { pending: true })
    })
    if (!current(deps, gen, bearer)) return 'granted'
    // A late permission grant still records intent, but only foreground retries
    // may continue the registration after this screen's deadline has expired.
    if (signal.aborted) return 'unavailable'
    const token = await fetchAndSaveToken(deps, gen, bearer, signal)
    if (!token) return 'unavailable'
    try { await postToken(deps, token) }
    catch { return 'granted' } // The pending token survives offline for foreground retry.
    await confirm(deps, gen, bearer)
    return 'granted'
  } catch {
    return 'unavailable'
  }
}

export async function pushStatus(deps: PushDeps = {}): Promise<PushState> {
  const gen = generation
  let permission: PushPermission = 'undetermined'
  let token: string | null = null
  try {
    const notifications: PushNotifications = deps.notifications ?? require('expo-notifications')
    const status = (await notifications.getPermissionsAsync()).status
    if (status === 'granted' || status === 'denied' || status === 'undetermined') permission = status
  } catch { /* Native permission lookup may be unavailable. */ }
  try { token = await secure(deps).getItemAsync(PUSH_SECURE_KEY) } catch { /* Treat unreadable as absent. */ }
  if (generation !== gen) token = null
  else if (token) cachedToken = token
  return { permission, registered: token != null, token }
}

type PendingRetry = { pending: true; attempts: number; resetAt: number; networkFailures: number; retryAt: number }

export async function retryPendingPush(deps: PushDeps = {}): Promise<RetryResult> {
  const gen = generation
  return beforeDeadline((signal) => retryBeforeDeadline(deps, gen, signal))
}

async function retryBeforeDeadline(deps: PushDeps, gen: number, signal: AbortSignal): Promise<RetryResult> {
  try {
    const bearer = authToken(deps)
    if (!bearer) return 'idle'
    const live = () => !signal.aborted && current(deps, gen, bearer)
    const retry = await persist(async () => {
      if (!live()) return null
      const marker = await store(deps).getJSON<Partial<PendingRetry> | true>(PUSH_TOKEN_KEY)
      if (!enrolled(marker) || marker === true) return null
      const pending = marker as Partial<PendingRetry>
      const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
      const now = Date.now()
      // Old markers have no window; start a fresh budget on migration.
      const resetAt = number(pending.resetAt) || now
      const attempts = resetAt <= now ? 0 : Math.floor(number(pending.attempts))
      if (number(pending.retryAt) > now) return null
      const token = await secure(deps).getItemAsync(PUSH_SECURE_KEY)
      if (!live() || (!token && attempts >= MAX_FOREGROUND_RETRIES)) return null
      const next: PendingRetry = {
        pending: true,
        // Only native token acquisition consumes the bounded budget. A cached
        // token can keep retrying PUT after arbitrarily many offline foregrounds.
        attempts: token ? 0 : attempts + 1,
        resetAt: resetAt <= now ? now + RETRY_WINDOW_MS : resetAt,
        networkFailures: number(pending.networkFailures),
        retryAt: 0,
      }
      await store(deps).setJSON(PUSH_TOKEN_KEY, next)
      return { token, marker: next }
    })
    if (!retry || !live()) return 'idle'
    let token = retry.token
    if (!token) token = await fetchAndSaveToken(deps, gen, bearer, signal)
    if (!token || !live()) return 'unavailable'
    cachedToken = token
    // A working token resets native failures, regardless of network availability.
    const marker = { ...retry.marker, attempts: 0, resetAt: Date.now() + RETRY_WINDOW_MS }
    await persist(async () => {
      if (live()) await store(deps).setJSON(PUSH_TOKEN_KEY, marker)
    })
    if (!live()) return 'idle'
    try { await postToken(deps, token) }
    catch {
      await persist(async () => {
        if (!live()) return
        const networkFailures = marker.networkFailures + 1
        await store(deps).setJSON(PUSH_TOKEN_KEY, {
          ...marker, networkFailures,
          retryAt: Date.now() + Math.min(15 * 60_000, RETRY_BACKOFF_MS * 2 ** Math.min(networkFailures - 1, 6)),
        })
      })
      return 'granted'
    }
    if (live()) await confirm(deps, gen, bearer)
    return 'granted'
  } catch {
    return 'unavailable'
  }
}

type ForegroundSource = {
  addEventListener(event: 'change', listener: (state: string) => void): { remove(): void }
}

// auth imports this at startup, so a pending registration also retries after restart.
export function observePushForeground(
  source: ForegroundSource = require('react-native').AppState,
  deps: PushDeps = {},
): { remove(): void } {
  let retrying = false
  return source.addEventListener('change', (state) => {
    if (state !== 'active' || retrying) return
    retrying = true
    void retryPendingPush(deps).finally(() => { retrying = false })
  })
}

// A synchronous empty result preserves immediate logout when storage is absent.
// Otherwise auth awaits this before clearing its bearer, including a cold restart.
export function unregisterPush(deps: PushDeps = {}): Promise<void> | null {
  const bearer = authToken(deps)
  // A retained endpoint after 401 may only be deleted by its original bearer.
  if (unregisterToken && unregisterToken.bearer !== bearer) unregisterToken = null
  const knownToken = cachedToken ?? unregisterToken?.endpoint ?? cachedToken
  generation++
  cachedToken = null
  if (knownToken === null) return null
  let marker: Promise<unknown>
  try { marker = store(deps).getJSON<unknown>(PUSH_TOKEN_KEY) }
  catch { return null }
  return (async () => {
    let endpoint = knownToken ?? null
    let attemptedDelete = false
    try {
      const enrolledHere = enrolled(await marker)
      // Finish an already sent PUT before DELETE so it cannot recreate the row.
      await Promise.allSettled([...registrations])
      await writes
      if (!endpoint && enrolledHere) endpoint = await secure(deps).getItemAsync(PUSH_SECURE_KEY)
      if (endpoint && authToken(deps)) {
        attemptedDelete = true
        try {
          const body = { endpoint }
          if (deps.deleteExpoToken) await deps.deleteExpoToken(body, 5_000)
          else await require('./api').api('/push/expo', { method: 'DELETE', body, timeoutMs: 5_000 })
        } catch { /* Server failure never prevents local logout. */ }
      }
      await forget(deps, enrolledHere || endpoint != null)
    } catch {
      await forget(deps, endpoint != null)
    } finally {
      if (attemptedDelete && unregisterToken?.endpoint === endpoint) unregisterToken = null
    }
  })()
}

// Network-free, so a registration/DELETE 401 cannot deadlock its own cleanup.
export async function clearPushLocal(deps: PushDeps = {}): Promise<void> {
  const knownToken = cachedToken
  const bearer = authToken(deps)
  rememberForUnregister(bearer, knownToken)
  generation++
  cachedToken = null
  let hadToken = knownToken != null
  try { hadToken ||= enrolled(await store(deps).getJSON<unknown>(PUSH_TOKEN_KEY)) }
  catch { /* Missing or unreadable storage must not block auth cleanup. */ }
  await forget(deps, hadToken, bearer)
}
