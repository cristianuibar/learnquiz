import { tokenFingerprint } from './token-fingerprint'
import { PUSH_TOKEN_KEY, SKIPS_KEY, readPromptCounts, recordSkip } from './push-prompt'

jest.mock('./kv', () => ({ getJSON: jest.fn(), setJSON: jest.fn(), remove: jest.fn() }))

type PushModule = typeof import('./push')

function loadPush(): PushModule {
  let push!: PushModule
  jest.isolateModules(() => {
    push = require('./push')
  })
  return push
}

function memoryStrings(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial))
  return {
    data,
    getItemAsync: jest.fn(async (key: string) => data.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      data.set(key, value)
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      data.delete(key)
    }),
  }
}

function memoryStore(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial))
  return {
    data,
    async getJSON<T>(key: string): Promise<T | null> { return (data.get(key) ?? null) as T | null },
    setJSON: jest.fn(async (key: string, value: unknown) => {
      data.set(key, value)
    }),
    remove: jest.fn(async (key: string) => {
      data.delete(key)
    }),
  }
}

function setup(overrides: {
  permission?: string
  isDevice?: boolean
  projectId?: string | null
  authed?: boolean
  timezone?: string
  putFails?: boolean
  deleteFails?: boolean
  secureInitial?: Record<string, string>
  storeInitial?: Record<string, unknown>
} = {}) {
  const push = loadPush()
  const order: string[] = []
  const notifications = {
    AndroidImportance: { HIGH: 'high-mock' },
    AndroidNotificationVisibility: { PUBLIC: 'public-mock' },
    setNotificationChannelAsync: jest.fn(async () => {
      order.push('channel')
    }),
    requestPermissionsAsync: jest.fn(async () => {
      order.push('permission')
      return { status: overrides.permission ?? 'granted' }
    }),
    getPermissionsAsync: jest.fn(async () => ({ status: overrides.permission ?? 'granted' })),
    getExpoPushTokenAsync: jest.fn(async (): Promise<{ data: unknown }> => {
      order.push('token')
      return { data: 'ExponentPushToken[abc]' }
    }),
  }
  const secure = memoryStrings(overrides.secureInitial)
  const store = memoryStore(overrides.storeInitial)
  const putExpoToken = jest.fn(async () => {
    order.push('post')
    if (overrides.putFails) throw new Error('Offline')
    return { subscribed: true }
  })
  const deleteExpoToken = jest.fn(async () => {
    if (overrides.deleteFails) throw new Error('Offline')
    return { subscribed: false }
  })
  const deps = {
    notifications,
    isDevice: overrides.isDevice ?? true,
    projectId: overrides.projectId === undefined ? 'proj-1' : overrides.projectId,
    secure,
    store,
    putExpoToken,
    deleteExpoToken,
    getAuthToken: (): string | null => ((overrides.authed ?? true) ? 'bearer' : null),
    timezone: overrides.timezone ?? 'America/New_York',
  }
  return { push, order, notifications, secure, store, putExpoToken, deleteExpoToken, deps }
}

test('secure key is derived without a colon', () => {
  const push = loadPush()
  expect(push.PUSH_SECURE_KEY).toBe(PUSH_TOKEN_KEY.replace(/:/g, '.'))
  expect(push.PUSH_SECURE_KEY).not.toContain(':')
})

test('enable order is channel -> permission -> token -> post', async () => {
  const { push, order, notifications, putExpoToken, secure, store, deps } = setup()
  await expect(push.enablePush(deps)).resolves.toBe('granted')
  expect(order).toEqual(['channel', 'permission', 'token', 'post'])
  expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('questions', {
    name: 'Questions',
    importance: 'high-mock',
    lockscreenVisibility: 'public-mock',
  })
  expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-1' })
  expect(putExpoToken).toHaveBeenCalledWith({ token: 'ExponentPushToken[abc]', timezone: 'America/New_York' })
  expect(secure.data.get(push.PUSH_SECURE_KEY)).toBe('ExponentPushToken[abc]')
  expect(store.data.get(PUSH_TOKEN_KEY)).toBe(true)
  expect(await readPromptCounts(store)).toMatchObject({ registered: true })
})

test('denied posts nothing and stores nothing', async () => {
  const { push, notifications, putExpoToken, secure, store, deps } = setup({ permission: 'denied' })
  await expect(push.enablePush(deps)).resolves.toBe('denied')
  expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled()
  expect(putExpoToken).not.toHaveBeenCalled()
  expect(secure.data.size).toBe(0)
  expect(store.data.get(PUSH_TOKEN_KEY)).toBeUndefined()
})

test.each([
  ['not a device', { isDevice: false }],
  ['missing project id', { projectId: null }],
])('unavailable quietly when %s', async (_name, overrides) => {
  const { push, notifications, putExpoToken, deps } = setup(overrides)
  await expect(push.enablePush(deps)).resolves.toBe('unavailable')
  expect(notifications.setNotificationChannelAsync).not.toHaveBeenCalled()
  expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled()
  expect(putExpoToken).not.toHaveBeenCalled()
})

test('failed post keeps the secure token, marks pending, resolves granted', async () => {
  const { push, secure, store, deps } = setup({ putFails: true })
  await expect(push.enablePush(deps)).resolves.toBe('granted')
  expect(secure.data.get(push.PUSH_SECURE_KEY)).toBe('ExponentPushToken[abc]')
  expect(store.data.get(PUSH_TOKEN_KEY)).toEqual({ pending: true })
  expect(await readPromptCounts(store)).toMatchObject({ registered: true })
})

test('pending token retries on the next foreground, including after restart', async () => {
  const first = setup({ putFails: true })
  await expect(first.push.enablePush(first.deps)).resolves.toBe('granted')

  // Simulate a process restart: fresh module state, same persisted stores.
  const second = setup({
    storeInitial: Object.fromEntries(first.store.data),
    secureInitial: Object.fromEntries(first.secure.data),
  })
  expect(second.store.data.get(PUSH_TOKEN_KEY)).toEqual({ pending: true })
  await expect(second.push.retryPendingPush(second.deps)).resolves.toBe('granted')
  expect(second.putExpoToken).toHaveBeenCalledWith({
    token: 'ExponentPushToken[abc]',
    timezone: 'America/New_York',
  })
  expect(second.store.data.get(PUSH_TOKEN_KEY)).toBe(true)
})

test('retry is idle with nothing pending or without an authenticated user', async () => {
  const idle = setup()
  await expect(idle.push.retryPendingPush(idle.deps)).resolves.toBe('idle')
  expect(idle.putExpoToken).not.toHaveBeenCalled()

  const pending = setup({ putFails: true })
  await pending.push.enablePush(pending.deps)
  const signedOut = { ...pending.deps, getAuthToken: (): string | null => null }
  await expect(pending.push.retryPendingPush(signedOut)).resolves.toBe('idle')
  expect(pending.putExpoToken).toHaveBeenCalledTimes(1)
  expect(pending.store.data.get(PUSH_TOKEN_KEY)).toEqual({ pending: true })
})

test('recordSkip uses SKIPS_KEY counts', async () => {
  const store = memoryStore()
  expect(await recordSkip(store)).toBe(1)
  expect(await recordSkip(store)).toBe(2)
  expect(store.data.get(SKIPS_KEY)).toBe(2)
  expect(await readPromptCounts(store)).toMatchObject({ skips: 2 })
})

test('unregister deletes on the server then clears locally', async () => {
  const { push, secure, store, deleteExpoToken, deps } = setup()
  await push.enablePush(deps)
  await expect(push.unregisterPush(deps)).resolves.toBeUndefined()
  expect(deleteExpoToken).toHaveBeenCalledWith({ endpoint: 'ExponentPushToken[abc]' }, 5000)
  expect(secure.data.get(push.PUSH_SECURE_KEY)).toBeUndefined()
  expect(store.data.get(PUSH_TOKEN_KEY)).toBeUndefined()
  expect(await readPromptCounts(store)).toMatchObject({ registered: false })
})

test('unregister still clears locally when the DELETE fails', async () => {
  const { push, secure, store, deleteExpoToken, deps } = setup({ deleteFails: true })
  await push.enablePush(deps)
  await expect(push.unregisterPush(deps)).resolves.toBeUndefined()
  expect(deleteExpoToken).toHaveBeenCalledTimes(1)
  expect(secure.data.get(push.PUSH_SECURE_KEY)).toBeUndefined()
  expect(store.data.get(PUSH_TOKEN_KEY)).toBeUndefined()
})

test('unregister with no token performs no network call', async () => {
  const { push, deleteExpoToken, deps } = setup()
  await expect(push.unregisterPush(deps)).resolves.toBeUndefined()
  expect(deleteExpoToken).not.toHaveBeenCalled()
})

test('unregister returns null once known empty, so signOut stays synchronous', async () => {
  const { push, deleteExpoToken, deps } = setup()
  await push.enablePush(deps)
  await expect(push.unregisterPush(deps)).resolves.toBeUndefined()
  expect(push.unregisterPush(deps)).toBeNull()
  expect(deleteExpoToken).toHaveBeenCalledTimes(1)
})

test('unregister after a restart still deletes via storage (cold path)', async () => {
  const first = setup()
  await first.push.enablePush(first.deps)
  const second = setup({
    secureInitial: Object.fromEntries(first.secure.data),
    storeInitial: Object.fromEntries(first.store.data),
  })
  await expect(second.push.unregisterPush(second.deps)).resolves.toBeUndefined()
  expect(second.deleteExpoToken).toHaveBeenCalledWith({ endpoint: 'ExponentPushToken[abc]' }, 5000)
  expect(second.secure.data.size).toBe(0)
})

test('unregister skips the DELETE without a bearer but still forgets', async () => {
  const { push, secure, store, deleteExpoToken, deps } = setup({ authed: false })
  await push.enablePush({ ...deps, getAuthToken: () => 'bearer' })
  await expect(push.unregisterPush(deps)).resolves.toBeUndefined()
  expect(deleteExpoToken).not.toHaveBeenCalled()
  expect(secure.data.get(push.PUSH_SECURE_KEY)).toBeUndefined()
  expect(store.data.get(PUSH_TOKEN_KEY)).toBeUndefined()
})

test('clearPushLocal drops the marker and secure token for the 401 path', async () => {
  const { push, secure, store, deps } = setup()
  await push.enablePush(deps)
  await push.clearPushLocal(deps)
  expect(secure.data.size).toBe(0)
  expect(store.data.get(PUSH_TOKEN_KEY)).toBeUndefined()
})

test('late enable work after logout never restores or registers', async () => {
  const { push, notifications, putExpoToken, secure, store, deps } = setup()
  let releasePermission!: (status: { status: string }) => void
  notifications.requestPermissionsAsync.mockImplementationOnce(
    () => new Promise((resolve) => {
      releasePermission = resolve
    }),
  )
  const enabling = push.enablePush(deps)
  // Wait until the permission request is in flight, then sign out.
  for (let i = 0; i < 100 && notifications.requestPermissionsAsync.mock.calls.length === 0; i++) {
    await Promise.resolve()
  }
  expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1)
  await push.clearPushLocal(deps)
  releasePermission({ status: 'granted' })
  await expect(enabling).resolves.toBe('granted')
  expect(putExpoToken).not.toHaveBeenCalled()
  expect(secure.data.size).toBe(0)
  expect(store.data.get(PUSH_TOKEN_KEY)).toBeUndefined()
})

test.each([
  ['channel setup throws', (s: ReturnType<typeof setup>) => s.notifications.setNotificationChannelAsync.mockRejectedValueOnce(new Error('native'))],
  ['permission request throws', (s: ReturnType<typeof setup>) => s.notifications.requestPermissionsAsync.mockRejectedValueOnce(new Error('native'))],
  ['token lookup throws', (s: ReturnType<typeof setup>) => s.notifications.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('native'))],
])('enablePush contains native errors: %s', async (_name, breakIt) => {
  const s = setup()
  breakIt(s)
  await expect(s.push.enablePush(s.deps)).resolves.toBe('unavailable')
})

test('token lookup returning nothing is unavailable', async () => {
  const s = setup()
  s.notifications.getExpoPushTokenAsync.mockResolvedValueOnce({ data: null })
  await expect(s.push.enablePush(s.deps)).resolves.toBe('unavailable')
  expect(s.putExpoToken).not.toHaveBeenCalled()
})

test('secure-store failure during enable is contained', async () => {
  const s = setup()
  s.secure.setItemAsync.mockRejectedValueOnce(new Error('locked'))
  await expect(s.push.enablePush(s.deps)).resolves.toBe('unavailable')
  expect(s.putExpoToken).not.toHaveBeenCalled()
})

test('marker storage failure after a confirmed post still resolves granted', async () => {
  const s = setup()
  s.store.setJSON
    .mockImplementationOnce(async (key, value) => { s.store.data.set(key, value) })
    .mockRejectedValueOnce(new Error('disk'))
  await expect(s.push.enablePush(s.deps)).resolves.toBe('granted')
  expect(s.secure.data.get(s.push.PUSH_SECURE_KEY)).toBe('ExponentPushToken[abc]')
  expect(s.store.data.get(PUSH_TOKEN_KEY)).toEqual({ pending: true })
})

test('initial marker failure stores no token and posts nothing', async () => {
  const s = setup()
  s.store.setJSON.mockRejectedValueOnce(new Error('disk'))
  await expect(s.push.enablePush(s.deps)).resolves.toBe('unavailable')
  expect(s.secure.data.size).toBe(0)
  expect(s.putExpoToken).not.toHaveBeenCalled()
})

test('pushStatus reports permission, registration and token', async () => {
  const s = setup()
  await expect(s.push.pushStatus(s.deps)).resolves.toEqual({
    permission: 'granted',
    registered: false,
    token: null,
  })
  await s.push.enablePush(s.deps)
  await expect(s.push.pushStatus(s.deps)).resolves.toEqual({
    permission: 'granted',
    registered: true,
    token: 'ExponentPushToken[abc]',
  })
})

test('pushStatus contains storage and permission errors', async () => {
  const s = setup()
  s.notifications.getPermissionsAsync.mockRejectedValueOnce(new Error('native'))
  s.secure.getItemAsync.mockRejectedValueOnce(new Error('locked'))
  await expect(s.push.pushStatus(s.deps)).resolves.toEqual({
    permission: 'undetermined',
    registered: false,
    token: null,
  })
})

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
  jest.useRealTimers()
  jest.restoreAllMocks()
})

function authHarness(marker: unknown = true) {
  jest.resetModules()
  const events: string[] = []
  const secure = memoryStrings({ 'lq.token': 'bearer', 'lq.push-token': 'ExponentPushToken[abc]' })
  const store = memoryStore({
    ...(marker == null ? {} : { [PUSH_TOKEN_KEY]: marker }),
    // The confirmed session survives a process restart, then is erased by 401.
    'lq:session': { user: { id: 'learner-a', name: 'Ana', isAnonymous: false }, needsDisclosure: false, branding: null, owner: tokenFingerprint('bearer') },
  })
  const clearPrefix = jest.fn(async (prefix: string) => {
    for (const key of store.data.keys()) if (key.startsWith(prefix)) store.data.delete(key)
  })
  const originalDelete = secure.deleteItemAsync.getMockImplementation()!
  secure.deleteItemAsync.mockImplementation(async (key) => {
    events.push(`clear:${key}`)
    await originalDelete(key)
  })
  let foreground!: (state: string) => void
  const source = {
    addEventListener: jest.fn((_event: string, listener: (state: string) => void) => {
      foreground = listener
      return { remove: jest.fn() }
    }),
  }
  const notifications = {
    AndroidImportance: { HIGH: 6 },
    AndroidNotificationVisibility: { PUBLIC: 1 },
    setNotificationChannelAsync: jest.fn(async () => null),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    getExpoPushTokenAsync: jest.fn(async (): Promise<{ data: unknown }> => ({ data: 'ExponentPushToken[abc]' })),
  }
  jest.doMock('expo-secure-store', () => secure)
  jest.doMock('./kv', () => ({ ...store, clearPrefix }))
  jest.doMock('react-native', () => ({ AppState: source }))
  jest.doMock('expo-device', () => ({ isDevice: true }))
  jest.doMock('expo-constants', () => ({ default: { expoConfig: { extra: { eas: { projectId: 'project-349' } } } } }))
  jest.doMock('expo-notifications', () => notifications)
  let auth!: typeof import('./auth')
  let push!: PushModule
  let client!: typeof import('./api')
  auth = require('./auth')
  push = require('./push')
  client = require('./api')
  const fetch = jest.fn(async (_url: string, init: RequestInit) => {
    events.push(init.method ?? 'GET')
    return jsonResponse(200, {})
  })
  globalThis.fetch = fetch as typeof globalThis.fetch
  return { auth, push, client, secure, store, events, fetch, notifications, source, foreground }
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status < 400, status, text: async () => JSON.stringify(body), headers: { get: () => null } } as unknown as Response
}

async function flush() { for (let i = 0; i < 60; i++) await Promise.resolve() }

test('real signOut unregisters a restored token with its bearer before clearing it', async () => {
  const s = authHarness()
  const api = jest.spyOn(s.client, 'api')
  await s.auth.loadToken()
  await s.auth.signOut()
  const [url, init] = s.fetch.mock.calls[0]
  expect(url).toMatch(/\/api\/v1\/push\/expo$/)
  expect(init).toMatchObject({ method: 'DELETE', headers: { Authorization: 'Bearer bearer' } })
  expect(JSON.parse(init.body as string)).toEqual({ endpoint: 'ExponentPushToken[abc]' })
  expect(api).toHaveBeenCalledWith('/push/expo', {
    method: 'DELETE', body: { endpoint: 'ExponentPushToken[abc]' }, timeoutMs: 5_000,
  })
  expect(s.events.indexOf('DELETE')).toBeLessThan(s.events.indexOf('clear:lq.push-token'))
  expect(s.events.indexOf('clear:lq.push-token')).toBeLessThan(s.events.indexOf('POST'))
  expect(s.auth.getToken()).toBeNull()
  expect(s.secure.data.size).toBe(0)
  expect(await readPromptCounts(s.store)).toMatchObject({ registered: false })
})

test('real 401 cleanup removes the secure push token locally without a DELETE', async () => {
  const s = authHarness()
  await s.auth.loadToken()
  s.fetch.mockImplementation(async () => jsonResponse(401, { error: 'Expired' }))
  await expect(s.client.api('/today')).rejects.toMatchObject({ status: 401 })
  expect(s.auth.getToken()).toBeNull()
  expect(s.secure.data.size).toBe(0)
  expect(s.store.data.has(PUSH_TOKEN_KEY)).toBe(false)
  expect(s.fetch).toHaveBeenCalledTimes(1)
})

test('a registration 401 cannot deadlock cleanup or restore its pending marker', async () => {
  const s = authHarness(null)
  s.secure.data.delete('lq.push-token')
  await s.auth.loadToken()
  s.fetch.mockImplementation(async () => jsonResponse(401, { error: 'Expired' }))
  await expect(s.push.enablePush()).resolves.toBe('granted')
  expect(s.auth.getToken()).toBeNull()
  expect(s.secure.data.size).toBe(0)
  expect(s.store.data.has(PUSH_TOKEN_KEY)).toBe(false)
})

test('auth startup wires foreground retry after restart without requesting permission', async () => {
  const s = authHarness({ pending: true })
  const api = jest.spyOn(s.client, 'api')
  await s.auth.loadToken()
  expect(s.source.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  expect(s.notifications.requestPermissionsAsync).not.toHaveBeenCalled()
  s.foreground('background')
  await flush()
  expect(s.fetch).not.toHaveBeenCalled()
  s.foreground('active')
  s.foreground('active')
  await flush()
  expect(s.fetch).toHaveBeenCalledTimes(1)
  expect(s.fetch.mock.calls[0][1]).toMatchObject({ method: 'PUT', headers: { Authorization: 'Bearer bearer' } })
  expect(s.fetch.mock.calls[0][0]).toMatch(/\/api\/v1\/push\/expo$/)
  const body = { token: 'ExponentPushToken[abc]', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC' }
  expect(JSON.parse(s.fetch.mock.calls[0][1].body as string)).toEqual(body)
  expect(api).toHaveBeenCalledWith('/push/expo', { method: 'PUT', body, timeoutMs: 5_000 })
  expect(s.store.data.get(PUSH_TOKEN_KEY)).toBe(true)
  expect(s.notifications.requestPermissionsAsync).not.toHaveBeenCalled()
})

test('enable sends the real PUT payload with a five-second API timeout', async () => {
  const s = authHarness(null)
  s.secure.data.delete('lq.push-token')
  const api = jest.spyOn(s.client, 'api')
  await s.auth.loadToken()
  await expect(s.push.enablePush()).resolves.toBe('granted')
  const body = { token: 'ExponentPushToken[abc]', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC' }
  expect(api).toHaveBeenCalledWith('/push/expo', { method: 'PUT', body, timeoutMs: 5_000 })
  expect(s.fetch.mock.calls[0][0]).toMatch(/\/api\/v1\/push\/expo$/)
  expect(s.fetch.mock.calls[0][1]).toMatchObject({ method: 'PUT', headers: { Authorization: 'Bearer bearer' } })
  expect(JSON.parse(s.fetch.mock.calls[0][1].body as string)).toEqual(body)
})

test('late failed registration cannot restore a marker after logout', async () => {
  const s = setup()
  let rejectPost!: (error: Error) => void
  s.putExpoToken.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectPost = reject }))
  const enabling = s.push.enablePush(s.deps)
  await flush()
  expect(s.putExpoToken).toHaveBeenCalledTimes(1)
  await s.push.clearPushLocal(s.deps)
  rejectPost(new Error('Offline'))
  await enabling
  expect(s.secure.data.size).toBe(0)
  expect(s.store.data.has(PUSH_TOKEN_KEY)).toBe(false)
})

test('cleanup wins over a SecureStore write already in flight', async () => {
  const s = setup()
  let finishWrite!: () => void
  s.secure.setItemAsync.mockImplementationOnce((key, value) => new Promise((resolve) => {
    finishWrite = () => { s.secure.data.set(key, value); resolve() }
  }))
  const enabling = s.push.enablePush(s.deps)
  await flush()
  expect(s.secure.setItemAsync).toHaveBeenCalledTimes(1)
  const clearing = s.push.clearPushLocal(s.deps)
  finishWrite()
  await Promise.all([enabling, clearing])
  expect(s.secure.data.size).toBe(0)
  expect(s.store.data.has(PUSH_TOKEN_KEY)).toBe(false)
  expect(s.putExpoToken).not.toHaveBeenCalled()
})

test('unregister waits for an in-flight PUT before deleting the server subscription', async () => {
  const s = setup()
  let finishPost!: () => void
  s.putExpoToken.mockImplementationOnce(() => new Promise((resolve) => {
    finishPost = () => resolve({ subscribed: true })
  }))
  const enabling = s.push.enablePush(s.deps)
  await flush()
  expect(s.putExpoToken).toHaveBeenCalledTimes(1)
  const removing = s.push.unregisterPush(s.deps)
  await flush()
  expect(s.deleteExpoToken).not.toHaveBeenCalled()
  finishPost()
  await Promise.all([enabling, removing])
  expect(s.deleteExpoToken).toHaveBeenCalledTimes(1)
  expect(s.secure.data.size).toBe(0)
  expect(s.store.data.has(PUSH_TOKEN_KEY)).toBe(false)
})

test('signOut still clears local credentials if DELETE returns 401', async () => {
  const s = authHarness()
  await s.auth.loadToken()
  s.fetch.mockImplementation(async () => jsonResponse(401, { error: 'Expired' }))
  await s.auth.signOut()
  expect(s.auth.getToken()).toBeNull()
  expect(s.secure.data.size).toBe(0)
  expect(s.store.data.has(PUSH_TOKEN_KEY)).toBe(false)
})

test.each(['rejects', 'returns no token'])('foreground recovers after granted token lookup %s', async (failure) => {
  const s = authHarness(null)
  s.secure.data.delete('lq.push-token')
  await s.auth.loadToken()
  if (failure === 'rejects') s.notifications.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('FCM unavailable'))
  else s.notifications.getExpoPushTokenAsync.mockResolvedValueOnce({ data: null })
  await expect(s.push.enablePush()).resolves.toBe('unavailable')
  expect(await readPromptCounts(s.store)).toMatchObject({ registered: true })
  s.foreground('active')
  await flush()
  expect(s.notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2)
  expect(s.notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1)
  expect(s.fetch).toHaveBeenCalledTimes(1)
  expect(s.fetch.mock.calls[0][1].method).toBe('PUT')
  expect(s.store.data.get(PUSH_TOKEN_KEY)).toBe(true)
  expect(s.secure.data.get('lq.push-token')).toBe('ExponentPushToken[abc]')
})

test('foreground token recovery stops after three failed attempts, including after restart', async () => {
  const s = setup()
  s.notifications.getExpoPushTokenAsync.mockRejectedValue(new Error('FCM unavailable'))
  await s.push.enablePush(s.deps)
  let active!: (state: string) => void
  const source = { addEventListener: (_event: string, listener: (state: string) => void) => {
    active = listener
    return { remove: jest.fn() }
  } }
  s.push.observePushForeground(source, s.deps)
  for (let i = 0; i < 5; i++) { active('active'); await flush() }
  expect(s.notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(4)
  expect(s.putExpoToken).not.toHaveBeenCalled()
  expect(await readPromptCounts(s.store)).toMatchObject({ registered: true })
  const restarted = setup({ storeInitial: Object.fromEntries(s.store.data) })
  await expect(restarted.push.retryPendingPush(restarted.deps)).resolves.toBe('idle')
  expect(restarted.notifications.getExpoPushTokenAsync).not.toHaveBeenCalled()
})

test('a foreground event with a confirmed marker never PUTs again', async () => {
  const s = authHarness(true)
  await s.auth.loadToken()
  s.foreground('active')
  await flush()
  expect(s.fetch).not.toHaveBeenCalled()
  expect(s.notifications.getExpoPushTokenAsync).not.toHaveBeenCalled()
  expect(s.store.data.get(PUSH_TOKEN_KEY)).toBe(true)
})

test('enable deadline stops native work but keeps a late permission grant for recovery', async () => {
  jest.useFakeTimers()
  const s = setup()
  let finishPermission!: (value: { status: string }) => void
  s.notifications.requestPermissionsAsync.mockImplementationOnce(() => new Promise((resolve) => { finishPermission = resolve }))
  const enabling = s.push.enablePush(s.deps)
  await flush()
  await jest.advanceTimersByTimeAsync(15_000)
  await expect(enabling).resolves.toBe('unavailable')
  finishPermission({ status: 'granted' })
  await flush()
  expect(s.notifications.getExpoPushTokenAsync).not.toHaveBeenCalled()
  expect(s.putExpoToken).not.toHaveBeenCalled()
  expect(s.store.data.get(PUSH_TOKEN_KEY)).toEqual({ pending: true })
})

async function expiredPhone(warm = false) {
  const s = authHarness()
  await s.auth.loadToken()
  if (warm) {
    s.fetch.mockImplementation(async () => jsonResponse(200, { token: 'bearer', user: { id: 'learner-a' } }))
    await s.auth.signIn('learner@example.com', 'password')
    await s.push.enablePush()
  }
  s.fetch.mockImplementation(async () => jsonResponse(401, { error: 'Expired' }))
  await expect(s.client.api('/today')).rejects.toMatchObject({ status: 401 })
  expect(s.auth.getToken()).toBeNull()
  expect(s.secure.data.size).toBe(0)
  expect(s.store.data.has(PUSH_TOKEN_KEY)).toBe(false)
  expect(s.store.data.has('lq:session')).toBe(false)
  return s
}

test('signOut can unregister after 401 cleanup and reauthentication', async () => {
  // Cold: no token has been cached in push.ts during this process. Recover its
  // owner from the saved session before real auth.ts erases all lq: data.
  const s = await expiredPhone()
  s.fetch.mockImplementation(async () => jsonResponse(200, { token: 'renewed-bearer', user: { id: 'learner-a' } }))
  await s.auth.signIn('learner@example.com', 'password')
  await s.auth.signOut()
  const deletion = s.fetch.mock.calls.find(([, init]) => init.method === 'DELETE')
  expect(deletion).toBeDefined()
  expect(deletion![0]).toMatch(/\/api\/v1\/push\/expo$/)
  expect(deletion![1].headers).toMatchObject({ Authorization: 'Bearer renewed-bearer' })
  expect(JSON.parse(deletion![1].body as string)).toEqual({ endpoint: 'ExponentPushToken[abc]' })
  expect(s.secure.data.size).toBe(0)
})

test.each([
  { warm: true, userId: 'learner-a', deletes: true },
  { warm: false, userId: 'learner-b', deletes: false },
  { warm: true, userId: 'learner-b', deletes: false },
])('401 then sign-in and sign-out enforces learner ownership (warm: $warm, user: $userId)', async ({ warm, userId, deletes }) => {
  const s = await expiredPhone(warm)
  s.fetch.mockImplementation(async () => jsonResponse(200, { token: 'renewed-bearer', user: { id: userId } }))
  await s.auth.signIn(`${userId}@example.com`, 'password')
  await s.auth.signOut()
  const deletions = s.fetch.mock.calls.filter(([, init]) => init.method === 'DELETE')
  expect(deletions).toHaveLength(deletes ? 1 : 0)
  if (deletes) {
    expect(deletions[0][1].headers).toMatchObject({ Authorization: 'Bearer renewed-bearer' })
    expect(JSON.parse(deletions[0][1].body as string)).toEqual({ endpoint: 'ExponentPushToken[abc]' })
  }
  expect(s.auth.getToken()).toBeNull()
  expect(s.secure.data.size).toBe(0)
})

test('a sign-in without a confirmed learner cannot delete the retained endpoint', async () => {
  const s = await expiredPhone()
  s.fetch.mockImplementation(async () => jsonResponse(200, { token: 'renewed-bearer' }))
  await s.auth.signIn('learner@example.com', 'password')
  await s.auth.signOut()
  expect(s.fetch.mock.calls.some(([, init]) => init.method === 'DELETE')).toBe(false)
})

test('network PUT failures back off and remain retryable beyond the token budget', async () => {
  jest.useFakeTimers({ now: Date.UTC(2035, 1, 4, 12) })
  const s = setup({ putFails: true })
  await s.push.enablePush(s.deps)
  expect(s.notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1)
  for (const delay of [15_000, 30_000, 60_000, 120_000]) {
    await expect(s.push.retryPendingPush(s.deps)).resolves.toBe('granted')
    expect(s.store.data.get(PUSH_TOKEN_KEY)).toMatchObject({ pending: true, attempts: 0 })
    const count = s.putExpoToken.mock.calls.length
    await expect(s.push.retryPendingPush(s.deps)).resolves.toBe('idle')
    expect(s.putExpoToken).toHaveBeenCalledTimes(count)
    await jest.advanceTimersByTimeAsync(delay)
  }
  expect(s.putExpoToken).toHaveBeenCalledTimes(5)
  s.putExpoToken.mockResolvedValueOnce({ subscribed: true })
  await expect(s.push.retryPendingPush(s.deps)).resolves.toBe('granted')
  expect(s.putExpoToken).toHaveBeenCalledTimes(6)
  expect(s.notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1)
  expect(s.store.data.get(PUSH_TOKEN_KEY)).toBe(true)
})

test('token failure budget resets after its time window, even across restart', async () => {
  jest.useFakeTimers({ now: Date.UTC(2035, 1, 4, 12) })
  const s = setup()
  s.notifications.getExpoPushTokenAsync.mockRejectedValue(new Error('FCM unavailable'))
  await s.push.enablePush(s.deps)
  for (let i = 0; i < 3; i++) await s.push.retryPendingPush(s.deps)
  await expect(s.push.retryPendingPush(s.deps)).resolves.toBe('idle')
  const restarted = setup({ storeInitial: Object.fromEntries(s.store.data) })
  await expect(restarted.push.retryPendingPush(restarted.deps)).resolves.toBe('idle')
  await jest.advanceTimersByTimeAsync(60 * 60_000)
  await expect(restarted.push.retryPendingPush(restarted.deps)).resolves.toBe('granted')
  expect(restarted.notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1)
  expect(restarted.store.data.get(PUSH_TOKEN_KEY)).toBe(true)
})

test('a working token resets token failures before an offline PUT', async () => {
  const s = setup({ putFails: true, storeInitial: { [PUSH_TOKEN_KEY]: { pending: true, attempts: 2 } } })
  await expect(s.push.retryPendingPush(s.deps)).resolves.toBe('granted')
  expect(s.store.data.get(PUSH_TOKEN_KEY)).toMatchObject({ pending: true, attempts: 0, networkFailures: 1 })
})

test('foreground token hangs time out and a later foreground retries successfully', async () => {
  jest.useFakeTimers({ now: Date.UTC(2035, 1, 4, 12) })
  const s = setup({ storeInitial: { [PUSH_TOKEN_KEY]: { pending: true } } })
  let finishToken!: (value: { data: string }) => void
  s.notifications.getExpoPushTokenAsync.mockImplementationOnce(() => new Promise((resolve) => { finishToken = resolve }))
  let active!: (state: string) => void
  s.push.observePushForeground({ addEventListener: (_event, listener) => {
    active = listener
    return { remove: jest.fn() }
  } }, s.deps)
  active('active')
  await flush()
  expect(s.notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1)
  await jest.advanceTimersByTimeAsync(15_000)
  active('active')
  await flush()
  expect(s.notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2)
  expect(s.putExpoToken).toHaveBeenCalledTimes(1)
  expect(s.store.data.get(PUSH_TOKEN_KEY)).toBe(true)
  finishToken({ data: 'ExponentPushToken[stale]' })
  await flush()
  expect(s.secure.data.get(s.push.PUSH_SECURE_KEY)).toBe('ExponentPushToken[abc]')
  expect(s.putExpoToken).toHaveBeenCalledTimes(1)
})

test.each([false, true])('retained unregister endpoint cannot move to another learner (warm: %s)', async (warm) => {
  const s = setup()
  s.push.setPushUser('learner-a')
  if (warm) await s.push.enablePush(s.deps)
  else {
    s.secure.data.set(s.push.PUSH_SECURE_KEY, 'ExponentPushToken[abc]')
    s.store.data.set(PUSH_TOKEN_KEY, true)
  }
  await s.push.clearPushLocal(s.deps)
  s.push.setPushUser('learner-b')
  await s.push.unregisterPush({ ...s.deps, getAuthToken: () => 'another-users-bearer' })
  expect(s.deleteExpoToken).not.toHaveBeenCalled()
  expect(s.secure.data.size).toBe(0)
})

test('retained endpoint unregisters for the same learner with a renewed bearer', async () => {
  const s = setup()
  await s.push.enablePush(s.deps)
  await s.push.clearPushLocal(s.deps)
  await s.push.unregisterPush({ ...s.deps, getAuthToken: () => 'renewed-bearer' })
  expect(s.deleteExpoToken).toHaveBeenCalledWith({ endpoint: 'ExponentPushToken[abc]' }, 5000)
})


test('a legacy exhausted marker gets a fresh bounded token retry window', async () => {
  const s = setup({ storeInitial: { [PUSH_TOKEN_KEY]: { pending: true, attempts: 3 } } })
  await expect(s.push.retryPendingPush(s.deps)).resolves.toBe('granted')
  expect(s.notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1)
  expect(s.store.data.get(PUSH_TOKEN_KEY)).toBe(true)
})


test('a learner change while unregister waits never deletes the previous endpoint', async () => {
  const s = setup()
  s.push.setPushUser('learner-a')
  let finishPost!: () => void
  s.putExpoToken.mockImplementationOnce(() => new Promise((resolve) => {
    finishPost = () => resolve({ subscribed: true })
  }))
  const enabling = s.push.enablePush(s.deps)
  await flush()
  const removing = s.push.unregisterPush(s.deps)
  await flush()
  s.push.setPushUser('learner-b')
  finishPost()
  await Promise.all([enabling, removing])
  expect(s.deleteExpoToken).not.toHaveBeenCalled()
})
