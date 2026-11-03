import type { Today } from '@learnquiz/api/today'
import { todayFixtures } from '@learnquiz/api/today'
import type { Branding } from './session-store'
import { setJSON } from './kv'
import { loadTodayCache, saveTodayCache, todayCacheKey } from './today-cache'

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
  AsyncStorage: {
    getItemAsync(k: string): Promise<string | null>
    setItemAsync(k: string, v: string): Promise<void>
    __store: Map<string, string>
  }
}

const today: Today = { topic: null, role: null, plan: null }
const branding: Branding = { name: 'Acme', logoUrl: null, accent: '#fff' }
const NOW = Date.parse('2026-03-10T12:00:00.000Z')

beforeEach(() => {
  AsyncStorage.__store.clear()
  jest.restoreAllMocks()
})

test('round-trips Today and branding for same user and day', async () => {
  await saveTodayCache('u1', today, branding, NOW)
  await expect(loadTodayCache('u1', NOW)).resolves.toEqual({
    userId: 'u1',
    day: '2026-03-10',
    today,
    branding,
  })
})

test('round-trips every supported plan and building state', async () => {
  for (const plan of Object.values(todayFixtures)) {
    await saveTodayCache('u1', plan, branding, NOW)
    await expect(loadTodayCache('u1', NOW)).resolves.toMatchObject({ today: plan })
  }
})

test('round-trips null branding', async () => {
  await saveTodayCache('u1', today, null, NOW)
  await expect(loadTodayCache('u1', NOW)).resolves.toEqual({
    userId: 'u1',
    day: '2026-03-10',
    today,
    branding: null,
  })
})

test('returns null for a different user', async () => {
  await saveTodayCache('u1', today, branding, NOW)
  await expect(loadTodayCache('u1', NOW)).resolves.not.toBeNull()
  await expect(loadTodayCache('u2', NOW)).resolves.toBeNull()
})

test('fails closed on mismatching envelope identity under requested key', async () => {
  await setJSON(todayCacheKey('u1'), { userId: 'intruder', day: '2026-03-10', today, branding })
  await expect(loadTodayCache('u1', NOW)).resolves.toBeNull()
})

test('returns null for a previous UTC day', async () => {
  await saveTodayCache('u1', today, branding, NOW - 86_400_000)
  await expect(loadTodayCache('u1', NOW)).resolves.toBeNull()
})

test('UTC boundary: late-night save is stale after midnight', async () => {
  const before = Date.parse('2026-03-10T23:59:00.000Z')
  const after = Date.parse('2026-03-11T00:01:00.000Z')
  await saveTodayCache('u1', today, branding, before)
  await expect(loadTodayCache('u1', after)).resolves.toBeNull()
  await expect(loadTodayCache('u1', before + 30_000)).resolves.not.toBeNull()
})

test('returns null for malformed cache payloads', async () => {
  AsyncStorage.__store.set(todayCacheKey('u1'), 'not-json{{{')
  await expect(loadTodayCache('u1', NOW)).resolves.toBeNull()
  await setJSON(todayCacheKey('u1'), { userId: 'u1', day: '2026-03-10' })
  await expect(loadTodayCache('u1', NOW)).resolves.toBeNull()
  await setJSON(todayCacheKey('u1'), { userId: 'u1', day: '2026-03-10', today: { nope: 1 }, branding })
  await expect(loadTodayCache('u1', NOW)).resolves.toBeNull()
  await setJSON(todayCacheKey('u1'), { userId: 'u1', day: '2026-03-10', today, branding: { name: 42 } })
  await expect(loadTodayCache('u1', NOW)).resolves.toBeNull()
  for (const malformed of [
    { topic: { id: 1 }, role: 2, plan: 3 },
    { ...todayFixtures.normal, topic: [] },
    { ...todayFixtures.normal, role: { ...todayFixtures.normal.role, building: { ready: '5', total: 10 } } },
    { ...todayFixtures.normal, plan: { ...todayFixtures.normal.plan, state: 'unknown' } },
    { ...todayFixtures.normal, plan: { ...todayFixtures.normal.plan, sessionSize: '20' } },
  ]) {
    await setJSON(todayCacheKey('u1'), { userId: 'u1', day: '2026-03-10', today: malformed, branding })
    await expect(loadTodayCache('u1', NOW)).resolves.toBeNull()
  }
})

test('storage failures do not throw: load returns null, save resolves', async () => {
  await saveTodayCache('u1', today, branding, NOW)
  jest.spyOn(AsyncStorage, 'getItemAsync').mockRejectedValueOnce(new Error('get failed'))
  await expect(loadTodayCache('u1', NOW)).resolves.toBeNull()
  jest.spyOn(AsyncStorage, 'setItemAsync').mockRejectedValueOnce(new Error('set failed'))
  await expect(saveTodayCache('u1', today, branding, NOW)).resolves.toBeUndefined()
})
