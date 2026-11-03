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
let generation = 0
let cachedToken: string | null | undefined
let writes: Promise<unknown> = Promise.resolve()
const registrations = new Set<Promise<unknown>>()

function persist<T>(task: () => Promise<T>): Promise<T> {
  const next = writes.then(task, task)
  writes = next.catch(() => undefined)
  return next
}
function store(deps: PushDeps): PushStore { return deps.store ?? require('./kv') }
function secure(deps: PushDeps): PushSecureStore { return deps.secure ?? require('expo-secure-store') }
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
async function forget(deps: PushDeps, hadToken: boolean): Promise<void> {
  await persist(async () => {
    // A native write may have finished while cleanup waited for this queue.
    let shouldDelete = hadToken || cachedToken != null
    try { shouldDelete ||= enrolled(await store(deps).getJSON<unknown>(PUSH_TOKEN_KEY)) }
    catch { /* Continue with what is already known. */ }
    if (shouldDelete) {
      try { await secure(deps).deleteItemAsync(PUSH_SECURE_KEY) } catch { /* Logout still completes. */ }
    }
    cachedToken = null
    await removeMarker(deps)
  })
}
async function postToken(deps: PushDeps, token: string): Promise<void> {
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

export async function enablePush(deps: PushDeps = {}): Promise<EnableResult> {
  const gen = generation
  try {
    const isDevice = deps.isDevice ?? require('expo-device').isDevice
    const projectId = deps.projectId === undefined
      ? require('expo-constants').default?.expoConfig?.extra?.eas?.projectId
      : deps.projectId
    if (!isDevice || typeof projectId !== 'string' || !projectId) return 'unavailable'
    const bearer = authToken(deps)
    const notifications: PushNotifications = deps.notifications ?? require('expo-notifications')
    await notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
      name: 'Questions',
      importance: notifications.AndroidImportance.HIGH,
      lockscreenVisibility: notifications.AndroidNotificationVisibility.PUBLIC,
    })
    if (generation !== gen) return 'granted'
    const permission = await notifications.requestPermissionsAsync()
    if (permission.status !== 'granted') return 'denied'
    if (!current(deps, gen, bearer)) return 'granted'
    const { data: token } = await notifications.getExpoPushTokenAsync({ projectId })
    if (typeof token !== 'string' || !token) return 'unavailable'
    if (!current(deps, gen, bearer)) return 'granted'

    // Write the enrollment marker first, so cleanup can always find a saved token.
    // All writes and cleanup share a queue; deletion wins over late native writes.
    await persist(async () => {
      if (!current(deps, gen, bearer)) return
      await store(deps).setJSON(PUSH_TOKEN_KEY, { pending: true })
      try { await secure(deps).setItemAsync(PUSH_SECURE_KEY, token) }
      catch (error) { await removeMarker(deps); throw error }
      cachedToken = token
    })
    if (!current(deps, gen, bearer)) return 'granted'
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

export async function retryPendingPush(deps: PushDeps = {}): Promise<RetryResult> {
  const gen = generation
  try {
    const bearer = authToken(deps)
    if (!bearer) return 'idle'
    const marker = await store(deps).getJSON<unknown>(PUSH_TOKEN_KEY)
    if (!enrolled(marker) || marker === true || !current(deps, gen, bearer)) return 'idle'
    const token = await secure(deps).getItemAsync(PUSH_SECURE_KEY)
    if (!current(deps, gen, bearer)) return 'idle'
    if (!token) {
      await persist(() => generation === gen ? removeMarker(deps) : Promise.resolve())
      return 'unavailable'
    }
    cachedToken = token
    try { await postToken(deps, token) } catch { return 'granted' }
    await confirm(deps, gen, bearer)
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
  const knownToken = cachedToken
  generation++
  cachedToken = null
  if (knownToken === null) return null
  let marker: Promise<unknown>
  try { marker = store(deps).getJSON<unknown>(PUSH_TOKEN_KEY) }
  catch { return null }
  return (async () => {
    let endpoint = knownToken ?? null
    try {
      const enrolledHere = enrolled(await marker)
      // Finish an already sent PUT before DELETE so it cannot recreate the row.
      await Promise.allSettled([...registrations])
      await writes
      if (!endpoint && enrolledHere) endpoint = await secure(deps).getItemAsync(PUSH_SECURE_KEY)
      if (endpoint && authToken(deps)) {
        try {
          const body = { endpoint }
          if (deps.deleteExpoToken) await deps.deleteExpoToken(body, 5_000)
          else await require('./api').api('/push/expo', { method: 'DELETE', body, timeoutMs: 5_000 })
        } catch { /* Server failure never prevents local logout. */ }
      }
      await forget(deps, enrolledHere || endpoint != null)
    } catch {
      await forget(deps, endpoint != null)
    }
  })()
}

// Network-free, so a registration/DELETE 401 cannot deadlock its own cleanup.
export async function clearPushLocal(deps: PushDeps = {}): Promise<void> {
  const knownToken = cachedToken
  generation++
  cachedToken = null
  let hadToken = knownToken != null
  try { hadToken ||= enrolled(await store(deps).getJSON<unknown>(PUSH_TOKEN_KEY)) }
  catch { /* Missing or unreadable storage must not block auth cleanup. */ }
  await forget(deps, hadToken)
}
