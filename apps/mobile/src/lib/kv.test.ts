import { clearPrefix, getJSON, remove, setJSON } from './kv'

jest.mock('expo-sqlite/kv-store', () => {
  const store = new Map<string, string>()
  return {
    AsyncStorage: {
      async getItemAsync(key: string) {
        return store.has(key) ? (store.get(key) as string) : null
      },
      async setItemAsync(key: string, value: string) {
        store.set(key, value)
      },
      async removeItemAsync(key: string) {
        store.delete(key)
      },
      async getAllKeysAsync() {
        return [...store.keys()]
      },
      __store: store,
    },
  }
})

const { AsyncStorage } = jest.requireMock('expo-sqlite/kv-store') as {
  AsyncStorage: { __store: Map<string, string> }
}

beforeEach(() => {
  AsyncStorage.__store.clear()
})

test('round-trips a private draft object', async () => {
  await setJSON('lq:draft:abc', { answers: [1, 2], note: 'hi' })
  await expect(getJSON('lq:draft:abc')).resolves.toEqual({ answers: [1, 2], note: 'hi' })
})

test('round-trips the push token string', async () => {
  await setJSON('lq:push-token', 'ExponentPushToken[xyz]')
  await expect(getJSON<string>('lq:push-token')).resolves.toBe('ExponentPushToken[xyz]')
})

test('returns null for a missing key', async () => {
  await expect(getJSON('lq:missing')).resolves.toBeNull()
})

test('remove deletes only that key', async () => {
  await setJSON('lq:draft:a', { v: 1 })
  await setJSON('lq:draft:b', { v: 2 })
  await remove('lq:draft:a')
  await expect(getJSON('lq:draft:a')).resolves.toBeNull()
  await expect(getJSON('lq:draft:b')).resolves.toEqual({ v: 2 })
})

test('clearPrefix removes only matching keys, keeping unrelated data', async () => {
  await setJSON('lq:draft:1', { v: 1 })
  await setJSON('lq:push-token', 'tok')
  await setJSON('other-library:key', { keep: true })
  await setJSON('unrelated', 'x')
  await clearPrefix('lq:')
  await expect(getJSON('lq:draft:1')).resolves.toBeNull()
  await expect(getJSON('lq:push-token')).resolves.toBeNull()
  await expect(getJSON('other-library:key')).resolves.toEqual({ keep: true })
  await expect(getJSON('unrelated')).resolves.toBe('x')
})
