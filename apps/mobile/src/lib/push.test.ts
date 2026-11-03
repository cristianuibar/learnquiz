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
afterEach(() => { globalThis.fetch = originalFetch })

function authHarness(marker: unknown = true) {
  jest.resetModules()
  const events: string[] = []
  const secure = memoryStrings({ 'lq.token': 'bearer', 'lq.push-token': 'ExponentPushToken[abc]' })
  const store = memoryStore(marker == null ? {} : { [PUSH_TOKEN_KEY]: marker })
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
    getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[abc]' })),
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
  await s.auth.loadToken()
  await s.auth.signOut()
  const [url, init] = s.fetch.mock.calls[0]
  expect(url).toMatch(/\/api\/v1\/push\/expo$/)
  expect(init).toMatchObject({ method: 'DELETE', headers: { Authorization: 'Bearer bearer' } })
  expect(JSON.parse(init.body as string)).toEqual({ endpoint: 'ExponentPushToken[abc]' })
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
  expect(s.store.data.get(PUSH_TOKEN_KEY)).toBe(true)
  expect(s.notifications.requestPermissionsAsync).not.toHaveBeenCalled()
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
