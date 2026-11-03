// endSession() against the merged sign-out: the real auth, push (#500), api, kv
// and session store, with fresh module state per test. Only the native stores
// and fetch are fakes.
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('expo-sqlite/kv-store', () => {
  const values = new Map<string, string>()
  return { AsyncStorage: {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value) },
    removeItemAsync: async (key: string) => values.delete(key),
    getAllKeysAsync: async () => [...values.keys()],
  } }
})

type Modules = {
  auth: typeof import('./auth')
  kv: typeof import('./kv')
  store: typeof import('./session-store')
  secure: jest.Mocked<typeof import('expo-secure-store')>
}

// A phone where learner A is signed in and enrolled in push: the bearer and the
// Expo push token in SecureStore, the registration marker in kv, plus private data.
async function enrolledPhone(pushTokenRead: () => Promise<string | null>) {
  // A fresh registry, so push's lazy require('./auth') sees this test's auth module.
  jest.resetModules()
  const m: Modules = { secure: require('expo-secure-store'), auth: require('./auth'), kv: require('./kv'), store: require('./session-store') }
  m.secure.getItemAsync.mockImplementation(async (key: string) => (key === 'lq.token' ? 'token-a' : pushTokenRead()))
  m.secure.setItemAsync.mockResolvedValue()
  m.secure.deleteItemAsync.mockResolvedValue()
  await m.kv.clearPrefix('')
  await m.kv.setJSON('lq:push-token', true)
  await m.kv.setJSON('lq:today:user-a', { cached: 'Ana' })
  const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) =>
    ({ ok: true, status: 200, text: async () => '{}', headers: { get: () => null } }) as unknown as Response)
  globalThis.fetch = fetchMock as unknown as typeof fetch
  await expect(m.auth.loadToken()).resolves.toBe('token-a')
  const events = jest.fn()
  m.auth.subscribeAuth(events)
  const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path))
  return { ...m, events, calls }
}

test('a push unregistration that hangs on the keystore still signs the learner out', async () => {
  // The merged signOut() waits on this read before any local cleanup.
  const phone = await enrolledPhone(() => new Promise(() => {}))
  await expect(phone.store.endSession(30)).resolves.toBeUndefined()

  expect(phone.auth.getToken()).toBeNull()
  expect(phone.events.mock.calls).toEqual([['signedOut']])
  expect(phone.secure.deleteItemAsync).toHaveBeenCalledWith('lq.token')
  // The bearer is still revoked on the server, sent while it was current.
  const [revocation] = phone.calls('/api/auth/sign-out')
  expect(revocation?.[1]?.headers).toMatchObject({ Authorization: 'Bearer token-a' })
})

test('a working push unregistration signs out once, through the normal path', async () => {
  const phone = await enrolledPhone(async () => 'ExponentPushToken[abc]')
  await phone.store.endSession(1_000)

  expect(phone.auth.getToken()).toBeNull()
  expect(phone.events.mock.calls).toEqual([['signedOut']])
  expect(phone.calls('/api/v1/push/expo')).toHaveLength(1)
  expect(phone.calls('/api/auth/sign-out')).toHaveLength(1)
  expect(phone.secure.deleteItemAsync).toHaveBeenCalledWith('lq.token')
  await expect(phone.kv.getJSON('lq:today:user-a')).resolves.toBeNull()
})
